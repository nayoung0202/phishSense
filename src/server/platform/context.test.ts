import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionStoreMock = vi.hoisted(() => ({
  setAuthSessionTenant: vi.fn(),
}));

const entitlementDaoMock = vi.hoisted(() => ({
  getPlatformEntitlement: vi.fn(),
}));

const clientMock = vi.hoisted(() => ({
  fetchPlatformMe: vi.fn(),
}));

const configMock = vi.hoisted(() => ({
  getPlatformClientConfig: vi.fn(),
}));

vi.mock("@/server/auth/sessionStore", () => ({
  setAuthSessionTenant: sessionStoreMock.setAuthSessionTenant,
}));

vi.mock("@/server/dao/platformEntitlementDao", () => ({
  getPlatformEntitlement: entitlementDaoMock.getPlatformEntitlement,
}));

vi.mock("@/server/platform/client", async () => {
  const actual = await vi.importActual<typeof import("@/server/platform/client")>(
    "@/server/platform/client",
  );

  return {
    ...actual,
    fetchPlatformMe: clientMock.fetchPlatformMe,
  };
});

vi.mock("@/server/platform/config", () => ({
  getPlatformClientConfig: configMock.getPlatformClientConfig,
}));

import { resolvePlatformContext } from "./context";

const baseAuth = {
  sessionId: "session-1",
  user: { sub: "user-1", email: "owner@acme.com", name: "Owner" },
  tenantId: "tenant-1",
  accessToken: "access-token",
  idleExpiresAt: new Date("2026-03-24T00:00:00Z").toISOString(),
  absoluteExpiresAt: new Date("2026-03-25T00:00:00Z").toISOString(),
};

describe("resolvePlatformContext", () => {
  beforeEach(() => {
    sessionStoreMock.setAuthSessionTenant.mockReset();
    entitlementDaoMock.getPlatformEntitlement.mockReset();
    clientMock.fetchPlatformMe.mockReset();
    configMock.getPlatformClientConfig.mockReset();

    configMock.getPlatformClientConfig.mockReturnValue({
      baseUrl: "https://platform.example.com",
    });
    sessionStoreMock.setAuthSessionTenant.mockResolvedValue(undefined);
  });

  it("활성 entitlement shortcut에서도 platform membership을 채운다", async () => {
    entitlementDaoMock.getPlatformEntitlement.mockResolvedValue({
      tenantId: "tenant-1",
      productId: "PHISHSENSE",
      planCode: "FREE",
      status: "ACTIVE",
      seatLimit: 5,
      expiresAt: null,
      sourceType: "BOOTSTRAP",
      lastEventId: "evt-1",
      createdAt: new Date("2026-03-24T00:00:00Z"),
      updatedAt: new Date("2026-03-24T00:00:00Z"),
    });
    clientMock.fetchPlatformMe.mockResolvedValue({
      userId: "user-1",
      email: "owner@acme.com",
      hasTenant: true,
      currentTenantId: "tenant-1",
      tenants: [{ tenantId: "tenant-1", name: "Acme", role: "OWNER" }],
      products: [
        {
          tenantId: "tenant-1",
          productId: "PHISHSENSE",
          status: "ACTIVE",
          plan: "FREE",
          seatLimit: 5,
          expiresAt: null,
        },
      ],
    });

    const result = await resolvePlatformContext({
      auth: baseAuth,
      forceRefresh: true,
    });

    expect(clientMock.fetchPlatformMe).toHaveBeenCalledWith({
      accessToken: "access-token",
      tenantId: "tenant-1",
    });
    expect(result.status).toBe("ready");
    expect(result.currentTenantId).toBe("tenant-1");
    expect(result.tenants).toEqual([
      { tenantId: "tenant-1", name: "Acme", role: "OWNER" },
    ]);
    expect(result.platformProduct?.productId).toBe("PHISHSENSE");
  });

  it("platform 조회가 실패해도 활성 entitlement면 ready fallback을 유지한다", async () => {
    entitlementDaoMock.getPlatformEntitlement.mockResolvedValue({
      tenantId: "tenant-1",
      productId: "PHISHSENSE",
      planCode: "FREE",
      status: "ACTIVE",
      seatLimit: 5,
      expiresAt: null,
      sourceType: "BOOTSTRAP",
      lastEventId: "evt-1",
      createdAt: new Date("2026-03-24T00:00:00Z"),
      updatedAt: new Date("2026-03-24T00:00:00Z"),
    });
    clientMock.fetchPlatformMe.mockRejectedValue(new Error("unavailable"));

    const result = await resolvePlatformContext({
      auth: baseAuth,
      forceRefresh: true,
    });

    expect(result.status).toBe("ready");
    expect(result.currentTenantId).toBe("tenant-1");
    expect(result.tenants).toEqual([]);
    expect(result.localEntitlement?.status).toBe("ACTIVE");
  });
});
