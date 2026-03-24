"use client";

import { useQuery } from "@tanstack/react-query";

export type PlatformContextResponse = {
  authenticated: boolean;
  status:
    | "ready"
    | "dev_bypass"
    | "tenant_missing"
    | "tenant_selection_required"
    | "entitlement_pending"
    | "entitlement_inactive"
    | "platform_token_missing"
    | "platform_not_configured"
    | "platform_unauthorized"
    | "platform_unavailable";
  hasAccess: boolean;
  onboardingRequired: boolean;
  tenantId: string | null;
  currentTenantId: string | null;
  tenants: Array<{
    tenantId: string;
    name: string;
    role: string;
  }>;
  products: Array<{
    tenantId: string;
    productId: string;
    status: string;
    plan?: string | null;
    seatLimit?: number | null;
    expiresAt?: string | null;
  }>;
  platformProduct?: {
    tenantId: string;
    productId: string;
    status: string;
    plan?: string | null;
    seatLimit?: number | null;
    expiresAt?: string | null;
  } | null;
  localEntitlement?: {
    status: string;
    planCode?: string | null;
    seatLimit?: number | null;
    expiresAt?: string | null;
  } | null;
  error?: string;
};

export const PLATFORM_CONTEXT_QUERY_KEY = ["/api/auth/platform-context"] as const;

export function usePlatformContext() {
  return useQuery<PlatformContextResponse>({
    queryKey: PLATFORM_CONTEXT_QUERY_KEY,
    retry: false,
  });
}
