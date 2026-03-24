import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PlatformApiError } from "@/server/platform/client";

const authMock = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}));

const clientMock = vi.hoisted(() => ({
  acceptPlatformTenantInvite: vi.fn(),
}));

const contextMock = vi.hoisted(() => ({
  resolvePlatformContext: vi.fn(),
}));

vi.mock("@/server/auth/requireAuth", () => ({
  requireAuth: authMock.requireAuth,
}));

vi.mock("@/server/platform/client", async () => {
  const actual = await vi.importActual<typeof import("@/server/platform/client")>(
    "@/server/platform/client",
  );

  return {
    ...actual,
    acceptPlatformTenantInvite: clientMock.acceptPlatformTenantInvite,
  };
});

vi.mock("@/server/platform/context", () => ({
  resolvePlatformContext: contextMock.resolvePlatformContext,
}));

vi.mock("@/server/platform/audit", () => ({
  logPlatformAuditEvent: vi.fn(),
}));

import { POST } from "./route";

describe("POST /api/platform/tenant-invites/[token]/accept", () => {
  beforeEach(() => {
    authMock.requireAuth.mockReset();
    clientMock.acceptPlatformTenantInvite.mockReset();
    contextMock.resolvePlatformContext.mockReset();

    authMock.requireAuth.mockResolvedValue({
      sessionId: "session-1",
      user: { sub: "user-1", email: "member@evriz.co.kr", name: "멤버" },
      tenantId: null,
      accessToken: "access-token",
      idleExpiresAt: new Date().toISOString(),
      absoluteExpiresAt: new Date().toISOString(),
    });
    contextMock.resolvePlatformContext.mockResolvedValue({
      status: "ready",
      hasAccess: true,
      onboardingRequired: false,
      tenantId: "tenant-1",
      currentTenantId: "tenant-1",
      tenants: [{ tenantId: "tenant-1", name: "EVRIZ", role: "MEMBER" }],
      products: [],
      platformProduct: null,
      localEntitlement: null,
    });
  });

  it("초대 수락 후 최신 platform context를 반환한다", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/platform/tenant-invites/token-1/accept", {
        method: "POST",
      }),
      {
        params: Promise.resolve({ token: "token-1" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(clientMock.acceptPlatformTenantInvite).toHaveBeenCalledWith({
      accessToken: "access-token",
      token: "token-1",
    });
    expect(body.platformContext.currentTenantId).toBe("tenant-1");
  });

  it("platform 404를 사용자 메시지로 변환한다", async () => {
    clientMock.acceptPlatformTenantInvite.mockRejectedValue(
      new PlatformApiError(404, "not found"),
    );

    const response = await POST(
      new NextRequest("http://localhost/api/platform/tenant-invites/token-1/accept", {
        method: "POST",
      }),
      {
        params: Promise.resolve({ token: "token-1" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toContain("찾을 수 없습니다");
  });
});
