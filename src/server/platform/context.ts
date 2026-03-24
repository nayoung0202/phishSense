import type { AuthenticatedContext } from "@/server/auth/requireAuth";
import { setAuthSessionTenant } from "@/server/auth/sessionStore";
import type { PlatformEntitlementRow } from "@/server/db/schema";
import { getPlatformEntitlement } from "@/server/dao/platformEntitlementDao";
import { fetchPlatformMe, PlatformApiError } from "./client";
import { getPlatformClientConfig } from "./config";
import {
  PLATFORM_ACTIVE_STATUS,
  PLATFORM_PRODUCT_ID,
  type PlatformContextStatus,
  type PlatformMeProduct,
  type PlatformMeResponse,
  type PlatformMeTenant,
} from "./types";

const CACHE_TTL_MS = 1000 * 15;
const contextCache = new Map<
  string,
  {
    expiresAt: number;
    result: PlatformContextResult;
  }
>();
const tenantCacheIndex = new Map<string, Set<string>>();

export type PlatformContextResult = {
  status: PlatformContextStatus;
  hasAccess: boolean;
  onboardingRequired: boolean;
  tenantId: string | null;
  currentTenantId: string | null;
  tenants: PlatformMeTenant[];
  products: PlatformMeProduct[];
  platformProduct: PlatformMeProduct | null;
  localEntitlement: PlatformEntitlementRow | null;
};

export class PlatformContextSelectionError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const isDevBypassSession = (auth: AuthenticatedContext) =>
  auth.sessionId === "dev-bypass-session";

const toResult = (
  status: PlatformContextStatus,
  input: Partial<Omit<PlatformContextResult, "localEntitlement">> & {
    localEntitlement?: PlatformEntitlementRow | null;
  } = {},
): PlatformContextResult => ({
  status,
  hasAccess: status === "ready" || status === "dev_bypass",
  onboardingRequired: status !== "ready" && status !== "dev_bypass",
  tenantId: input.tenantId ?? input.currentTenantId ?? null,
  currentTenantId: input.currentTenantId ?? null,
  tenants: input.tenants ?? [],
  products: input.products ?? [],
  platformProduct: input.platformProduct ?? null,
  localEntitlement: input.localEntitlement ?? null,
});

const buildCacheKey = (
  auth: AuthenticatedContext,
  preferredTenantId?: string | null,
) => `${auth.sessionId}:${preferredTenantId ?? auth.tenantId ?? "-"}`;

const getCachedPlatformContext = (key: string) => {
  const cached = contextCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    contextCache.delete(key);
    return null;
  }
  return cached.result;
};

const setCachedPlatformContext = (key: string, result: PlatformContextResult) => {
  contextCache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    result,
  });

  if (result.currentTenantId) {
    const existing = tenantCacheIndex.get(result.currentTenantId) ?? new Set<string>();
    existing.add(key);
    tenantCacheIndex.set(result.currentTenantId, existing);
  }
};

export function evictPlatformContextCacheByTenant(tenantId: string) {
  const keys = tenantCacheIndex.get(tenantId);
  if (!keys) return;
  keys.forEach((key) => {
    contextCache.delete(key);
  });
  tenantCacheIndex.delete(tenantId);
}

const getPlatformProduct = (
  response: PlatformMeResponse | null,
  tenantId: string | null,
) => {
  if (!response) return null;
  return (
    response.products.find(
      (product) =>
        product.productId === PLATFORM_PRODUCT_ID &&
        (!tenantId || product.tenantId === tenantId),
    ) ?? null
  );
};

const getConfiguredPlatformAudience = () => {
  try {
    return getPlatformClientConfig();
  } catch {
    return null;
  }
};

const fetchPlatformMeBestEffort = async (options: {
  auth: AuthenticatedContext;
  tenantId?: string | null;
}) => {
  if (!getConfiguredPlatformAudience() || !options.auth.accessToken) {
    return null;
  }

  try {
    return await fetchPlatformMe({
      accessToken: options.auth.accessToken,
      tenantId: options.tenantId,
    });
  } catch {
    return null;
  }
};

