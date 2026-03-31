import { beforeEach, describe, expect, it, vi } from "vitest";

const currentTenantMock = vi.hoisted(() => ({
  requireReadyTenant: vi.fn(),
}));

const tenantCreditsMock = vi.hoisted(() => ({
  consumeTenantCredits: vi.fn(),
  listTenantCreditPolicies: vi.fn(),
  TenantCreditServiceError: class TenantCreditServiceError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

const featureFlagsMock = vi.hoisted(() => ({
  getFeatureFlags: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/tenant/currentTenant", () => currentTenantMock);
vi.mock("@/server/services/tenantCredits", () => tenantCreditsMock);
vi.mock("@/server/featureFlags", () => featureFlagsMock);

import {
  AiCreditGateError,
  consumeAiApplyCredits,
  executeWithAiCreditGate,
} from "./aiCredits";

describe("aiCredits", () => {
  beforeEach(() => {
    currentTenantMock.requireReadyTenant.mockReset();
    tenantCreditsMock.consumeTenantCredits.mockReset();
    tenantCreditsMock.listTenantCreditPolicies.mockReset();
    featureFlagsMock.getFeatureFlags.mockReset();

    currentTenantMock.requireReadyTenant.mockResolvedValue({
      tenantId: "tenant-a",
      auth: {
        accessToken: "token",
      },
    });
    tenantCreditsMock.listTenantCreditPolicies.mockReturnValue([
      {
        featureKey: "template_ai_generate",
        label: "AI 템플릿 생성",
        cost: 2,
        usageContexts: ["standard", "experience"],
      },
      {
        featureKey: "training_page_ai_generate",
        label: "AI 훈련 안내 페이지 생성",
        cost: 1,
        usageContexts: ["standard"],
      },
    ]);
    featureFlagsMock.getFeatureFlags.mockReturnValue({
      settingsV2Enabled: true,
      billingUiEnabled: true,
      creditsEnforcementEnabled: true,
      byokUiEnabled: false,
    });
  });

  it("생성 helper는 tenant 컨텍스트만 넘기고 action을 실행한다", async () => {
    const action = vi.fn().mockResolvedValue("ok");

    const result = await executeWithAiCreditGate({
      request: new Request("http://localhost/api/templates/ai-generate") as never,
      kind: "template",
      usageContext: "experience",
      action,
    });

    expect(result).toBe("ok");
    expect(action).toHaveBeenCalledWith({ tenantId: "tenant-a" });
    expect(tenantCreditsMock.consumeTenantCredits).not.toHaveBeenCalled();
  });

  it("반영 시 차감 가능하면 consumeTenantCredits를 호출한다", async () => {
    tenantCreditsMock.consumeTenantCredits.mockResolvedValue({
      status: "consumed",
      featureKey: "template_ai_generate",
      usageContext: "experience",
      cost: 2,
      remainingCredits: 8,
    });

    const result = await consumeAiApplyCredits({
      request: new Request("http://localhost/api/templates/ai-apply") as never,
      kind: "template",
      usageContext: "experience",
      metadata: {
        candidateId: "candidate-1",
      },
    });

    expect(result).toEqual({
      tenantId: "tenant-a",
      charged: true,
      cost: 2,
      remainingCredits: 8,
    });
    expect(tenantCreditsMock.consumeTenantCredits).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      featureKey: "template_ai_generate",
      usageContext: "experience",
      quantity: 1,
      metadata: {
        kind: "template",
        phase: "apply_candidate",
        candidateId: "candidate-1",
      },
    });
  });

  it("크레딧 부족이면 recharge URL을 포함한 402 오류를 던진다", async () => {
    tenantCreditsMock.consumeTenantCredits.mockResolvedValue({
      status: "blocked",
      featureKey: "training_page_ai_generate",
      usageContext: "standard",
      cost: 1,
      remainingCredits: 0,
      reasonCode: "INSUFFICIENT_CREDITS",
      message: "크레딧이 부족합니다.",
      rechargeUrl: "mailto:sales@evriz.co.kr",
    });

    await expect(
      consumeAiApplyCredits({
        request: new Request("http://localhost/api/training-pages/ai-apply") as never,
        kind: "training-page",
        usageContext: "standard",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AiCreditGateError>>({
        status: 402,
        message: "크레딧이 부족합니다.",
        rechargeUrl: "mailto:sales@evriz.co.kr",
        requiredCredits: 1,
        remainingCredits: 0,
      }),
    );
  });

  it("차감 enforcement가 꺼져 있으면 실제 차감 없이 통과시킨다", async () => {
    featureFlagsMock.getFeatureFlags.mockReturnValue({
      settingsV2Enabled: true,
      billingUiEnabled: true,
      creditsEnforcementEnabled: false,
      byokUiEnabled: false,
    });

    const result = await consumeAiApplyCredits({
      request: new Request("http://localhost/api/templates/ai-apply") as never,
      kind: "template",
      usageContext: "standard",
    });

    expect(result).toEqual({
      tenantId: "tenant-a",
      charged: false,
      cost: 2,
      remainingCredits: null,
    });
    expect(tenantCreditsMock.consumeTenantCredits).not.toHaveBeenCalled();
  });
});
