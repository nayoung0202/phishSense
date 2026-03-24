"use client";

import { useMemo } from "react";
import { usePlatformContext } from "@/hooks/usePlatformContext";

export function useSettingsTenant() {
  const contextQuery = usePlatformContext();

  const state = useMemo(() => {
    const context = contextQuery.data;
    const tenantId =
      context?.currentTenantId ??
      context?.tenantId ??
      null;
    const membership =
      context && tenantId
        ? context.tenants.find((tenant) => tenant.tenantId === tenantId) ?? null
        : null;

    return {
      context,
      tenantId,
      membership,
    };
  }, [contextQuery.data]);

  return {
    ...state,
    ...contextQuery,
  };
}
