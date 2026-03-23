import { beforeEach, describe, expect, it, vi } from "vitest";
import { TENANT_A_ID } from "@/test/tenantFixtures";

const currentTenantMock = vi.hoisted(() => ({
  requireReadyTenant: vi.fn(),
  buildReadyTenantErrorResponse: vi.fn((_error, message: string, status = 500) =>
    Response.json({ error: message }, { status }),
  ),
}));

const adminSmtpServiceMock = vi.hoisted(() => ({
  AdminSmtpError: class extends Error {
    status: number;
    body: Record<string, unknown>;

    constructor(status: number, body: Record<string, unknown>) {
      super(String(body.message ?? "error"));
      this.status = status;
      this.body = body;
    }
  },
  createTenantSmtpConfig: vi.fn(),
  fetchTenantSmtpConfigSummaries: vi.fn(),
}));

vi.mock("@/server/tenant/currentTenant", () => currentTenantMock);
vi.mock("@/server/services/adminSmtpService", () => adminSmtpServiceMock);

import { GET, POST } from "./route";

describe("GET /api/admin/smtp-configs", () => {
  beforeEach(() => {
    currentTenantMock.requireReadyTenant.mockReset();
    adminSmtpServiceMock.fetchTenantSmtpConfigSummaries.mockReset();
    currentTenantMock.requireReadyTenant.mockResolvedValue({ tenantId: TENANT_A_ID });
  });

  it("현재 테넌트 기준 SMTP 목록을 반환한다", async () => {
    adminSmtpServiceMock.fetchTenantSmtpConfigSummaries.mockResolvedValue([
      {
        id: "smtp-1",
        tenantId: TENANT_A_ID,
        name: "alerts@tenant-a.example",
        host: "smtp.tenant-a.example",
        port: 587,
        securityMode: "STARTTLS",
        username: "alerts@tenant-a.example",
        allowedSenderDomains: ["tenant-a.example"],
        isActive: true,
        hasPassword: true,
        lastTestedAt: null,
        lastTestStatus: null,
        updatedAt: "2026-03-20T00:00:00.000Z",
      },
    ]);

    const response = await GET(new Request("http://localhost/api/admin/smtp-configs") as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(adminSmtpServiceMock.fetchTenantSmtpConfigSummaries).toHaveBeenCalledWith(TENANT_A_ID);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("smtp-1");
  });
});

describe("POST /api/admin/smtp-configs", () => {
  beforeEach(() => {
    currentTenantMock.requireReadyTenant.mockReset();
    adminSmtpServiceMock.createTenantSmtpConfig.mockReset();
    currentTenantMock.requireReadyTenant.mockResolvedValue({ tenantId: TENANT_A_ID });
  });

  it("현재 테넌트에 SMTP 설정을 생성한다", async () => {
    adminSmtpServiceMock.createTenantSmtpConfig.mockResolvedValue({
      ok: true,
      item: {
        id: "smtp-1",
        tenantId: TENANT_A_ID,
      },
    });

    const request = new Request("http://localhost/api/admin/smtp-configs", {
      method: "POST",
      body: JSON.stringify({
        host: "smtp.tenant-a.example",
        port: 587,
        securityMode: "STARTTLS",
        username: "alerts@tenant-a.example",
      }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    expect(adminSmtpServiceMock.createTenantSmtpConfig).toHaveBeenCalledWith(
      TENANT_A_ID,
      expect.objectContaining({
        host: "smtp.tenant-a.example",
        username: "alerts@tenant-a.example",
      }),
    );
  });
});