const resolveEntitlementShortcutResult = async (options: {
  status: PlatformContextStatus;
  auth: AuthenticatedContext;
  tenantId: string;
  localEntitlement: PlatformEntitlementRow;
}) => {
  const platformResponse = await fetchPlatformMeBestEffort({
    auth: options.auth,
    tenantId: options.tenantId,
  });
  const resolvedTenantId = platformResponse?.currentTenantId ?? options.tenantId;

  return toResult(options.status, {
    tenantId: resolvedTenantId,
    currentTenantId: resolvedTenantId,
    tenants: platformResponse?.tenants,
    products: platformResponse?.products,
    platformProduct: getPlatformProduct(platformResponse, resolvedTenantId),
    localEntitlement: options.localEntitlement,
  });
};

export async function resolvePlatformContext(options: {
  auth: AuthenticatedContext;
  preferredTenantId?: string | null;
  forceRefresh?: boolean;
}): Promise<PlatformContextResult> {
  const cacheKey = buildCacheKey(options.auth, options.preferredTenantId);
  if (!options.forceRefresh) {
    const cached = getCachedPlatformContext(cacheKey);
    if (cached) {
      return cached;
    }
  }

  if (isDevBypassSession(options.auth)) {
    const result = toResult("dev_bypass", {
      tenantId: options.auth.tenantId,
      currentTenantId: options.auth.tenantId,
    });
    setCachedPlatformContext(cacheKey, result);
    return result;
  }

  const preferredTenantId = options.preferredTenantId ?? options.auth.tenantId;
  let localEntitlement =
    preferredTenantId
      ? await getPlatformEntitlement(preferredTenantId, PLATFORM_PRODUCT_ID)
      : null;

  if (
    !options.preferredTenantId &&
    preferredTenantId &&
    localEntitlement?.status === PLATFORM_ACTIVE_STATUS
  ) {
    const result = await resolveEntitlementShortcutResult({
      status: "ready",
      auth: options.auth,
      tenantId: preferredTenantId,
      localEntitlement,
    });
    setCachedPlatformContext(cacheKey, result);
    return result;
  }

  if (
    !options.preferredTenantId &&
    preferredTenantId &&
    localEntitlement &&
    localEntitlement.status !== PLATFORM_ACTIVE_STATUS
  ) {
    const result = await resolveEntitlementShortcutResult({
      status: "entitlement_inactive",
      auth: options.auth,
      tenantId: preferredTenantId,
      localEntitlement,
    });
    setCachedPlatformContext(cacheKey, result);
    return result;
  }

  const platformConfig = getConfiguredPlatformAudience();
  if (!platformConfig) {
    const result = toResult("platform_not_configured", {
      tenantId: preferredTenantId,
      currentTenantId: preferredTenantId,
      localEntitlement,
    });
    setCachedPlatformContext(cacheKey, result);
    return result;
  }

  if (!options.auth.accessToken) {
    const result = toResult("platform_token_missing", {
      tenantId: preferredTenantId,
      currentTenantId: preferredTenantId,
      localEntitlement,
    });
    setCachedPlatformContext(cacheKey, result);
    return result;
  }

  let platformResponse: PlatformMeResponse;
  try {
    platformResponse = await fetchPlatformMe({
      accessToken: options.auth.accessToken,
      tenantId: preferredTenantId,
    });
  } catch (error) {
    if (error instanceof PlatformApiError && error.status === 401) {
      const result = toResult("platform_unauthorized", {
        tenantId: preferredTenantId,
        currentTenantId: preferredTenantId,
        localEntitlement,
      });
      setCachedPlatformContext(cacheKey, result);
      return result;
    }

    if (error instanceof PlatformApiError && error.status === 403) {
      const result = toResult("tenant_selection_required", {
        tenants: [],
        products: [],
        tenantId: null,
        currentTenantId: null,
        localEntitlement: null,
      });
      setCachedPlatformContext(cacheKey, result);
      return result;
    }

    const result = toResult("platform_unavailable", {
      tenantId: preferredTenantId,
      currentTenantId: preferredTenantId,
      localEntitlement,
    });
    setCachedPlatformContext(cacheKey, result);
    return result;
  }

  const currentTenantId = platformResponse.currentTenantId ?? null;
  if (
    currentTenantId &&
    currentTenantId !== options.auth.tenantId &&
    !isDevBypassSession(options.auth)
  ) {
    await setAuthSessionTenant(options.auth.sessionId, currentTenantId);
  }

  if (!platformResponse.hasTenant || platformResponse.tenants.length === 0) {
    const result = toResult("tenant_missing", {
      tenants: platformResponse.tenants,
      products: platformResponse.products,
      currentTenantId,
      tenantId: null,
      localEntitlement: null,
    });
    setCachedPlatformContext(cacheKey, result);
    return result;
  }

  if (!currentTenantId) {
    const result = toResult("tenant_selection_required", {
      tenants: platformResponse.tenants,
      products: platformResponse.products,
      currentTenantId: null,
      tenantId: null,
      localEntitlement: null,
    });
    setCachedPlatformContext(cacheKey, result);
    return result;
  }

  localEntitlement = await getPlatformEntitlement(currentTenantId, PLATFORM_PRODUCT_ID);
  const platformProduct = getPlatformProduct(platformResponse, currentTenantId);

  const result =
    localEntitlement?.status === PLATFORM_ACTIVE_STATUS
      ? toResult("ready", {
          tenantId: currentTenantId,
          currentTenantId,
          tenants: platformResponse.tenants,
          products: platformResponse.products,
          platformProduct,
          localEntitlement,
        })
      : localEntitlement
        ? toResult("entitlement_inactive", {
            tenantId: currentTenantId,
            currentTenantId,
            tenants: platformResponse.tenants,
            products: platformResponse.products,
            platformProduct,
            localEntitlement,
          })
        : platformProduct?.status === PLATFORM_ACTIVE_STATUS
          ? toResult("entitlement_pending", {
              tenantId: currentTenantId,
              currentTenantId,
              tenants: platformResponse.tenants,
              products: platformResponse.products,
              platformProduct,
              localEntitlement,
            })
          : toResult("entitlement_inactive", {
              tenantId: currentTenantId,
              currentTenantId,
              tenants: platformResponse.tenants,
              products: platformResponse.products,
              platformProduct,
              localEntitlement,
            });

  setCachedPlatformContext(cacheKey, result);
  return result;
}

export async function selectPlatformTenant(options: {
  auth: AuthenticatedContext;
  tenantId: string;
}) {
  if (isDevBypassSession(options.auth)) {
    return resolvePlatformContext({
      auth: {
        ...options.auth,
        tenantId: options.tenantId,
      },
      preferredTenantId: options.tenantId,
      forceRefresh: true,
    });
  }

  if (!options.auth.accessToken) {
    throw new PlatformContextSelectionError(
      400,
      "Platform access token 이 없어 tenant를 선택할 수 없습니다.",
    );
  }

  const response = await fetchPlatformMe({
    accessToken: options.auth.accessToken,
    tenantId: options.tenantId,
  });

  if (response.currentTenantId !== options.tenantId) {
    throw new PlatformContextSelectionError(
      403,
      "선택한 tenant 컨텍스트를 사용할 수 없습니다.",
    );
  }

  await setAuthSessionTenant(options.auth.sessionId, options.tenantId);
  return resolvePlatformContext({
    auth: {
      ...options.auth,
      tenantId: options.tenantId,
    },
    preferredTenantId: options.tenantId,
    forceRefresh: true,
  });
}
