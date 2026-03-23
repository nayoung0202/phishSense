import { beforeEach, describe, expect, it, vi } from "vitest";
import { TENANT_A_ID } from "@/test/tenantFixtures";

const smtpDaoMock = vi.hoisted(() => ({
  createSmtpConfig: vi.fn(),
  deleteSmtpConfigForTenant: vi.fn(),
  getSmtpConfig: vi.fn(),
  getSmtpConfigByIdForTenant: vi.fn(),
  listSmtpConfigsForTenant: vi.fn(),
  updateLastTestResult: vi.fn(),
  updateSmtpConfigForTenant: vi.fn(),
}));

const ssrfGuardMock = vi.hoisted(() => ({
  assertHostNotPrivateOrLocal: vi.fn(),
  validateSmtpInput: vi.fn((input: unknown) => input),
  validateTestRecipientEmail: vi.fn((value: string) => value),
}));

const smtpLibMock = vi.hoisted(() => ({
  sendTestEmail: vi.fn(),
}));

vi.mock("../dao/smtpDao", () => smtpDaoMock);
vi.mock("../lib/ssrfGuard", () => ssrfGuardMock);
vi.mock("../lib/smtp", () => smtpLibMock);

import {
  createTenantSmtpConfig,
  testTenantSmtpConfigById,
} from "./adminSmtpService";

const buildConfig = (overrides: Record<string, unknown> = {}) => ({
  id: "smtp-1",
  tenantId: TENANT_A_ID,
  name: "alerts@tenant-a.example",
  host: "smtp.tenant-a.example",
  port: 587,
  securityMode: "STARTTLS" as const,
  username: "alerts@tenant-a.example",
  password: "secret",
  tlsVerify: true,
  rateLimitPerMin: 60,
  allowedSenderDomains: ["tenant-a.example"],
  isActive: true,
  lastTestedAt: null,
  lastTestStatus: null,
  lastTestError: null,
  hasPassword: true,
  createdAt: "2026-03-20T00:00:00.000Z",
  updatedAt: "2026-03-20T00:00:00.000Z",
  ...overrides,
});

