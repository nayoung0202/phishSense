import type { NextRequest } from "next/server";
import {
  PlatformApiError,
  authorizePlatformCredits,
  releasePlatformCreditAuthorization,
  settlePlatformCreditAuthorization,
} from "@/server/platform/client";
import { getFeatureFlags } from "@/server/featureFlags";
import { hasActiveTenantAiKeyForScope } from "@/server/services/tenantAiKeys";
import { requireReadyTenant } from "@/server/tenant/currentTenant";

export class AiCreditGateError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const resolveFeatureKey = (kind: "template" | "training-page", usageContext: string) => {
  if (kind === "template" && usageContext === "experience") {
    return "template_ai_experience";
  }

  if (kind === "template") {
    return "template_ai_standard";
  }

  return "training_page_ai_standard";
};

export async function executeWithAiCreditGate<T>(options: {
  request: NextRequest;
  kind: "template" | "training-page";
  usageContext: string;
  action: (context: { tenantId: string }) => Promise<T>;
}) {
  const featureFlags = getFeatureFlags();
  const localScope = options.kind === "template" ? "template-ai" : "training-page-ai";

  const context = await requireReadyTenant(options.request);
  const hasLocalByok = await hasActiveTenantAiKeyForScope(context.tenantId, localScope);

  if (hasLocalByok) {
    return options.action({ tenantId: context.tenantId });
  }

  if (!featureFlags.creditsEnforcementEnabled) {
    return options.action({ tenantId: context.tenantId });
  }

  if (!context.auth.accessToken) {
    throw new AiCreditGateError(400, "플랫폼 access token을 확인하지 못했습니다.");
  }

  const authorization = await authorizePlatformCredits({
    accessToken: context.auth.accessToken,
    tenantId: context.tenantId,
    input: {
      featureKey: resolveFeatureKey(options.kind, options.usageContext),
      usageContext: options.usageContext,
      quantity: 1,
      metadata: {
        kind: options.kind,
      },
    },
  }).catch((error: unknown) => {
    if (error instanceof PlatformApiError) {
      throw new AiCreditGateError(
        error.status,
        "크래딧 사용 가능 여부를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    }

    throw new AiCreditGateError(
      503,
      "크래딧 사용 가능 여부를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  });

  if (authorization.status !== "approved") {
    throw new AiCreditGateError(
      402,
      authorization.message ?? "크래딧이 부족하고 활성 BYOK가 없어 AI 생성을 진행할 수 없습니다.",
    );
  }

  try {
    const result = await options.action({ tenantId: context.tenantId });
    await settlePlatformCreditAuthorization({
      accessToken: context.auth.accessToken,
      tenantId: context.tenantId,
      authorizationId: authorization.authorizationId,
      input: {
        metadata: {
          kind: options.kind,
          usageContext: options.usageContext,
        },
      },
    }).catch((error) => {
      console.error("[ai-credit-gate] settle failed", error);
    });
    return result;
  } catch (error) {
    await releasePlatformCreditAuthorization({
      accessToken: context.auth.accessToken,
      tenantId: context.tenantId,
      authorizationId: authorization.authorizationId,
      input: {
        metadata: {
          kind: options.kind,
          usageContext: options.usageContext,
        },
      },
    }).catch(() => {
      // best-effort release
    });
    throw error;
  }
}
