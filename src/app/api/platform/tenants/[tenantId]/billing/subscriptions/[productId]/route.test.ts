import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PlatformApiError } from "@/server/platform/client";

const tenantAccessMock = vi.hoisted(() => ({
  requireScopedTenantAccess: vi.fn(),
}));

const clientMock = vi.hoisted(() => ({
  fetchPlatformBillingSubscription: vi.fn(),
}));

vi.mock("@/server/platform/tenantAccess", () => ({
  requireScopedTenantAccess: tenantAccessMock.requireScopedTenantAccess,
  TenantAccessError: class TenantAccessError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));

vi.mock("@/server/platform/client", async () => {
  const actual = await vi.importActual<typeof import("@/server/platform/client")>(
    "@/server/platform/client",
  );

  return {
    ...actual,
    fetchPlatformBillingSubscription: clientMock.fetchPlatformBillingSubscription,
  };
});

import { GET } from "./route";

describe("GET /api/platform/tenants/[tenantId]/billing/subscriptions/[productId]", () => {
  beforeEach(() => {
    tenantAccessMock.requireScopedTenantAccess.mockReset();
    clientMock.fetchPlatformBillingSubscription.mockReset();

    tenantAccessMock.requireScopedTenantAccess.mockResolvedValue({
      auth: {
        accessToken: "access-token",
        user: { sub: "user-1" },
      },
    });
  });

  it("지원하지 않는 productId면 400을 반환한다", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/platform/tenants/tenant-1/billing/subscriptions/OTHER",
      ),
      {
        params: Promise.resolve({ tenantId: "tenant-1", productId: "OTHER" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("지원하지 않는 productId 입니다.");
    expect(clientMock.fetchPlatformBillingSubscription).not.toHaveBeenCalled();
  });

  it("tenant membership만 확인하고 billing subscription을 조회한다", async () => {
    clientMock.fetchPlatformBillingSubscription.mockResolvedValue({
      tenantId: "tenant-1",
      productId: "PHISHSENSE",
      providerSubscriptionId: "sub_123",
      planCode: "BUSINESS",
      billingCycle: "YEAR",
      quantity: 25,
      status: "active",
      cancelAtPeriodEnd: false,
      cancelAt: null,
      canceledAt: null,
      currentPeriodStartAt: "2026-03-25T00:00:00Z",
      currentPeriodEndAt: "2027-03-25T00:00:00Z",
      current: true,
      lastSubscriptionEventCreatedAt: "2026-03-25T00:10:00Z",
    });

    const request = new NextRequest(
      "http://localhost/api/platform/tenants/tenant-1/billing/subscriptions/PHISHSENSE",
    );
    const response = await GET(request, {
      params: Promise.resolve({ tenantId: "tenant-1", productId: "PHISHSENSE" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(tenantAccessMock.requireScopedTenantAccess).toHaveBeenCalledWith({
      request,
      tenantId: "tenant-1",
    });
    expect(clientMock.fetchPlatformBillingSubscription).toHaveBeenCalledWith({
      accessToken: "access-token",
      tenantId: "tenant-1",
      productId: "PHISHSENSE",
    });
    expect(body.status).toBe("active");
  });

  it("platform 404를 그대로 전달한다", async () => {
    clientMock.fetchPlatformBillingSubscription.mockRejectedValue(
      new PlatformApiError(404, "not-found"),
    );

    const response = await GET(
      new NextRequest(
        "http://localhost/api/platform/tenants/tenant-1/billing/subscriptions/PHISHSENSE",
      ),
      {
        params: Promise.resolve({ tenantId: "tenant-1", productId: "PHISHSENSE" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("현재 billing subscription을 찾을 수 없습니다.");
  });
});
