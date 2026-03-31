import type { QueryClient } from "@tanstack/react-query";
import { PLATFORM_CONTEXT_QUERY_KEY, type PlatformContextResponse } from "@/hooks/usePlatformContext";
import type { TenantCreditsSummary } from "@/lib/platformApi";

export const TENANT_CREDITS_ALWAYS_FRESH_QUERY_OPTIONS = {
  staleTime: 0,
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: "always" as const,
};

export const buildTenantCreditsQueryKey = (tenantId: string) =>
  [`/api/platform/tenants/${tenantId}/credits`] as const;

type TenantCreditsChargeResult = {
  tenantId?: string | null;
  charged: boolean;
  remainingCredits?: number | null;
};

const isTenantCreditsQueryKey = (queryKey: readonly unknown[]) => {
  const first = queryKey[0];
  return typeof first === "string" && /^\/api\/platform\/tenants\/[^/]+\/credits$/.test(first);
};

const readStoredTenantId = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem("currentTenantId");
  const trimmed = stored?.trim();
  return trimmed ? trimmed : null;
};

const resolveTenantId = (queryClient: QueryClient, tenantId?: string | null) => {
  const trimmedTenantId = tenantId?.trim();
  if (trimmedTenantId) {
    return trimmedTenantId;
  }

  const platformContext =
    queryClient.getQueryData<PlatformContextResponse>(PLATFORM_CONTEXT_QUERY_KEY);

  return platformContext?.currentTenantId ?? platformContext?.tenantId ?? readStoredTenantId();
};

export async function invalidateTenantCreditsQueries(
  queryClient: QueryClient,
  tenantId?: string | null,
) {
  const resolvedTenantId = resolveTenantId(queryClient, tenantId);

  if (resolvedTenantId) {
    await queryClient.invalidateQueries({
      queryKey: buildTenantCreditsQueryKey(resolvedTenantId),
    });
    return;
  }

  await queryClient.invalidateQueries({
    predicate: (query) => isTenantCreditsQueryKey(query.queryKey),
  });
}

export async function syncTenantCreditsAfterCharge(
  queryClient: QueryClient,
  chargeResult: TenantCreditsChargeResult,
) {
  const resolvedTenantId = resolveTenantId(queryClient, chargeResult.tenantId);

  if (resolvedTenantId && chargeResult.charged && chargeResult.remainingCredits != null) {
    queryClient.setQueryData<TenantCreditsSummary | undefined>(
      buildTenantCreditsQueryKey(resolvedTenantId),
      (current) =>
        current
          ? {
              ...current,
              balance: chargeResult.remainingCredits,
            }
          : current,
    );
  }

  await invalidateTenantCreditsQueries(queryClient, resolvedTenantId);
}
