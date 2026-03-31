import "dotenv/config";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";
import { getSmtpConfigByIdForTenant } from "../dao/smtpDao";
import { buildLandingUrl, buildOpenPixelUrl } from "../lib/trainingLink";
import { getTenantPublicBaseUrl } from "../lib/tenantDomain";
import { stripHtml } from "./projectsShared";
import { enforceBlackTextForSend } from "./enforceBlackTextForSend";
import {
  getProjectForTenant,
  getProjectTargetsForTenant,
  getSendJobForTenant,
  getTargetsForTenant,
  getTemplateForTenant,
  getTrainingPageForTenant,
  updateProjectForTenant,
  updateProjectTargetForTenant,
  updateSendJobForTenant,
} from "../tenant/tenantStorage";
import {
  buildMailHtml,
  formatSendValidationError,
  validateProjectRuntimeSendConfig,
  validateTemplateForSend,
} from "./templateSendValidation";
import {
  formatRuntimeSendError,
  resolveRuntimeSendConfig,
  type RuntimeTransportConfig,
} from "./runtimeSmtpConfig";

const POLL_INTERVAL_MS = Number(process.env.SEND_WORKER_POLL_MS ?? 1500);
const RATE_LIMIT_MIN_MS = Number(process.env.SEND_WORKER_DELAY_MIN_MS ?? 200);
const RATE_LIMIT_MAX_MS = Number(process.env.SEND_WORKER_DELAY_MAX_MS ?? 400);
const MAX_ATTEMPTS = Number(process.env.SEND_WORKER_MAX_ATTEMPTS ?? 3);

type ClaimedJob = {
  id: string;
  tenantId: string;
};

type TransportSession = {
  config: RuntimeTransportConfig;
  transporter: Transporter | null;
};

const getPool = async () => {
  const { pool } = await import("../db");
  return pool;
};

const normalizeEnv = (value: string | undefined | null) => (value ?? "").trim();

