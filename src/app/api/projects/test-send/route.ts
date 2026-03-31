import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { z, ZodError } from "zod";
import { validateSenderEmailAgainstAllowedDomains } from "@/lib/smtpValidation";
import { getSmtpConfigByIdForTenant } from "@/server/dao/smtpDao";
import {
  buildLandingUrl,
  buildOpenPixelUrl,
} from "@/server/lib/trainingLink";
import { getTenantPublicBaseUrl } from "@/server/lib/tenantDomain";
import {
  NODEMAILER_VERSION,
  buildTestEmailHtml,
  findMissingSmtpKey,
  stripHtml,
} from "@/server/services/projectsShared";
import { buildMailHtml } from "@/server/services/templateSendValidation";
import { enforceBlackTextForSend } from "@/server/services/enforceBlackTextForSend";
import {
  createProjectTargetForTenant,
  createTargetForTenant,
  findTargetByEmailInTenant,
  getProjectForTenant,
  getTemplateForTenant,
} from "@/server/tenant/tenantStorage";
import {
  buildReadyTenantErrorResponse,
  requireReadyTenant,
} from "@/server/tenant/currentTenant";

const payloadSchema = z
  .object({
    projectId: z.string().trim().min(1).nullish(),
    templateId: z.string().trim().min(1, "템플릿을 선택하세요.").nullish(),
    smtpAccountId: z.string().trim().min(1).nullish(),
    fromEmail: z.string().email("올바른 발신 이메일 주소를 입력하세요."),
    fromName: z.string().min(1, "발신자 이름을 입력하세요."),
    recipient: z.string().email("유효한 수신 이메일을 입력하세요."),
  })
  .superRefine((data, ctx) => {
    if (!data.projectId && !data.templateId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["templateId"],
        message: "프로젝트 또는 템플릿을 선택하세요.",
      });
    }
  });

