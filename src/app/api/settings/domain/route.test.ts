import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const currentTenantMock = vi.hoisted(() => ({
  requireReadyTenant: vi.fn(),
  buildReadyTenantErrorResponse: vi.fn(),
}));

const tenantDomainServiceMock = vi.hoisted(() => ({
  TenantDomainError: class TenantDomainError extends Error {
    status: number;
    body: Record<string, unknown>;

    constructor(status: number, body: Record<string, unknown>) {
      super(String(body.error ?? body.message ?? "tenant domain error"));
      this.status = status;
      this.body = body;
    }
  },
  fetchTenantDomainSettings: vi.fn(),
  saveTenantDomain: vi.fn(),
}));

vi.mock("@/server/tenant/currentTenant", () => currentTenantMock);
vi.mock("@/server/services/tenantDomainService", () => {
  return {
    TenantDomainError: tenantDomainServiceMock.TenantDomainError,
    fetchTenantDomainSettings: tenantDomainServiceMock.fetchTenantDomainSettings,
    saveTenantDomain: tenantDomainServiceMock.saveTenantDomain,
  };
});

import { TenantDomainError } from "@/server/services/tenantDomainService";
import { GET, POST } from "./route";

describe("GET/POST /api/settings/domain", () => {
  beforeEach(() => {
    currentTenantMock.requireReadyTenant.mockReset();
    currentTenantMock.buildReadyTenantErrorResponse.mockReset();
    tenantDomainServiceMock.fetchTenantDomainSettings.mockReset();
    tenantDomainServiceMock.saveTenantDomain.mockReset();
  });

  it("OWNER 또는 ADMIN만 조회할 수 있다", async () => {
    currentTenantMock.requireReadyTenant.mockResolvedValue({
      tenantId: "tenant-1",
      platform: {
        tenants: [{ tenantId: "tenant-1", name: "Acme", role: "MEMBER" }],
      },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/settings/domain"),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("OWNER 또는 ADMIN");
  });

  it("OWNER 조회 시 현재 tenant 도메인 정보를 반환한다", async () => {
    currentTenantMock.requireReadyTenant.mockResolvedValue({
      tenantId: "tenant-1",
      platform: {
        tenants: [{ tenantId: "tenant-1", name: "Acme", role: "OWNER" }],
      },
    });
    tenantDomainServiceMock.fetchTenantDomainSettings.mockResolvedValue({
      tenantId: "tenant-1",
      baseDomain: "phishsense.cloud",
      domain: {
        tenantId: "tenant-1",
        slug: "acme",
        fqdn: "acme.phishsense.cloud",
        origin: "https://acme.phishsense.cloud",
        createdAt: null,
        updatedAt: null,
      },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/settings/domain"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(tenantDomainServiceMock.fetchTenantDomainSettings).toHaveBeenCalledWith("tenant-1");
    expect(body.domain.fqdn).toBe("acme.phishsense.cloud");
  });

  it("POST는 OWNER만 허용한다", async () => {
    currentTenantMock.requireReadyTenant.mockResolvedValue({
      tenantId: "tenant-1",
      platform: {
        tenants: [{ tenantId: "tenant-1", name: "Acme", role: "ADMIN" }],
      },
    });

    const response = await POST(
      new NextRequest("http://localhost/api/settings/domain", {
        method: "POST",
        body: JSON.stringify({ slug: "acme" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("OWNER");
  });

  it("OWNER POST는 slug를 저장한다", async () => {
    currentTenantMock.requireReadyTenant.mockResolvedValue({
      tenantId: "tenant-1",
      platform: {
        tenants: [{ tenantId: "tenant-1", name: "Acme", role: "OWNER" }],
      },
    });
    tenantDomainServiceMock.saveTenantDomain.mockResolvedValue({
      tenantId: "tenant-1",
      baseDomain: "phishsense.cloud",
      domain: {
        tenantId: "tenant-1",
        slug: "acme",
        fqdn: "acme.phishsense.cloud",
        origin: "https://acme.phishsense.cloud",
        createdAt: null,
        updatedAt: null,
      },
    });

    const response = await POST(
      new NextRequest("http://localhost/api/settings/domain", {
        method: "POST",
        body: JSON.stringify({ slug: "Acme" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(tenantDomainServiceMock.saveTenantDomain).toHaveBeenCalledWith("tenant-1", {
      slug: "Acme",
    });
    expect(body.domain.slug).toBe("acme");
  });

  it("service 에러를 상태 코드와 함께 전달한다", async () => {
    currentTenantMock.requireReadyTenant.mockResolvedValue({
      tenantId: "tenant-1",
      platform: {
        tenants: [{ tenantId: "tenant-1", name: "Acme", role: "OWNER" }],
      },
    });
    tenantDomainServiceMock.saveTenantDomain.mockRejectedValue(
      new TenantDomainError(409, {
        error: "이미 사용 중인 slug입니다.",
      }),
    );

    const response = await POST(
      new NextRequest("http://localhost/api/settings/domain", {
        method: "POST",
        body: JSON.stringify({ slug: "acme" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("이미 사용 중");
  });
});
