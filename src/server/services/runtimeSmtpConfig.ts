import process from "node:process";
import type { Project } from "@shared/schema";
import { validateSenderEmailAgainstAllowedDomains } from "@/lib/smtpValidation";
import type { PersistedSmtpConfig } from "../dao/smtpDao";
import { normalizeSmtpError } from "../lib/smtpError";
import { findMissingSmtpKey, normalizeOptionalString } from "./projectsShared";

export type RuntimeSendConfigIssueCode =
  | "smtp_not_configured"
  | "smtp_inactive"
  | "smtp_password_missing"
  | "sender_name_missing"
  | "sender_email_missing"
  | "sender_email_invalid"
  | "sender_domain_not_allowed";

export type RuntimeSendConfigIssue = {
  code: RuntimeSendConfigIssueCode;
  message: string;
};

export type RuntimeTransportConfig = {
  source: "tenant" | "env";
  host: string;
  port: number;
  secure: boolean;
  requireTLS?: boolean;
  user: string | null;
  pass: string | null;
  allowInvalidTls: boolean;
  replyTo: string | null;
};

export type RuntimeSenderInfo = {
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
};

export type RuntimeSendConfig = {
  transport: RuntimeTransportConfig;
  sender: RuntimeSenderInfo;
};

const hasSecretValue = (value?: string | null) => typeof value === "string" && value.length > 0;

const readOptionalSecret = (value?: string | null) => (typeof value === "string" ? value : null);

const resolveEnvTransportConfig = (): RuntimeTransportConfig => ({
  source: "env",
  host: normalizeOptionalString(process.env.SMTP_HOST) ?? "",
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: normalizeOptionalString(process.env.SMTP_SECURE)?.toLowerCase() === "true",
  user: normalizeOptionalString(process.env.SMTP_USER),
  pass: readOptionalSecret(process.env.SMTP_PASS),
  allowInvalidTls:
    normalizeOptionalString(process.env.SMTP_ALLOW_INVALID_TLS)?.toLowerCase() === "true",
  replyTo: null,
});

const resolveTenantTransportConfig = (smtpConfig: PersistedSmtpConfig): RuntimeTransportConfig => ({
  source: "tenant",
  host: normalizeOptionalString(smtpConfig.host) ?? "",
  port: Number(smtpConfig.port ?? 587),
  secure: smtpConfig.securityMode === "SMTPS",
  requireTLS: smtpConfig.securityMode === "STARTTLS",
  user: normalizeOptionalString(smtpConfig.username),
  pass: readOptionalSecret(smtpConfig.password),
  allowInvalidTls: smtpConfig.tlsVerify === false,
  replyTo: null,
});

export const collectRuntimeSendConfigIssues = (
  project: Pick<Project, "fromName" | "fromEmail">,
  smtpConfig?: PersistedSmtpConfig | null,
): RuntimeSendConfigIssue[] => {
  const issues: RuntimeSendConfigIssue[] = [];

  if (smtpConfig) {
    if (!smtpConfig.isActive) {
      issues.push({
        code: "smtp_inactive",
        message: "테넌트 발송 설정이 비활성화되어 프로젝트 메일을 발송할 수 없습니다.",
      });
    }

    if (normalizeOptionalString(smtpConfig.username) && !hasSecretValue(smtpConfig.password)) {
      issues.push({
        code: "smtp_password_missing",
        message: "테넌트 SMTP 비밀번호가 설정되지 않아 프로젝트 메일을 발송할 수 없습니다.",
      });
    }
  } else {
    const missingSmtpKey = findMissingSmtpKey();
    if (missingSmtpKey) {
      issues.push({
        code: "smtp_not_configured",
        message: `${missingSmtpKey} 환경 변수가 누락되어 프로젝트 메일을 발송할 수 없습니다.`,
      });
    }
  }

  const fromName =
    normalizeOptionalString(project.fromName) ||
    normalizeOptionalString(process.env.MAIL_FROM_NAME);
  if (!fromName) {
    issues.push({
      code: "sender_name_missing",
      message: "프로젝트 발신자 이름 또는 MAIL_FROM_NAME 환경 변수가 필요합니다.",
    });
  }

  const fromEmail =
    normalizeOptionalString(project.fromEmail) ||
    normalizeOptionalString(process.env.MAIL_FROM_EMAIL);
  if (!fromEmail) {
    issues.push({
      code: "sender_email_missing",
      message: "프로젝트 발신 이메일 또는 MAIL_FROM_EMAIL 환경 변수가 필요합니다.",
    });
  } else if (!fromEmail.includes("@")) {
    issues.push({
      code: "sender_email_invalid",
      message: "프로젝트 발신 이메일 또는 MAIL_FROM_EMAIL 환경 변수 형식이 올바르지 않습니다.",
    });
  } else if (smtpConfig) {
    try {
      validateSenderEmailAgainstAllowedDomains(
        fromEmail,
        smtpConfig.allowedSenderDomains,
      );
    } catch (error) {
      issues.push({
        code: "sender_domain_not_allowed",
        message:
          error instanceof Error
            ? error.message
            : "프로젝트 발신 이메일 도메인이 허용 발신 도메인과 일치하지 않습니다.",
      });
    }
  }

  return issues;
};

export const resolveRuntimeSendConfig = (
  project: Pick<Project, "fromName" | "fromEmail">,
  smtpConfig?: PersistedSmtpConfig | null,
): RuntimeSendConfig => {
  const issues = collectRuntimeSendConfigIssues(project, smtpConfig);
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => issue.message).join("\n"));
  }

  const transport = smtpConfig ? resolveTenantTransportConfig(smtpConfig) : resolveEnvTransportConfig();
  const fromName =
    normalizeOptionalString(project.fromName) ||
    normalizeOptionalString(process.env.MAIL_FROM_NAME);
  const fromEmail =
    normalizeOptionalString(project.fromEmail) ||
    normalizeOptionalString(process.env.MAIL_FROM_EMAIL);

  return {
    transport,
    sender: {
      fromName: fromName ?? "",
      fromEmail: fromEmail ?? "",
      replyTo: transport.replyTo,
    },
  };
};

export const formatRuntimeSendError = (
  error: unknown,
  options?: { senderEmail?: string | null; transportSource?: RuntimeTransportConfig["source"] },
) => {
  const normalized = normalizeSmtpError(error, {
    senderEmail: options?.senderEmail,
  });

  if (normalized.category === "sender_rejected") {
    const sender = options?.senderEmail ? ` (${options.senderEmail})` : "";
    const source = options?.transportSource === "tenant" ? "테넌트 발송 설정" : "환경 변수 SMTP 설정";
    return `${source}으로 발신 주소${sender} 사용이 거부되었습니다. 프로젝트 발신 이메일과 SMTP 계정의 send-as/alias 권한을 확인하세요. 원본 응답: ${normalized.rawMessage}`;
  }

  if (
    normalized.category === "auth" ||
    normalized.category === "network" ||
    normalized.category === "temporary" ||
    normalized.category === "permanent"
  ) {
    return normalized.message;
  }

  return normalized.rawMessage;
};
