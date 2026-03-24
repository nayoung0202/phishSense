import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PlatformApiError } from "@/server/platform/client";

const tenantAccessMock = vi.hoisted(() => ({
  requireScopedTenantAccess: vi.fn(),
}));

const clientMock = vi.hoisted(() => ({
  createPlatformTenantInvite: vi.fn(),
}));

vi.mock("@/server/platform/tenantAccess", () => ({
  requireScopedTenantAccess: tenantAccessMock.requireScopedTenantAccess,
  TenantAccessError: class TenantAccessError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("@/server/platform/client", async () => {
  const actual = await vi.importActual<typeof import("@/server/platform/client")>(
    "@/server/platform/client",
  );

  return {
    ...actual,
    createPlatformTenantInvite: clientMock.createPlatformTenantInvite,
  };
});

vi.mock("@/server/platform/audit", () => ({
  logPlatformAuditEvent: vi.fn(),
}));

import { POST } from "./route";

describe("POST /api/platform/tenants/[tenantId]/invites", () => {
  beforeEach(() => {
    tenantAccessMock.requireScopedTenantAccess.mockReset();
    clientMock.createPlatformTenantInvite.mockReset();
    tenantAccessMock.requireScopedTenantAccess.mockResolvedValue({
      tenantId: "tenant-1",
      auth: {
        user: { sub: "user-1" },
        accessToken: "access-token",
      },
    });
  });

  it("OWNER/ADMIN이면 초대 링크를 생성한다", async () => {
    clientMock.createPlatformTenantInvite.mockResolvedValue({
      inviteId: "invite-1",
      inviteToken: "token-1",
      expiresAt: "2026-03-31T00:00:00Z",
    });

    const response = await POST(
      new NextRequest("http://localhost/api/platform/tenants/tenant-1/invites", {
        method: "POST",
        body: JSON.stringify({
          email: "member@evriz.co.kr",
          role: "MEMBER",
          expiresInDays: 7,
        }),
      }),
      {
        params: Promise.resolve({ tenantId: "tenant-1" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(clientMock.createPlatformTenantInvite).toHaveBeenCalledWith({
      accessToken: "access-token",
      tenantId: "tenant-1",
      invite: {
        email: "member@evriz.co.kr",
        role: "MEMBER",
        expiresInDays: 7,
      },
    });
    expect(body.inviteToken).toBe("token-1");
  });

  it("platform 409를 사용자 메시지로 변환한다", async () => {
    clientMock.createPlatformTenantInvite.mockRejectedValue(
      new PlatformApiError(409, "conflict"),
    );

    const response = await POST(
      new NextRequest("http://localhost/api/platform/tenants/tenant-1/invites", {
        method: "POST",
        body: JSON.stringify({
          email: "member@evriz.co.kr",
          role: "MEMBER",
          expiresInDays: 7,
        }),
      }),
      {
        params: Promise.resolve({ tenantId: "tenant-1" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("이미 멤버");
  });
});
