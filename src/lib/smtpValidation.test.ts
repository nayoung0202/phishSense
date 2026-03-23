import { describe, expect, it } from "vitest";
import {
  MAX_ALLOWED_SENDER_DOMAINS,
  extractEmailDomain,
  normalizeSmtpDomain,
  normalizeSmtpDomains,
  validateAllowedSenderDomain,
  validateAllowedSenderDomains,
  validateSmtpConnectionInput,
  validateSmtpHost,
  validateSenderEmailAgainstAllowedDomains,
} from "./smtpValidation";

describe("smtpValidation", () => {
  it("호스트와 도메인을 소문자 기준으로 정규화한다", () => {
    expect(normalizeSmtpDomain(" SMTP.Example.COM ")).toBe("smtp.example.com");
    expect(validateSmtpHost(" SMTP.Example.COM ")).toBe("smtp.example.com");
    expect(validateAllowedSenderDomain(" Team.Example.COM ")).toBe("team.example.com");
    expect(normalizeSmtpDomains([" Team.Example.COM ", "team.example.com"])).toEqual([
      "team.example.com",
    ]);
    expect(extractEmailDomain("Sender@Example.com")).toBe("example.com");
  });

  it("465 포트는 SMTPS 조합만 허용한다", () => {
    expect(() =>
      validateSmtpConnectionInput({
        host: "smtp.example.com",
        port: 465,
        securityMode: "STARTTLS",
      }),
    ).toThrowError("포트 465 사용 시 보안 모드는 SMTPS 여야 합니다.");
  });

  it("직접 입력 포트는 보안 모드 없음 조합만 허용한다", () => {
    expect(() =>
      validateSmtpConnectionInput({
        host: "smtp.example.com",
        port: 2525,
        securityMode: "SMTPS",
      }),
    ).toThrowError("직접 입력한 포트는 '보안 모드 없음'과 함께 사용해야 합니다.");
  });

  it("유효한 STARTTLS 설정은 정규화된 값을 반환한다", () => {
    expect(
      validateSmtpConnectionInput({
        host: " SMTP.Example.COM ",
        port: 587,
        securityMode: "STARTTLS",
      }),
    ).toEqual({
      host: "smtp.example.com",
      port: 587,
      securityMode: "STARTTLS",
    });
  });

  it("허용 발신 도메인이 있으면 발신 이메일 도메인을 검증한다", () => {
    expect(
      validateSenderEmailAgainstAllowedDomains("security@example.com", ["example.com"]),
    ).toBe("security@example.com");
    expect(
      validateSenderEmailAgainstAllowedDomains("security@auth.example.com", ["example.com"]),
    ).toBe("security@auth.example.com");
    expect(
      validateSenderEmailAgainstAllowedDomains(
        "security@notice.auth.example.com",
        ["auth.example.com"],
      ),
    ).toBe("security@notice.auth.example.com");

    expect(() =>
      validateSenderEmailAgainstAllowedDomains("security@other.example", ["example.com"]),
    ).toThrowError(
      "발신 이메일 도메인은 허용 발신 도메인 또는 그 하위 도메인과 일치해야 합니다. (example.com)",
    );
  });

  it("허용 발신 도메인은 최대 5개까지만 등록한다", () => {
    expect(
      validateAllowedSenderDomains(
        Array.from({ length: MAX_ALLOWED_SENDER_DOMAINS }, (_, index) => `team${index}.example.com`),
      ),
    ).toHaveLength(MAX_ALLOWED_SENDER_DOMAINS);

    expect(() =>
      validateAllowedSenderDomains(
        Array.from({ length: MAX_ALLOWED_SENDER_DOMAINS + 1 }, (_, index) => `team${index}.example.com`),
      ),
    ).toThrowError("허용 발신 도메인은 최대 5개까지 등록할 수 있습니다.");
  });
});
