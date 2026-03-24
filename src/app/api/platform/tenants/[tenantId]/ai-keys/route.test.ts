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
  listTenantAiKeys: vi.fn(),
  createTenantAiKey: vi.fn(),
  TenantAiKeyServiceError: class TenantAiKeyServiceError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  createTenantAiKeyRequestSchema: {
    parse: vi.fn(),
  },
}));

vi.mock("@/server/platform/tenantAccess", () => tenantAccessMock);
vi.mock("@/server/services/tenantAiKeys", () => tenantAiKeysMock);
vi.mock("@/server/platform/audit", () => ({
  logPlatformAuditEvent: vi.fn(),
}));

import { GET, POST } from "./route";

describe("tenant ai key collection route", () => {
  beforeEach(() => {
    tenantAccessMock.requireScopedTenantAccess.mockReset();
    tenantAiKeysMock.listTenantAiKeys.mockReset();
    tenantAiKeysMock.createTenantAiKey.mockReset();
    tenantAiKeysMock.createTenantAiKeyRequestSchema.parse.mockReset();

    tenantAccessMock.requireScopedTenantAccess.mockResolvedValue({
      auth: { user: { sub: "user-1" } },
    });
  });

  it("GET은 로컬 BYOK 목록을 반환한다", async () => {
    tenantAiKeysMock.listTenantAiKeys.mockResolvedValue([
      {
        keyId: "key-1",
        provider: "CLAUDE",
        label: "Claude key",
        maskedValue: "sk-ant...1234",
        status: "ACTIVE",
        scopes: ["template-ai"],
        createdAt: "2026-03-25T00:00:00.000Z",
        updatedAt: "2026-03-25T00:00:00.000Z",
        lastUsedAt: null,
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/platform/tenants/tenant-a/ai-keys") as never,
      { params: Promise.resolve({ tenantId: "tenant-a" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].provider).toBe("CLAUDE");
  });

  it("POST는 CLAUDE provider를 포함한 로컬 키를 저장한다", async () => {
    tenantAiKeysMock.createTenantAiKeyRequestSchema.parse.mockImplementation((value: unknown) => value);
    tenantAiKeysMock.createTenantAiKey.mockResolvedValue({
      keyId: "key-1",
      provider: "CLAUDE",
      label: "Claude key",
      maskedValue: "sk-ant...1234",
      status: "ACTIVE",
      scopes: ["template-ai", "training-page-ai"],
      createdAt: "2026-03-25T00:00:00.000Z",
      updatedAt: "2026-03-25T00:00:00.000Z",
      lastUsedAt: null,
    });

    const response = await POST(
      new Request("http://localhost/api/platform/tenants/tenant-a/ai-keys", {
        method: "POST",
        body: JSON.stringify({
          provider: "CLAUDE",
          label: "Claude key",
          apiKey: "sk-ant-test",
          scopes: ["template-ai", "training-page-ai"],
        }),
      }) as never,
      { params: Promise.resolve({ tenantId: "tenant-a" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.provider).toBe("CLAUDE");
    expect(tenantAiKeysMock.createTenantAiKey).toHaveBeenCalledWith(
      "tenant-a",
      expect.objectContaining({
        provider: "CLAUDE",
      }),
    );
  });
});
