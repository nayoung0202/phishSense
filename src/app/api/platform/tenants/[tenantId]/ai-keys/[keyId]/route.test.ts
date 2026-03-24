import { beforeEach, describe, expect, it, vi } from "vitest";

const tenantAccessMock = vi.hoisted(() => ({
  requireScopedTenantAccess: vi.fn(),
  TenantAccessError: class TenantAccessError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

const tenantAiKeysMock = vi.hoisted(() => ({
  updateTenantAiKey: vi.fn(),
  deleteTenantAiKey: vi.fn(),
  updateTenantAiKeyRequestSchema: {
    parse: vi.fn(),
  },
  TenantAiKeyServiceError: class TenantAiKeyServiceError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("@/server/platform/tenantAccess", () => tenantAccessMock);
vi.mock("@/server/services/tenantAiKeys", () => tenantAiKeysMock);
vi.mock("@/server/platform/audit", () => ({
  logPlatformAuditEvent: vi.fn(),
}));

import { DELETE, PATCH } from "./route";

describe("tenant ai key item route", () => {
  beforeEach(() => {
    tenantAccessMock.requireScopedTenantAccess.mockReset();
    tenantAiKeysMock.updateTenantAiKey.mockReset();
    tenantAiKeysMock.deleteTenantAiKey.mockReset();
    tenantAiKeysMock.updateTenantAiKeyRequestSchema.parse.mockReset();

    tenantAccessMock.requireScopedTenantAccess.mockResolvedValue({
      auth: { user: { sub: "user-1" } },
    });
  });

  it("PATCH는 활성 상태를 수정한다", async () => {
    tenantAiKeysMock.updateTenantAiKeyRequestSchema.parse.mockImplementation((value: unknown) => value);
    tenantAiKeysMock.updateTenantAiKey.mockResolvedValue({
      keyId: "key-1",
      provider: "CLAUDE",
      label: "Claude key",
      maskedValue: "sk-ant...1234",
      status: "INACTIVE",
      scopes: ["template-ai"],
      createdAt: "2026-03-25T00:00:00.000Z",
      updatedAt: "2026-03-25T01:00:00.000Z",
      lastUsedAt: null,
    });

    const response = await PATCH(
      new Request("http://localhost/api/platform/tenants/tenant-a/ai-keys/key-1", {
        method: "PATCH",
        body: JSON.stringify({
          status: "INACTIVE",
        }),
      }) as never,
      { params: Promise.resolve({ tenantId: "tenant-a", keyId: "key-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("INACTIVE");
  });

  it("DELETE는 로컬 키를 삭제한다", async () => {
    tenantAiKeysMock.deleteTenantAiKey.mockResolvedValue(true);

    const response = await DELETE(
      new Request("http://localhost/api/platform/tenants/tenant-a/ai-keys/key-1", {
        method: "DELETE",
      }) as never,
      { params: Promise.resolve({ tenantId: "tenant-a", keyId: "key-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(tenantAiKeysMock.deleteTenantAiKey).toHaveBeenCalledWith("tenant-a", "key-1");
  });
});