const resolveRateLimitMs = () => {
  const min = Number.isFinite(RATE_LIMIT_MIN_MS) ? RATE_LIMIT_MIN_MS : 200;
  const max = Number.isFinite(RATE_LIMIT_MAX_MS) ? RATE_LIMIT_MAX_MS : 400;
  if (max <= min) return min;
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

type SmtpTransportOptions = {
  port: number;
  secure: boolean;
  requireTLS?: boolean;
};

const createSmtpTransporter = (
  config: RuntimeTransportConfig,
  options: SmtpTransportOptions,
) =>
  nodemailer.createTransport({
    host: config.host,
    port: options.port,
    secure: options.secure ?? config.secure,
    requireTLS: options.requireTLS ?? config.requireTLS,
    auth: config.user
      ? {
          user: config.user,
          pass: config.pass ?? "",
        }
      : undefined,
    tls: {
      rejectUnauthorized: !config.allowInvalidTls,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });

export const isSmtpConnectionError = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const typed = error as { code?: string; command?: string };
  if (typed.command === "CONN") return true;
  return ["ETIMEDOUT", "ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "ECONNRESET"].includes(
    typed.code ?? "",
  );
};

export const verifySmtpTransportWithFallback = async (
  config: RuntimeTransportConfig,
  createTransporter: (
    config: RuntimeTransportConfig,
    options: SmtpTransportOptions,
  ) => Transporter = createSmtpTransporter,
) => {
  const verifyTransport = async (options: SmtpTransportOptions) => {
    const transport = createTransporter(config, options);
    try {
      await transport.verify();
      return transport;
    } catch (error) {
      if (typeof transport.close === "function") {
        transport.close();
      }
      throw error;
    }
  };

  try {
    return await verifyTransport({
      port: config.port,
      secure: config.secure,
      requireTLS: config.requireTLS,
    });
  } catch (error) {
    if (config.port === 465 && isSmtpConnectionError(error)) {
      return verifyTransport({ port: 587, secure: false, requireTLS: true });
    }
    throw error;
  }
};

const getTransporter = async (session: TransportSession) => {
  if (!session.transporter) {
    session.transporter = await verifySmtpTransportWithFallback(session.config);
  }
  return session.transporter;
};

const closeTransporter = (session: TransportSession | null) => {
  if (!session?.transporter || typeof session.transporter.close !== "function") {
    return;
  }

  session.transporter.close();
  session.transporter = null;
};

const formatErrorMessage = (
  error: unknown,
  context?: { senderEmail?: string | null; transportSource?: RuntimeTransportConfig["source"] },
) => formatRuntimeSendError(error, context);

const sendMailWithFallback = async (
  session: TransportSession,
  mailOptions: SendMailOptions,
) => {
  const transporter = await getTransporter(session);
  try {
    return await transporter.sendMail(mailOptions);
  } catch (error) {
    if (!isSmtpConnectionError(error)) {
      throw error;
    }

    closeTransporter(session);
    const retriedTransporter = await getTransporter(session);
    if (retriedTransporter === transporter) {
      throw error;
    }
    return retriedTransporter.sendMail(mailOptions);
  }
};

const claimNextJob = async (): Promise<ClaimedJob | null> => {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT id, tenant_id AS "tenantId"
       FROM send_jobs
       WHERE status = 'queued'
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
    );
    const row = result.rows[0] as ClaimedJob | undefined;
    if (!row) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query(
      `UPDATE send_jobs
       SET status = 'running', started_at = NOW()
       WHERE id = $1`,
      [row.id],
    );
    await client.query("COMMIT");
    return row;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const recordJobFailure = async (
  tenantId: string,
  jobId: string,
  attempts: number,
  error: unknown,
) => {
  const message = formatErrorMessage(error);
  const nextAttempts = attempts + 1;
  if (nextAttempts >= MAX_ATTEMPTS) {
    await updateSendJobForTenant(tenantId, jobId, {
      status: "failed",
      attempts: nextAttempts,
      lastError: message,
      finishedAt: new Date(),
    });
    return;
  }
  await updateSendJobForTenant(tenantId, jobId, {
    status: "queued",
    attempts: nextAttempts,
    lastError: message,
    startedAt: null,
  });
};

const processJob = async (claimedJob: ClaimedJob) => {
  const { id: jobId, tenantId } = claimedJob;
  const job = await getSendJobForTenant(tenantId, jobId);
  if (!job) return;

  let transportSession: TransportSession | null = null;
  try {
    const project = await getProjectForTenant(tenantId, job.projectId);
    if (!project) {
      throw new Error("프로젝트를 찾을 수 없습니다.");
    }

    const templateId = normalizeEnv(project.templateId);
    if (!templateId) {
      throw new Error("프로젝트에 템플릿이 연결되어 있지 않습니다.");
    }
    const [template, trainingPage, tenantSmtpConfig] = await Promise.all([
      getTemplateForTenant(tenantId, templateId),
      project.trainingPageId
        ? getTrainingPageForTenant(tenantId, project.trainingPageId)
        : Promise.resolve(null),
      project.smtpAccountId
        ? getSmtpConfigByIdForTenant(tenantId, project.smtpAccountId)
        : Promise.resolve(null),
    ]);
    if (!template) {
      throw new Error("템플릿을 찾을 수 없습니다.");
    }
    const templateValidation = validateTemplateForSend(template, trainingPage);
    const runtimeValidation = validateProjectRuntimeSendConfig(project, tenantSmtpConfig);
    const validationIssues = [...templateValidation.issues, ...runtimeValidation];
    if (validationIssues.length > 0) {
      const message = formatSendValidationError(validationIssues);
      await updateProjectForTenant(tenantId, project.id, { sendValidationError: message });
      await updateSendJobForTenant(tenantId, jobId, {
        status: "failed",
        lastError: message,
        finishedAt: new Date(),
      });
      return;
    }
    await updateProjectForTenant(tenantId, project.id, { sendValidationError: null });

    const runtimeConfig = resolveRuntimeSendConfig(project, tenantSmtpConfig);
    transportSession = {
      config: runtimeConfig.transport,
      transporter: null,
    };

    const [projectTargets, targets] = await Promise.all([
      getProjectTargetsForTenant(tenantId, job.projectId),
      getTargetsForTenant(tenantId),
    ]);
    const targetMap = new Map(targets.map((target) => [target.id, target]));

    const eligibleTargets = projectTargets.filter((target) => target.status !== "test");
    const targetsToSend = eligibleTargets.filter(
      (target) => (target.sendStatus ?? "pending") !== "sent",
    );

    let successCount = 0;
    let failCount = 0;

    console.log("[send-worker] 작업을 처리합니다.", {
      tenantId,
      jobId,
      projectId: job.projectId,
      smtpSource: runtimeConfig.transport.source,
      fromEmail: runtimeConfig.sender.fromEmail,
    });

    await updateSendJobForTenant(tenantId, jobId, {
      totalCount: targetsToSend.length,
      successCount: 0,
      failCount: 0,
      lastError: null,
    });

    if (targetsToSend.length === 0) {
      await updateSendJobForTenant(tenantId, jobId, {
        status: "done",
        finishedAt: new Date(),
        successCount,
        failCount,
      });
      return;
    }

    try {
      await getTransporter(transportSession);
    } catch (error) {
      throw new Error(
        formatErrorMessage(error, {
          senderEmail: runtimeConfig.sender.fromEmail,
          transportSource: runtimeConfig.transport.source,
        }),
      );
    }

    for (const [index, projectTarget] of targetsToSend.entries()) {
      const recipient = targetMap.get(projectTarget.targetId);
      let trackingToken = projectTarget.trackingToken ?? "";

      if (!trackingToken) {
        trackingToken = randomUUID();
        await updateProjectTargetForTenant(tenantId, projectTarget.id, {
          trackingToken,
        });
      }

      if (!recipient?.email) {
        const message = "대상자 이메일이 존재하지 않습니다.";
        failCount += 1;
        await updateProjectTargetForTenant(tenantId, projectTarget.id, {
          sendStatus: "failed",
          sendError: message,
        });
        await updateSendJobForTenant(tenantId, jobId, {
          successCount,
          failCount,
          lastError: message,
        });
        if (index < targetsToSend.length - 1) {
          await sleep(resolveRateLimitMs());
        }
        continue;
      }

      const publicBaseUrl = await getTenantPublicBaseUrl(tenantId);
      const landingUrl = buildLandingUrl(trackingToken, { baseUrl: publicBaseUrl });
      const openPixelUrl = buildOpenPixelUrl(trackingToken, { baseUrl: publicBaseUrl });
      const { html: htmlBodyRaw } = buildMailHtml(template, landingUrl, openPixelUrl);
      const htmlBody = enforceBlackTextForSend(htmlBodyRaw);
      const plainText = stripHtml(htmlBody);

      try {
        await sendMailWithFallback(transportSession, {
          envelope: {
            from: runtimeConfig.sender.fromEmail,
            to: [recipient.email],
          },
          from: `"${runtimeConfig.sender.fromName}" <${runtimeConfig.sender.fromEmail}>`,
          to: recipient.email,
          replyTo: runtimeConfig.sender.replyTo ?? undefined,
          subject: template.subject ?? "(제목 없음)",
          html: htmlBody,
          text: plainText || undefined,
        });

        successCount += 1;
        await updateProjectTargetForTenant(tenantId, projectTarget.id, {
          sendStatus: "sent",
          sentAt: new Date(),
          sendError: null,
        });
      } catch (error) {
        const message = formatErrorMessage(error, {
          senderEmail: runtimeConfig.sender.fromEmail,
          transportSource: runtimeConfig.transport.source,
        });
        failCount += 1;
        await updateProjectTargetForTenant(tenantId, projectTarget.id, {
          sendStatus: "failed",
          sendError: message,
        });
        await updateSendJobForTenant(tenantId, jobId, {
          successCount,
          failCount,
          lastError: message,
        });
        if (index < targetsToSend.length - 1) {
          await sleep(resolveRateLimitMs());
        }
        console.error("[send-worker] 대상 발송 실패", {
          tenantId,
          jobId,
          projectId: job.projectId,
          targetId: projectTarget.id,
          recipientEmail: recipient.email,
          fromEmail: runtimeConfig.sender.fromEmail,
          smtpSource: runtimeConfig.transport.source,
          error: message,
        });
        continue;
      }

      await updateSendJobForTenant(tenantId, jobId, { successCount, failCount });

      if (index < targetsToSend.length - 1) {
        await sleep(resolveRateLimitMs());
      }
    }

    await updateSendJobForTenant(tenantId, jobId, {
      status: "done",
      finishedAt: new Date(),
      successCount,
      failCount,
    });
    console.log("[send-worker] 작업을 완료했습니다.", {
      tenantId,
      jobId,
      projectId: job.projectId,
      successCount,
      failCount,
    });
  } catch (error) {
    await recordJobFailure(tenantId, jobId, job.attempts ?? 0, error);
  } finally {
    closeTransporter(transportSession);
  }
};

export const processSendQueueOnce = async (): Promise<boolean> => {
  const job = await claimNextJob();
  if (!job) {
    return false;
  }
  await processJob(job);
  return true;
};

export const drainSendQueue = async () => {
  while (await processSendQueueOnce()) {
    // queue가 빌 때까지 순차 처리
  }
};

let inlineProcessor: Promise<void> | null = null;
let pendingKick = false;

export const kickSendJobProcessor = () => {
  if (process.env.NODE_ENV === "test") return;
  if (inlineProcessor) {
    pendingKick = true;
    return;
  }
  inlineProcessor = (async () => {
    try {
      await drainSendQueue();
    } catch (error) {
      console.error("[send-runner] 처리 중 오류", error);
    } finally {
      inlineProcessor = null;
      if (pendingKick) {
        pendingKick = false;
        kickSendJobProcessor();
      }
    }
  })();
};

export const startSendWorkerLoop = async () => {
  console.log("[send-worker] 워커를 시작합니다.");
  while (true) {
    try {
      const hasProcessed = await processSendQueueOnce();
      if (!hasProcessed) {
        await sleep(POLL_INTERVAL_MS);
      }
    } catch (error) {
      console.error("[send-worker] 처리 중 오류", error);
      await sleep(POLL_INTERVAL_MS);
    }
  }
};