describe("adminSmtpService", () => {
  beforeEach(() => {
    smtpDaoMock.createSmtpConfig.mockReset();
    smtpDaoMock.deleteSmtpConfigForTenant.mockReset();
    smtpDaoMock.getSmtpConfig.mockReset();
    smtpDaoMock.getSmtpConfigByIdForTenant.mockReset();
    smtpDaoMock.listSmtpConfigsForTenant.mockReset();
    smtpDaoMock.updateLastTestResult.mockReset();
    smtpDaoMock.updateSmtpConfigForTenant.mockReset();
    ssrfGuardMock.assertHostNotPrivateOrLocal.mockReset();
    ssrfGuardMock.validateSmtpInput.mockClear();
    ssrfGuardMock.validateTestRecipientEmail.mockClear();
    smtpLibMock.sendTestEmail.mockReset();

    smtpDaoMock.listSmtpConfigsForTenant.mockResolvedValue([]);
  });

  it("새 SMTP를 현재 테넌트에 생성하고 활성화 시 다른 설정을 비활성화한다", async () => {
    const savedConfig = buildConfig({ id: "smtp-new" });
    smtpDaoMock.createSmtpConfig.mockResolvedValue(savedConfig);
    smtpDaoMock.getSmtpConfigByIdForTenant.mockResolvedValue(savedConfig);

    const result = await createTenantSmtpConfig(TENANT_A_ID, {
      host: "smtp.tenant-a.example",
      port: 587,
      securityMode: "STARTTLS",
      username: "alerts@tenant-a.example",
      password: "secret",
      allowedSenderDomains: ["tenant-a.example"],
      isActive: true,
    });

    expect(smtpDaoMock.createSmtpConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_A_ID,
        username: "alerts@tenant-a.example",
        isActive: true,
      }),
    );
    expect(result.item.id).toBe("smtp-new");
  });

  it("SMTP 테스트는 전달받은 smtpAccountId 기준으로 실행 결과를 기록한다", async () => {
    const config = buildConfig({ id: "smtp-selected" });
    smtpDaoMock.getSmtpConfigByIdForTenant.mockResolvedValue(config);
    smtpLibMock.sendTestEmail.mockResolvedValue(undefined);

    await testTenantSmtpConfigById(TENANT_A_ID, "smtp-selected", {
      testSenderEmail: "sender@tenant-a.example",
      testRecipientEmail: "recipient@tenant-a.example",
      testSubject: "테스트",
      testBody: "본문",
    });

    expect(smtpDaoMock.getSmtpConfigByIdForTenant).toHaveBeenCalledWith(
      TENANT_A_ID,
      "smtp-selected",
    );
    expect(smtpLibMock.sendTestEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        smtpConfig: config,
        senderEmail: "sender@tenant-a.example",
        toEmail: "recipient@tenant-a.example",
      }),
    );
    expect(smtpDaoMock.updateLastTestResult).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_A_ID,
        smtpAccountId: "smtp-selected",
        success: true,
      }),
    );
  });

  it("허용 발신 도메인과 다른 테스트 발신 이메일은 차단한다", async () => {
    const config = buildConfig({ id: "smtp-selected" });
    smtpDaoMock.getSmtpConfigByIdForTenant.mockResolvedValue(config);

    await expect(
      testTenantSmtpConfigById(TENANT_A_ID, "smtp-selected", {
        testSenderEmail: "sender@other.example",
        testRecipientEmail: "recipient@tenant-a.example",
      }),
    ).rejects.toMatchObject({
      status: 400,
      body: {
        message:
          "테스트 발신 이메일 도메인은 허용 발신 도메인 또는 그 하위 도메인과 일치해야 합니다. (tenant-a.example)",
      },
    });
  });

  it("허용 발신 도메인의 하위 도메인 테스트 발신 이메일은 허용한다", async () => {
    const config = buildConfig({ id: "smtp-selected" });
    smtpDaoMock.getSmtpConfigByIdForTenant.mockResolvedValue(config);
    smtpLibMock.sendTestEmail.mockResolvedValue(undefined);

    await testTenantSmtpConfigById(TENANT_A_ID, "smtp-selected", {
      testSenderEmail: "sender@auth.tenant-a.example",
      testRecipientEmail: "recipient@tenant-a.example",
    });

    expect(smtpLibMock.sendTestEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        senderEmail: "sender@auth.tenant-a.example",
      }),
    );
  });

  it("허용 발신 도메인은 최대 5개까지만 저장한다", async () => {
    await expect(
      createTenantSmtpConfig(TENANT_A_ID, {
        host: "smtp.tenant-a.example",
        port: 587,
        securityMode: "STARTTLS",
        username: "alerts@tenant-a.example",
        password: "secret",
        allowedSenderDomains: [
          "one.example",
          "two.example",
          "three.example",
          "four.example",
          "five.example",
          "six.example",
        ],
        isActive: true,
      }),
    ).rejects.toMatchObject({
      status: 400,
      body: {
        message: "허용 발신 도메인은 최대 5개까지 등록할 수 있습니다.",
      },
    });
  });

  it("SMTP 5xx 응답은 영구 오류로 정규화해 400으로 반환한다", async () => {
    const config = buildConfig({ id: "smtp-selected" });
    smtpDaoMock.getSmtpConfigByIdForTenant.mockResolvedValue(config);
    smtpLibMock.sendTestEmail.mockRejectedValue(
      Object.assign(new Error("Message failed: 551 5.7.1 Not authorised to send from this header address"), {
        responseCode: 551,
        stage: "send",
      }),
    );

    await expect(
      testTenantSmtpConfigById(TENANT_A_ID, "smtp-selected", {
        testSenderEmail: "sender@tenant-a.example",
        testRecipientEmail: "recipient@tenant-a.example",
      }),
    ).rejects.toMatchObject({
      status: 400,
      body: {
        message: "입력한 발신 이메일 (sender@tenant-a.example) 사용 권한이 없습니다. SMTP 계정의 send-as/alias 권한을 확인하세요.",
      },
    });

    expect(smtpDaoMock.updateLastTestResult).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        errorMessage: expect.stringContaining("발신 이메일"),
      }),
    );
  });

  it("SMTP 4xx 응답은 임시 오류로 정규화해 502로 반환한다", async () => {
    const config = buildConfig({ id: "smtp-selected" });
    smtpDaoMock.getSmtpConfigByIdForTenant.mockResolvedValue(config);
    smtpLibMock.sendTestEmail.mockRejectedValue(
      Object.assign(new Error("Message failed: 451 4.3.0 Temporary server failure"), {
        responseCode: 451,
        stage: "send",
      }),
    );

    await expect(
      testTenantSmtpConfigById(TENANT_A_ID, "smtp-selected", {
        testSenderEmail: "sender@tenant-a.example",
        testRecipientEmail: "recipient@tenant-a.example",
      }),
    ).rejects.toMatchObject({
      status: 502,
      body: {
        message: "SMTP 서버가 메일 전송 요청을 일시적으로 처리하지 못했습니다. 잠시 후 다시 시도하세요.",
      },
    });
  });
});
