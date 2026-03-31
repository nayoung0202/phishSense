import { beforeEach, describe, expect, it, vi } from "vitest";

const tenantDomainDaoMock = vi.hoisted(() => ({
  getTenantDomainByTenantId: vi.fn(),
  upsertTenantDomain: vi.fn(),
}));

vi.mock("@/server/dao/tenantDomainDao", () => tenantDomainDaoMock);

import { TenantDomainError, fetchTenantDomainSettings, saveTenantDomain } from "./tenantDomainService";

describe("tenantDomainService", () => {
  beforeEach(() => {
    tenantDomainDaoMock.getTenantDomainByTenantId.mockReset();
    tenantDomainDaoMock.upsertTenantDomain.mockReset();
    process.env.APP_BASE_URL = "https://app.phishsense.cloud";
    process.env.TENANT_DOMAIN_BASE = "phishsense.cloud";
  });

  it("조회 시 저장된 tenant 도메인을 응답 형태로 반환한다", async () => {
    tenantDomainDaoMock.getTenantDomainByTenantId.mockResolvedValue({
      tenantId: "tenant-1",
      slug: "acme",
      fqdn: "acme.phishsense.cloud",
      createdAt: new Date("2026-03-31T00:00:00.000Z"),
      updatedAt: new Date("2026-03-31T00:00:00.000Z"),
    });

    const result = await fetchTenantDomainSettings("tenant-1");

    expect(result.baseDomain).toBe("phishsense.cloud");
    expect(result.domain?.origin).toBe("https://acme.phishsense.cloud");
  });

  it("저장 시 slug를 정규화하고 fqdn을 만든다", async () => {
    tenantDomainDaoMock.upsertTenantDomain.mockResolvedValue({
      tenantId: "tenant-1",
      slug: "acme-security",
      fqdn: "acme-security.phishsense.cloud",
      createdAt: new Date("2026-03-31T00:00:00.000Z"),
      updatedAt: new Date("2026-03-31T00:00:00.000Z"),
    });

    const result = await saveTenantDomain("tenant-1", { slug: " Acme-Security " });

    expect(tenantDomainDaoMock.upsertTenantDomain).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      slug: "acme-security",
      fqdn: "acme-security.phishsense.cloud",
    });
    expect(result.domain?.slug).toBe("acme-security");
  });

  it("점이 들어간 slug는 거부한다", async () => {
    await expect(saveTenantDomain("tenant-1", { slug: "acme.prod" })).rejects.toMatchObject({
      name: "ZodError",
    });
  });

  it("unique 충돌은 409 에러로 변환한다", async () => {
    tenantDomainDaoMock.upsertTenantDomain.mockRejectedValue({
      code: "23505",
    });

    await expect(saveTenantDomain("tenant-1", { slug: "acme" })).rejects.toEqual(
      expect.objectContaining<TenantDomainError>({
        status: 409,
      }),
    );
  });
});
