import type { SecurityMode } from "@/types/smtp";

const SMTP_DOMAIN_REGEX = /^(?!-)(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MAX_ALLOWED_SENDER_DOMAINS = 5;

export type SmtpValidationErrorCode =
  | "invalid_host"
  | "invalid_allowed_domain"
  | "allowed_domain_limit"
  | "invalid_email"
  | "sender_domain_not_allowed"
  | "invalid_port"
  | "invalid_security_for_465"
  | "invalid_security_for_587"
  | "invalid_custom_port_security";

export type SmtpConnectionValidationInput = {
  host: string;
  port: number;
  securityMode: SecurityMode;
};

export type NormalizedSmtpConnectionInput = {
  host: string;
  port: number;
  securityMode: SecurityMode;
};

type SmtpValidationError = Error & {
  code: SmtpValidationErrorCode;
};

function createSmtpValidationError(
  code: SmtpValidationErrorCode,
  message: string,
): SmtpValidationError {
  const error = new Error(message) as SmtpValidationError;
  error.code = code;
  return error;
}

export function getSmtpValidationErrorCode(error: unknown): SmtpValidationErrorCode | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const code = Reflect.get(error, "code");
  return typeof code === "string" ? (code as SmtpValidationErrorCode) : null;
}

export function normalizeSmtpDomain(value: string) {
  return (value || "").trim().toLowerCase();
}

export function normalizeSmtpDomains(values?: string[] | null) {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => normalizeSmtpDomain(value))
        .filter(Boolean),
    ),
  );
}

export function validateSmtpHost(value: string) {
  const normalized = normalizeSmtpDomain(value);

  if (!normalized || !SMTP_DOMAIN_REGEX.test(normalized)) {
    throw createSmtpValidationError("invalid_host", "SMTP 호스트는 도메인 형식이어야 합니다.");
  }

  return normalized;
}

export function validateAllowedSenderDomain(value: string, label = "허용 발신 도메인") {
  const normalized = normalizeSmtpDomain(value);

  if (!normalized || !SMTP_DOMAIN_REGEX.test(normalized)) {
    throw createSmtpValidationError("invalid_allowed_domain", `${label}은 example.com 형태여야 합니다.`);
  }

  return normalized;
}

export function validateAllowedSenderDomains(values?: string[] | null, label = "허용 발신 도메인") {
  const normalized = normalizeSmtpDomains(
    (values ?? []).map((value) => validateAllowedSenderDomain(value, label)),
  );

  if (normalized.length > MAX_ALLOWED_SENDER_DOMAINS) {
    throw createSmtpValidationError(
      "allowed_domain_limit",
      `${label}은 최대 ${MAX_ALLOWED_SENDER_DOMAINS}개까지 등록할 수 있습니다.`,
    );
  }

  return normalized;
}

export function extractEmailDomain(value?: string | null) {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized.includes("@")) {
    return "";
  }
  const [, domain = ""] = normalized.split("@");
  return normalizeSmtpDomain(domain);
}

function matchesAllowedSenderDomain(senderDomain: string, allowedDomain: string) {
  return senderDomain === allowedDomain || senderDomain.endsWith(`.${allowedDomain}`);
}

export function validateSenderEmailAgainstAllowedDomains(
  email: string,
  allowedDomains?: string[] | null,
  label = "발신 이메일",
) {
  const normalizedEmail = (email || "").trim().toLowerCase();

  if (!EMAIL_REGEX.test(normalizedEmail)) {
    throw createSmtpValidationError("invalid_email", "유효한 이메일 주소를 입력하세요.");
  }

  const normalizedAllowedDomains = normalizeSmtpDomains(allowedDomains);
  if (normalizedAllowedDomains.length === 0) {
    return normalizedEmail;
  }

  const senderDomain = extractEmailDomain(normalizedEmail);
  const isAllowed = normalizedAllowedDomains.some((allowedDomain) =>
    matchesAllowedSenderDomain(senderDomain, allowedDomain),
  );

  if (!isAllowed) {
    throw createSmtpValidationError(
      "sender_domain_not_allowed",
      `${label} 도메인은 허용 발신 도메인 또는 그 하위 도메인과 일치해야 합니다. (${normalizedAllowedDomains.join(", ")})`,
    );
  }

  return normalizedEmail;
}

export function validateSmtpConnectionInput(
  input: SmtpConnectionValidationInput,
): NormalizedSmtpConnectionInput {
  const host = validateSmtpHost(input.host);
  const port = Number(input.port);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw createSmtpValidationError("invalid_port", "SMTP 포트는 1~65535 범위의 정수여야 합니다.");
  }

  if (port === 465 && input.securityMode !== "SMTPS") {
    throw createSmtpValidationError("invalid_security_for_465", "포트 465 사용 시 보안 모드는 SMTPS 여야 합니다.");
  }

  if (port === 587 && input.securityMode !== "STARTTLS") {
    throw createSmtpValidationError(
      "invalid_security_for_587",
      "포트 587 사용 시 보안 모드는 STARTTLS 여야 합니다.",
    );
  }

  if (port !== 465 && port !== 587 && input.securityMode !== "NONE") {
    throw createSmtpValidationError(
      "invalid_custom_port_security",
      "직접 입력한 포트는 '보안 모드 없음'과 함께 사용해야 합니다.",
    );
  }

  return {
    host,
    port,
    securityMode: input.securityMode,
  };
}
