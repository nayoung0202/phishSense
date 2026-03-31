import type { NextRequest } from "next/server";
import { getFeatureFlags } from "@/server/featureFlags";
import {
  consumeTenantCredits,
  listTenantCreditPolicies,
  TenantCreditServiceError,
} from "@/server/services/tenantCredits";
import { requireReadyTenant } from "@/server/tenant/currentTenant";

export class AiCreditGateError extends Error {
  status: number;
  rechargeUrl: string | null;
  requiredCredits: number | null;
  remainingCredits: number | null;

  constructor(
    status: number,
    message: string,
    options?: {
      rechargeUrl?: string | null;
      requiredCredits?: number | null;
      remainingCredits?: number | null;
    },
  ) {
    super(message);
    this.status = status;
    this.rechargeUrl = options?.rechargeUrl ?? null;
    this.requiredCredits = options?.requiredCredits ?? null;
    this.remainingCredits = options?.remainingCredits ?? null;
  }
}

const resolveFeatureKey = (kind: "template" | "training-page") => {
  if (kind === "template") {
    return "template_ai_generate";
  }

  return "training_page_ai_generate";
};

const resolveRequiredCredits = (featureKey: string) => {
  const policy = listTenantCreditPolicies().find((item) => item.featureKey === featureKey);
  return policy?.cost ?? null;
};

export async function consumeAiApplyCredits(options: {
  request: NextRequest;
  kind: "template" | "training-page";
  usageContext: string;
  metadata?: Record<string, unknown>;
}) {
  const featureFlags = getFeatureFlags();
  const context = await requireReadyTenant(options.request);
  const featureKey = resolveFeatureKey(options.kind);

  if (!featureFlags.creditsEnforcementEnabled) {
    return {
      tenantId: context.tenantId,
      charged: false,
      cost: resolveRequiredCredits(featureKey),
      remainingCredits: null,
    };
  }

  const consumption = await consumeTenantCredits({
    tenantId: context.tenantId,
    featureKey,
    usageContext: options.usageContext,
    quantity: 1,
    metadata: {
      kind: options.kind,
      phase: "apply_candidate",
      ...(options.metadata ?? {}),
    },
  }).catch((error: unknown) => {
    if (error instanceof TenantCreditServiceError) {
      throw new AiCreditGateError(
        error.status,
        "크레딧 사용 가능 여부를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    }

    throw new AiCreditGateError(
      503,
      "크레딧 사용 가능 여부를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  });

  if (consumption.status !== "consumed") {
    throw new AiCreditGateError(
      402,
      consumption.message ?? "크레딧이 부족해 AI 생성을 진행할 수 없습니다.",
      {
        rechargeUrl: consumption.rechargeUrl ?? null,
        requiredCredits: resolveRequiredCredits(featureKey),
        remainingCredits: consumption.remainingCredits ?? null,
      },
    );
  }

  return {
    tenantId: context.tenantId,
    charged: true,
    cost: consumption.cost,
    remainingCredits: consumption.remainingCredits ?? null,
  };
}

export async function executeWithAiCreditGate<T>(options: {
  request: NextRequest;
  kind: "template" | "training-page";
  usageContext: string;
  action: (context: { tenantId: string }) => Promise<T>;
}) {
  const context = await requireReadyTenant(options.request);
  return options.action({ tenantId: context.tenantId });
}
