import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const tenantAccessMock = vi.hoisted(() => ({
  requireScopedTenantAccess: vi.fn(),
}));

const clientMock = vi.hoisted(() => ({
  createPlatformCheckoutSession: vi.fn(),
}));

const auditMock = vi.hoisted(() => ({
  logPlatformAuditEvent: vi.fn(),
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
    createPlatformCheckoutSession: clientMock.createPlatformCheckoutSession,
  };
});

vi.mock("@/server/platform/audit", () => ({
  logPlatformAuditEvent: auditMock.logPlatformAuditEvent,
}));

import { POST } from "./route";

describe("POST /api/platform/tenants/[tenantId]/billing/checkout-sessions", () => {
  beforeEach(() => {
    tenantAccessMock.requireScopedTenantAccess.mockReset();
    clientMock.createPlatformCheckoutSession.mockReset();
    auditMock.logPlatformAuditEvent.mockReset();

    tenantAccessMock.requireScopedTenantAccess.mockResolvedValue({
      auth: {
        accessToken: "access-token",
        user: { sub: "user-1" },
      },
    });
  });

  it("Idempotency-Key가 없으면 400을 반환한다", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/platform/tenants/tenant-1/billing/checkout-sessions", {
        method: "POST",
        body: JSON.stringify({ seatCount: 25 }),
      }),
      {
        params: Promise.resolve({ tenantId: "tenant-1" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Idempotency-Key 헤더가 필요합니다.");
    expect(clientMock.createPlatformCheckoutSession).not.toHaveBeenCalled();
  });

  it("billing v1 고정 payload와 route key를 플랫폼으로 전달한다", async () => {
    clientMock.createPlatformCheckoutSession.mockResolvedValue({
      sessionId: "cs_test_123",
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
      customerId: "cus_123",
    });

    const response = await POST(
      new NextRequest("http://localhost/api/platform/tenants/tenant-1/billing/checkout-sessions", {
        method: "POST",
        headers: {
          "Idempotency-Key": "idem-checkout-1",
        },
        body: JSON.stringify({ seatCount: 25 }),
      }),
      {
        params: Promise.resolve({ tenantId: "tenant-1" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(clientMock.createPlatformCheckoutSession).toHaveBeenCalledWith({
      accessToken: "access-token",
      tenantId: "tenant-1",
      idempotencyKey: "idem-checkout-1",
      input: {
        productId: "PHISHSENSE",
        planCode: "BUSINESS",
        billingCycle: "YEAR",
        seatCount: 25,
        appKey: "PHISHSENSE",
        successRouteKey: "CHECKOUT_SUCCESS",
        cancelRouteKey: "CHECKOUT_CANCEL",
      },
    });
    expect(auditMock.logPlatformAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "billing.checkout_session.created",
        tenantId: "tenant-1",
      }),
    );
    expect(body.url).toContain("checkout.stripe.com");
  });
});
