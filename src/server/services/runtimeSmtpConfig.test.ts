import { afterEach, describe, expect, it, vi } from "vitest";
import type { PersistedSmtpConfig } from "../dao/smtpDao";
import {
  collectRuntimeSendConfigIssues,
  formatRuntimeSendError,
  resolveRuntimeSendConfig,
} from "./runtimeSmtpConfig";

const baseProject = {
  fromName: null,
  fromEmail: null,
};

const tenantSmtpConfig: PersistedSmtpConfig = {
  id: "smtp-1",
  tenantId: "tenant-a",
  name: "tenant-a",
  host: "smtp.example.com",
  port: 587,
  securityMode: "STARTTLS",
  username: "mailer@example.com",
  password: "secret",
  tlsVerify: true,
  rateLimitPerMin: 60,
  allowedSenderDomains: ["example.com"],
  isActive: true,
  lastTestedAt: null,
  lastTestStatus: null,
  lastTestError: null,
  hasPassword: true,
  createdAt: null,
  updatedAt: null,
};

describe("runtimeSmtpConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("테넌트 SMTP 설정을 우선 사용하고 프로젝트 발신자 override를 반영한다", () => {
    const resolved = resolveRuntimeSendConfig(
      {
        fromName: "프로젝트 발신자",
        fromEmail: "project@example.com",
      },
      tenantSmtpConfig,
    );

    expect(resolved.transport).toMatchObject({
      source: "tenant",
      host: "smtp.example.com",
      port: 587,
      secure: false,
      requireTLS: true,
      user: "mailer@example.com",
    });
    expect(resolved.sender).toEqual({
      fromName: "프로젝트 발신자",
      fromEmail: "project@example.com",
      replyTo: null,
    });
  });

  it("테넌트 SMTP 설정이 없으면 환경 변수 fallback을 사용한다", () => {
    vi.stubEnv("SMTP_HOST", "smtp.env.example.com");
    vi.stubEnv("SMTP_USER", "env-user");
    vi.stubEnv("SMTP_PASS", "env-pass");
    vi.stubEnv("MAIL_FROM_NAME", "환경 발신자");
    vi.stubEnv("MAIL_FROM_EMAIL", "env@example.com");

    const resolved = resolveRuntimeSendConfig(baseProject);

    expect(resolved.transport).toMatchObject({
      source: "env",
      host: "smtp.env.example.com",
      user: "env-user",
      pass: "env-pass",
    });
    expect(resolved.sender).toEqual({
      fromName: "환경 발신자",
      fromEmail: "env@example.com",
      replyTo: null,
    });
  });

  it("비활성 tenant SMTP 설정은 검증 단계에서 차단한다", () => {
    const issues = collectRuntimeSendConfigIssues(baseProject, {
      ...tenantSmtpConfig,
      isActive: false,
    });

    expect(issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "smtp_inactive" })]),
    );
  });

  it("허용 발신 도메인과 다른 프로젝트 발신 이메일은 검증 단계에서 차단한다", () => {
    const issues = collectRuntimeSendConfigIssues(
      {
        fromName: "프로젝트 발신자",
        fromEmail: "project@other.example",
      },
      tenantSmtpConfig,
    );

    expect(issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "sender_domain_not_allowed" })]),
    );
  });

  it("허용 발신 도메인의 하위 도메인 발신 이메일은 허용한다", () => {
    const issues = collectRuntimeSendConfigIssues(
      {
        fromName: "프로젝트 발신자",
        fromEmail: "project@auth.example.com",
      },
      tenantSmtpConfig,
    );

    expect(issues).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "sender_domain_not_allowed" })]),
    );
  });

  it("551 응답을 발신 권한 오류 메시지로 변환한다", () => {
    const message = formatRuntimeSendError(
      Object.assign(new Error("Message failed: 551 5.7.1 Not authorised to send from this header address"), {
        responseCode: 551,
      }),
      {
        senderEmail: "project@example.com",
        transportSource: "tenant",
      },
    );

    expect(message).toContain("send-as/alias 권한");
    expect(message).toContain("project@example.com");
    expect(message).toContain("551 5.7.1");
  });
});
