import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import {
  validateSmtpConnectionInput,
  type NormalizedSmtpConnectionInput,
  type SmtpConnectionValidationInput,
} from "@/lib/smtpValidation";
import type { SecurityMode } from "@/types/smtp";

export type SmtpValidationInput = SmtpConnectionValidationInput;
export type NormalizedSmtpInput = NormalizedSmtpConnectionInput;

export function validateSmtpInput(input: SmtpValidationInput): NormalizedSmtpInput {
  const normalized = validateSmtpConnectionInput(input);

  if (isIP(normalized.host) !== 0) {
    throw new Error("SMTP 호스트는 도메인 형식이어야 합니다.");
  }

  return normalized;
}

export async function assertHostNotPrivateOrLocal(hostname: string) {
  let addresses;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch (error) {
    const message =
      error instanceof Error
        ? `SMTP 호스트 DNS 조회에 실패했습니다: ${error.message}`
        : "SMTP 호스트 DNS 조회에 실패했습니다.";
    throw new Error(message);
  }

  if (!addresses || addresses.length === 0) {
    throw new Error("SMTP 호스트의 IP 주소를 확인할 수 없습니다.");
  }

  const blockMetadata = String(process.env.SSRF_BLOCK_METADATA ?? "").toLowerCase() === "true";

  for (const record of addresses) {
    let parsed;
    try {
      parsed = ipaddr.parse(record.address);
    } catch {
      throw new Error("해석할 수 없는 호스트 주소입니다.");
    }

    const range = parsed.range();
    if (
      range === "loopback" ||
      range === "linkLocal" ||
      range === "uniqueLocal" ||
      range === "private"
    ) {
      throw new Error("사설/로컬 네트워크 주소로는 SMTP를 구성할 수 없습니다.");
    }

    if (
      blockMetadata &&
      parsed.kind() === "ipv4" &&
      parsed.toString() === "169.254.169.254"
    ) {
      throw new Error("메타데이터/링크 로컬 주소는 허용되지 않습니다.");
    }
  }
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateTestRecipientEmail(email: string, fallbackDomains?: string[] | null) {
  const normalized = (email || "").trim().toLowerCase();
  if (!emailRegex.test(normalized)) {
    throw new Error("유효한 이메일 주소를 입력하세요.");
  }
  const allowedEnv = process.env.SMTP_TEST_ALLOWED_DOMAINS ?? "";
  const envDomains = allowedEnv
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const fallback = fallbackDomains?.map((item) => item.trim().toLowerCase()).filter(Boolean) ?? [];
  const allowedDomains = Array.from(new Set([...envDomains, ...fallback]));
  if (allowedDomains.length === 0) {
    throw new Error("허용된 테스트 도메인이 설정되어 있지 않습니다.");
  }
  const [, domain = ""] = normalized.split("@");
  if (!allowedDomains.includes(domain)) {
    throw new Error(`허용되지 않은 도메인입니다. (${allowedDomains.join(", ")})`);
  }
  return normalized;
}
