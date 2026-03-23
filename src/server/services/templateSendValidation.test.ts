import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project, Template, TrainingPage } from "@shared/schema";
import { validateProjectForSend } from "./templateSendValidation";
import type { PersistedSmtpConfig } from "../dao/smtpDao";

const baseTemplate: Template = {
  id: "template-1",
  tenantId: "tenant-a",
  name: "기본 템플릿",
  subject: "안내 메일",
  body: '<a href="{{LANDING_URL}}">확인</a>',
  maliciousPageContent:
    '<form action="{{TRAINING_URL}}"><input name="email" /><button type="submit">제출</button></form>',
  autoInsertLandingEnabled: true,
  autoInsertLandingLabel: "확인",
  autoInsertLandingKind: "link",
  autoInsertLandingNewTab: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const baseTrainingPage: TrainingPage = {
  id: "training-1",
  tenantId: "tenant-a",
  name: "훈련 페이지",
  description: null,
  content: "<p>훈련</p>",
  status: "active",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const baseProject: Project = {
  id: "project-1",
  tenantId: "tenant-a",
  name: "프로젝트",
  description: null,
  department: null,
  departmentTags: [],
  templateId: "template-1",
  trainingPageId: "training-1",
  trainingLinkToken: "training-token-1",
  smtpAccountId: null,
  fromName: null,
  fromEmail: null,
  timezone: "Asia/Seoul",
  notificationEmails: [],
  startDate: new Date("2026-01-01T00:00:00Z"),
  endDate: new Date("2026-01-02T00:00:00Z"),
  status: "예약",
  targetCount: 1,
  openCount: 0,
  clickCount: 0,
  submitCount: 0,
  reportCaptureInboxFileKey: null,
  reportCaptureEmailFileKey: null,
  reportCaptureMaliciousFileKey: null,
  reportCaptureTrainingFileKey: null,
  sendValidationError: null,
  fiscalYear: 2026,
  fiscalQuarter: 1,
  weekOfYear: [1],
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

describe("validateProjectForSend runtime config", () => {
  const buildStorage = (smtpConfig: PersistedSmtpConfig | null = null) => ({
    getTemplate: vi.fn().mockResolvedValue(baseTemplate),
    getTrainingPage: vi.fn().mockResolvedValue(baseTrainingPage),
    getSmtpConfig: vi.fn().mockResolvedValue(smtpConfig),
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("SMTP와 발신자 정보가 없으면 프로젝트 발송 검증에서 차단한다", async () => {
    const storage = buildStorage();

    const result = await validateProjectForSend(storage, baseProject);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "smtp_not_configured" }),
        expect.objectContaining({ code: "sender_name_missing" }),
        expect.objectContaining({ code: "sender_email_missing" }),
      ]),
    );
  });

  it("테넌트 SMTP 설정이 있으면 환경 변수 없이도 추가 발송 설정 오류 없이 통과한다", async () => {
    const storage = buildStorage({
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
    });

    const result = await validateProjectForSend(storage, {
      ...baseProject,
      fromName: "보안팀",
      fromEmail: "security@example.com",
    });

    expect(result).toEqual({ ok: true, issues: [] });
  });

  it("테넌트 SMTP 설정이 없으면 환경 변수 fallback으로 통과한다", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_USER", "user");
    vi.stubEnv("SMTP_PASS", "pass");
    vi.stubEnv("MAIL_FROM_NAME", "보안팀");
    vi.stubEnv("MAIL_FROM_EMAIL", "security@example.com");

    const storage = buildStorage();

    const result = await validateProjectForSend(storage, baseProject);

    expect(result).toEqual({ ok: true, issues: [] });
  });

  it("테넌트 SMTP 설정이 비활성이면 발송 검증에서 차단한다", async () => {
    const storage = buildStorage({
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
      isActive: false,
      lastTestedAt: null,
      lastTestStatus: null,
      lastTestError: null,
      hasPassword: true,
      createdAt: null,
      updatedAt: null,
    });

    const result = await validateProjectForSend(storage, baseProject);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "smtp_inactive" })]),
    );
  });

  it("허용 발신 도메인과 다른 프로젝트 발신 이메일은 발송 검증에서 차단한다", async () => {
    const storage = buildStorage({
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
    });

    const result = await validateProjectForSend(storage, {
      ...baseProject,
      fromName: "보안팀",
      fromEmail: "security@other.example",
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "sender_domain_not_allowed" })]),
    );
  });

  it("허용 발신 도메인의 하위 도메인 프로젝트 발신 이메일은 통과한다", async () => {
    const storage = buildStorage({
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
    });

    const result = await validateProjectForSend(storage, {
      ...baseProject,
      fromName: "보안팀",
      fromEmail: "security@auth.example.com",
    });

    expect(result).toEqual({ ok: true, issues: [] });
  });
});
