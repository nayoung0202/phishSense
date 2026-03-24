import { beforeEach, describe, expect, it, vi } from "vitest";

const currentTenantMock = vi.hoisted(() => ({
  requireReadyTenant: vi.fn(),
}));

const tenantAiKeysMock = vi.hoisted(() => ({
  hasActiveTenantAiKeyForScope: vi.fn(),
}));

const platformClientMock = vi.hoisted(() => ({
  authorizePlatformCredits: vi.fn(),
  settlePlatformCreditAuthorization: vi.fn(),
  releasePlatformCreditAuthorization: vi.fn(),
  PlatformApiError: class PlatformApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/tenant/currentTenant", () => currentTenantMock);
vi.mock("@/server/services/tenantAiKeys", () => tenantAiKeysMock);
vi.mock("@/server/platform/client", () => platformClientMock);
vi.mock("@/server/featureFlags", () => ({
  getFeatureFlags: () => ({
    settingsV2Enabled: true,
    billingUiEnabled: true,
    creditsEnforcementEnabled: true,
    byokUiEnabled: true,
  }),
}));

import { executeWithAiCreditGate } from "./aiCredits";

describe("executeWithAiCreditGate", () => {
  beforeEach(() => {
    currentTenantMock.requireReadyTenant.mockReset();
    tenantAiKeysMock.hasActiveTenantAiKeyForScope.mockReset();
    platformClientMock.authorizePlatformCredits.mockReset();
    platformClientMock.settlePlatformCreditAuthorization.mockReset();
    platformClientMock.releasePlatformCreditAuthorization.mockReset();

    currentTenantMock.requireReadyTenant.mockResolvedValue({
      tenantId: "tenant-a",
      auth: {
        accessToken: "token",
      },
    });
  });

  it("로컬 활성 BYOK가 있으면 플랫폼 credit authorization 없이 action을 실행한다", async () => {
    tenantAiKeysMock.hasActiveTenantAiKeyForScope.mockResolvedValue(true);
    const action = vi.fn().mockResolvedValue("ok");

    const result = await executeWithAiCreditGate({
      request: new Request("http://localhost/api/templates/ai-generate") as never,
      kind: "template",
      usageContext: "standard",
      action,
    });

    expect(result).toBe("ok");
    expect(action).toHaveBeenCalledWith({ tenantId: "tenant-a" });
    expect(platformClientMock.authorizePlatformCredits).not.toHaveBeenCalled();
  });
});
