import { beforeEach, describe, expect, it, vi } from "vitest";

const smtpDaoMock = vi.hoisted(() => ({
  getSmtpConfigByIdForTenant: vi.fn(),
}));

vi.mock("@/server/dao/smtpDao", () => smtpDaoMock);

import { validateProjectSenderDomainPolicy } from "./projectSmtpPolicy";

describe("validateProjectSenderDomainPolicy", () => {
  beforeEach(() => {
    smtpDaoMock.getSmtpConfigByIdForTenant.mockReset();
  });

  it("임시 프로젝트는 발신 도메인 검증을 건너뛴다", async () => {
    const issues = await validateProjectSenderDomainPolicy("tenant-1", {
      status: "임시",
      smtpAccountId: "smtp-1",
      fromEmail: "sender@example.com",
    });

    expect(issues).toEqual([]);
    expect(smtpDaoMock.getSmtpConfigByIdForTenant).not.toHaveBeenCalled();
  });

  it("선택한 발송 설정이 없으면 smtpAccountId 오류를 반환한다", async () => {
    smtpDaoMock.getSmtpConfigByIdForTenant.mockResolvedValue(null);

    const issues = await validateProjectSenderDomainPolicy("tenant-1", {
      status: "예약",
      smtpAccountId: "smtp-missing",
      fromEmail: "sender@example.com",
    });

    expect(issues).toEqual([
      {
        field: "smtpAccountId",
        code: "not_found",
        message: "선택한 발송 설정을 찾을 수 없습니다.",
      },
    ]);
  });

  it("허용 발신 도메인과 다른 발신 이메일은 차단한다", async () => {
    smtpDaoMock.getSmtpConfigByIdForTenant.mockResolvedValue({
      allowedSenderDomains: ["example.com"],
    });

    const issues = await validateProjectSenderDomainPolicy("tenant-1", {
      status: "예약",
      smtpAccountId: "smtp-1",
      fromEmail: "sender@other.com",
    });

    expect(issues).toEqual([
      {
        field: "fromEmail",
        code: "sender_domain_not_allowed",
        message:
          "발신 이메일 도메인은 허용 발신 도메인 또는 그 하위 도메인과 일치해야 합니다. (example.com)",
      },
    ]);
  });

  it("허용 발신 도메인과 일치하면 통과한다", async () => {
    smtpDaoMock.getSmtpConfigByIdForTenant.mockResolvedValue({
      allowedSenderDomains: ["example.com"],
    });

    const issues = await validateProjectSenderDomainPolicy("tenant-1", {
      status: "진행중",
      smtpAccountId: "smtp-1",
      fromEmail: "sender@example.com",
    });

    expect(issues).toEqual([]);
  });
});
