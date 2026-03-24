import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const tenantAccessMock = vi.hoisted(() => ({
  requireScopedTenantAccess: vi.fn(),
}));

const clientMock = vi.hoisted(() => ({
  createPlatformPortalSession: vi.fn(),
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
    createPlatformPortalSession: clientMock.createPlatformPortalSession,
  };
});

vi.mock("@/server/platform/audit", () => ({
  logPlatformAuditEvent: auditMock.logPlatformAuditEvent,
}));

import { POST } from "./route";

describe("POST /api/platform/tenants/[tenantId]/billing/portal-sessions", () => {
  beforeEach(() => {
    tenantAccessMock.requireScopedTenantAccess.mockReset();
    clientMock.createPlatformPortalSession.mockReset();
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
      new NextRequest("http://localhost/api/platform/tenants/tenant-1/billing/portal-sessions", {
        method: "POST",
        body: JSON.stringify({ flowType: "payment_method_update" }),
      }),
      {
        params: Promise.resolve({ tenantId: "tenant-1" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Idempotency-Key 헤더가 필요합니다.");
    expect(clientMock.createPlatformPortalSession).not.toHaveBeenCalled();
  });

  it("허용된 portal flow와 route key만 플랫폼으로 전달한다", async () => {
    clientMock.createPlatformPortalSession.mockResolvedValue({
      sessionId: "bps_123",
      url: "https://billing.stripe.com/p/session/test_123",
      customerId: "cus_123",
    });

    const response = await POST(
      new NextRequest("http://localhost/api/platform/tenants/tenant-1/billing/portal-sessions", {
        method: "POST",
        headers: {
          "Idempotency-Key": "idem-portal-1",
        },
        body: JSON.stringify({ flowType: "subscription_cancel" }),
      }),
      {
        params: Promise.resolve({ tenantId: "tenant-1" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(clientMock.createPlatformPortalSession).toHaveBeenCalledWith({
      accessToken: "access-token",
      tenantId: "tenant-1",
      idempotencyKey: "idem-portal-1",
      input: {
        productId: "PHISHSENSE",
        flowType: "subscription_cancel",
        appKey: "PHISHSENSE",
        returnRouteKey: "PORTAL_RETURN",
        afterCompletionRouteKey: "PORTAL_DONE",
      },
    });
    expect(auditMock.logPlatformAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "billing.portal_session.created",
        tenantId: "tenant-1",
      }),
    );
    expect(body.url).toContain("billing.stripe.com");
  });
});