export async function POST(request: NextRequest) {
  const headers = new Headers({
    "X-Mailer-Version": `nodemailer/${NODEMAILER_VERSION}`,
  });
  try {
    const { tenantId } = await requireReadyTenant(request);
    const missingKey = findMissingSmtpKey();
    if (missingKey) {
      return NextResponse.json(
        {
          error: "smtp_not_configured",
          reason: `${missingKey} 환경 변수가 누락되어 테스트 메일을 발송할 수 없습니다.`,
        },
        { status: 503, headers },
      );
    }

    const payload = payloadSchema.parse(await request.json());
    const projectId = payload.projectId?.trim();
    const project = projectId ? await getProjectForTenant(tenantId, projectId) : undefined;
    if (projectId && !project) {
      return NextResponse.json(
        { error: "project_not_found", reason: "프로젝트를 찾을 수 없습니다." },
        { status: 404, headers },
      );
    }
    if (project && !project.trainingPageId) {
      return NextResponse.json(
        {
          error: "training_page_missing",
          reason: "프로젝트에 연결된 훈련 안내 페이지가 없습니다.",
        },
        { status: 409, headers },
      );
    }

    const templateId = project?.templateId ?? payload.templateId;
    if (!templateId) {
      return NextResponse.json(
        { error: "template_required", reason: "프로젝트 또는 템플릿을 선택하세요." },
        { status: 422, headers },
      );
    }

    const template = await getTemplateForTenant(tenantId, templateId);
    if (!template) {
      return NextResponse.json(
        { error: "template_not_found", reason: "선택한 템플릿을 찾을 수 없습니다." },
        { status: 404, headers },
      );
    }

    const fromEmail =
      (typeof project?.fromEmail === "string" && project.fromEmail.trim()) || payload.fromEmail;
    const fromName =
      (typeof project?.fromName === "string" && project.fromName.trim()) || payload.fromName;
    const smtpAccountId =
      (typeof project?.smtpAccountId === "string" && project.smtpAccountId.trim()) ||
      payload.smtpAccountId?.trim() ||
      null;

    if (smtpAccountId) {
      const smtpConfig = await getSmtpConfigByIdForTenant(tenantId, smtpAccountId);
      if (smtpConfig) {
        try {
          validateSenderEmailAgainstAllowedDomains(fromEmail, smtpConfig.allowedSenderDomains);
        } catch (error) {
          return NextResponse.json(
            {
              error: "sender_domain_not_allowed",
              reason:
                error instanceof Error
                  ? error.message
                  : "발신 이메일 도메인이 허용 발신 도메인과 일치하지 않습니다.",
            },
            { status: 422, headers },
          );
        }
      }
    }

    const smtpPort = Number(process.env.SMTP_PORT ?? 587);
    const smtpSecure = String(process.env.SMTP_SECURE ?? "").toLowerCase() === "true";
    const allowInvalidTls =
      String(process.env.SMTP_ALLOW_INVALID_TLS ?? "").toLowerCase() === "true";
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    const buildTransporter = (options: { port: number; secure: boolean; requireTLS?: boolean }) =>
      nodemailer.createTransport({
        host: smtpHost,
        port: options.port,
        secure: options.secure,
        requireTLS: options.requireTLS,
        auth: { user: smtpUser, pass: smtpPass },
        tls: { rejectUnauthorized: !allowInvalidTls },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 10_000,
      });

    const isConnectionError = (error: unknown) => {
      if (!error || typeof error !== "object") return false;
      const typed = error as { code?: string; command?: string };
      if (typed.command === "CONN") return true;
      return ["ETIMEDOUT", "ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "ECONNRESET"].includes(
        typed.code ?? "",
      );
    };

    let htmlBody = template.body ?? "";
    if (project) {
      const publicBaseUrl = await getTenantPublicBaseUrl(tenantId);
      const recipientEmail = payload.recipient.trim();
      let target = await findTargetByEmailInTenant(tenantId, recipientEmail);
      if (!target) {
        const nameCandidate = recipientEmail.split("@")[0] ?? "테스트";
        target = await createTargetForTenant(tenantId, {
          name: nameCandidate || "테스트",
          email: recipientEmail,
          department: null,
          tags: [],
          status: "active",
        });
      }

      const projectTarget = await createProjectTargetForTenant(tenantId, {
        projectId: project.id,
        targetId: target.id,
        status: "test",
        sendStatus: "sent",
        sentAt: new Date(),
      });
      const trackingToken = projectTarget.trackingToken ?? "";
      htmlBody = buildMailHtml(
        template,
        buildLandingUrl(trackingToken, { baseUrl: publicBaseUrl }),
        buildOpenPixelUrl(trackingToken, { baseUrl: publicBaseUrl }),
      ).html;
    }

    htmlBody = enforceBlackTextForSend(htmlBody);
    const subject = template.subject ?? "테스트 메일";
    const prefixedSubject = `[테스트] ${subject}`;
    const composedHtml = buildTestEmailHtml(htmlBody, payload.recipient);
    const plainText = stripHtml(htmlBody);
    const mailPayload = {
      envelope: { from: fromEmail, to: [payload.recipient] },
      from: `"${fromName}" <${fromEmail}>`,
      to: payload.recipient,
      subject: prefixedSubject,
      html: composedHtml,
      text: plainText || undefined,
      headers: {
        "X-PhishSense-Preview": "true",
      },
    };

    let delivery;
    let usedFallback = false;
    const sendWithTransport = async (options: { port: number; secure: boolean; requireTLS?: boolean }) => {
      const transporter = buildTransporter(options);
      try {
        return await transporter.sendMail(mailPayload);
      } finally {
        if (typeof transporter.close === "function") {
          transporter.close();
        }
      }
    };

    try {
      delivery = await sendWithTransport({ port: smtpPort, secure: smtpSecure });
    } catch (error) {
      if (smtpPort === 465 && isConnectionError(error)) {
        usedFallback = true;
        delivery = await sendWithTransport({ port: 587, secure: false, requireTLS: true });
      } else {
        throw error;
      }
    }

    return NextResponse.json(
      {
        status: "sent" as const,
        fallbackPort: usedFallback ? 587 : null,
        messageId: delivery.messageId,
        accepted: Array.isArray(delivery.accepted) ? delivery.accepted.map(String) : [],
        rejected: Array.isArray(delivery.rejected) ? delivery.rejected.map(String) : [],
        envelope: {
          from: delivery.envelope?.from ?? fromEmail,
          to: Array.isArray(delivery.envelope?.to)
            ? delivery.envelope.to.map(String)
            : [payload.recipient],
        },
        response: delivery.response,
        previewUrl: (delivery as { previewUrl?: string }).previewUrl ?? null,
        processedAt: new Date().toISOString(),
      },
      { headers },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "validation_error",
          details: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 422, headers },
      );
    }
    return buildReadyTenantErrorResponse(error, "테스트 메일 발송에 실패했습니다.");
  }
}
