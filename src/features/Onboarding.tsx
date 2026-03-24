"use client";

import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/I18nProvider";
import type { TranslationKey, TranslationValue } from "@/lib/i18n";

const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;
const ENCODED_SLASH_PATTERN = /%2f/i;
const ENCODED_BACKSLASH_PATTERN = /%5c/i;
const PROVISIONING_POLL_INTERVAL_MS = 2000;
const PROVISIONING_POLL_TIMEOUT_MS = 1000 * 30;
const PLATFORM_CONTEXT_QUERY_KEY = ["auth-platform-context"] as const;

type PlatformContextResponse = {
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
};

type PlatformTenantMutationResponse = PlatformContextResponse & {
  createdTenant?: {
    tenantId: string;
    name: string;
    role: string;
  };
};

const roleLabelMap: Record<string, TranslationKey> = {
  OWNER: "onboarding.role.owner",
  ADMIN: "onboarding.role.admin",
  MEMBER: "onboarding.role.member",
  USER: "onboarding.role.user",
};

const entitlementStatusLabelMap: Record<string, TranslationKey> = {
  ACTIVE: "onboarding.entitlementStatus.active",
  SUSPENDED: "onboarding.entitlementStatus.suspended",
  EXPIRED: "onboarding.entitlementStatus.expired",
  PENDING: "onboarding.entitlementStatus.pending",
};

const fetchPlatformContext = async (
  fallbackError: string,
): Promise<PlatformContextResponse> => {
  const response = await fetch("/api/auth/platform-context", {
    credentials: "include",
    cache: "no-store",
  });

  const body = (await response.json()) as PlatformContextResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error || fallbackError);
  }

  return body;
};

const updateTenantContext = async (
  tenantId: string,
  fallbackError: string,
): Promise<PlatformContextResponse> => {
  const response = await fetch("/api/auth/session/tenant", {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tenantId }),
  });

  const body = (await response.json()) as PlatformContextResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error || fallbackError);
  }

  return body;
};

const createTenantContext = async (
  name: string,
  fallbackError: string,
): Promise<PlatformTenantMutationResponse> => {
  const response = await fetch("/api/platform/tenants", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });

  const body = (await response.json()) as PlatformTenantMutationResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error || fallbackError);
  }

  return body;
};

const statusMessageMap: Record<PlatformContextResponse["status"], TranslationKey> = {
  ready: "onboarding.message.ready",
  dev_bypass: "onboarding.message.devBypass",
  tenant_missing: "onboarding.message.tenantMissing",
  tenant_selection_required: "onboarding.message.tenantSelectionRequired",
  entitlement_pending: "onboarding.message.entitlementPending",
  entitlement_inactive: "onboarding.message.entitlementInactive",
  platform_token_missing: "onboarding.message.platformTokenMissing",
  platform_not_configured: "onboarding.message.platformNotConfigured",
  platform_unauthorized: "onboarding.message.platformUnauthorized",
  platform_unavailable: "onboarding.message.platformUnavailable",
};

const getStatusMessage = (
  t: (key: TranslationKey, values?: Record<string, TranslationValue>) => string,
  status: PlatformContextResponse["status"],
) => t(statusMessageMap[status] || "onboarding.message.fallback");

const formatRoleLabel = (
  t: (key: TranslationKey, values?: Record<string, TranslationValue>) => string,
  role: string,
) => {
  const key = roleLabelMap[role];
  return key ? t(key) : role;
};

const formatEntitlementStatus = (
  t: (key: TranslationKey, values?: Record<string, TranslationValue>) => string,
  status: string,
) => {
  const key = entitlementStatusLabelMap[status];
  return key ? t(key) : status;
};

const isProvisioningStatus = (status: PlatformContextResponse["status"]) =>
  status === "entitlement_pending";

export const shouldContinueProvisioningPolling = (
  startedAt: number | null,
  now = Date.now(),
) => {
  if (startedAt === null) return false;
  return now - startedAt < PROVISIONING_POLL_TIMEOUT_MS;
};

export const normalizeReturnTo = (candidate: string | null) => {
  if (!candidate) return "/";
  if (CONTROL_CHAR_PATTERN.test(candidate)) return "/";
  if (ENCODED_SLASH_PATTERN.test(candidate) || ENCODED_BACKSLASH_PATTERN.test(candidate)) {
    return "/";
  }
  if (!candidate.startsWith("/")) return "/";
  if (candidate.startsWith("//")) return "/";
  if (candidate.includes("\\")) return "/";
  if (candidate.startsWith("/api/auth")) return "/";
  return candidate;
};

export default function Onboarding() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const returnTo = normalizeReturnTo(searchParams.get("returnTo"));
  const [tenantName, setTenantName] = useState("");
  const [provisioningStartedAt, setProvisioningStartedAt] = useState<number | null>(
    null,
  );

  const moveToReturnTo = () => {
    window.location.assign(returnTo);
  };

  const isProvisioning = shouldContinueProvisioningPolling(provisioningStartedAt);
  const provisioningTimedOut =
    provisioningStartedAt !== null && !shouldContinueProvisioningPolling(provisioningStartedAt);

  const contextQuery = useQuery({
    queryKey: PLATFORM_CONTEXT_QUERY_KEY,
    queryFn: () => fetchPlatformContext(t("onboarding.fetchFailed")),
    retry: false,
    refetchInterval: isProvisioning ? PROVISIONING_POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: true,
  });

  const handleContextUpdate = (data: PlatformContextResponse) => {
    queryClient.setQueryData(PLATFORM_CONTEXT_QUERY_KEY, data);

    if (data.hasAccess && !data.onboardingRequired) {
      setProvisioningStartedAt(null);
      moveToReturnTo();
      return;
    }

    setProvisioningStartedAt(isProvisioningStatus(data.status) ? Date.now() : null);
  };

  const selectTenantMutation = useMutation({
    mutationFn: (tenantId: string) =>
      updateTenantContext(tenantId, t("onboarding.selectTenantError")),
    onSuccess: (data) => {
      handleContextUpdate(data);
    },
  });

  const createTenantMutation = useMutation({
    mutationFn: (name: string) =>
      createTenantContext(name, t("onboarding.createTenantFailed")),
    onSuccess: (data) => {
      setTenantName("");
      handleContextUpdate(data);
    },
  });

  const isSubmitting =
    selectTenantMutation.isPending || createTenantMutation.isPending || isProvisioning;

  useEffect(() => {
    if (contextQuery.data?.hasAccess && !contextQuery.data.onboardingRequired) {
      setProvisioningStartedAt(null);
      moveToReturnTo();
    }
  }, [contextQuery.data, returnTo]);

  useEffect(() => {
    if (!contextQuery.data) return;

    if (isProvisioningStatus(contextQuery.data.status) && provisioningStartedAt === null) {
      setProvisioningStartedAt(Date.now());
      return;
    }

    if (provisioningStartedAt !== null && !isProvisioningStatus(contextQuery.data.status)) {
      setProvisioningStartedAt(null);
    }
  }, [contextQuery.data?.status, provisioningStartedAt]);

  if (contextQuery.isLoading) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
        {t("onboarding.loading")}
      </div>
    );
  }

  if (contextQuery.isError || !contextQuery.data) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          {t("onboarding.reloadError")}
        </div>
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void contextQuery.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      </div>
    );
  }

  const data = contextQuery.data;
  const tenantOptions = data.tenants ?? [];
  const message = getStatusMessage(t, data.status);
  const trimmedTenantName = tenantName.trim();
  const isMutating = createTenantMutation.isPending || selectTenantMutation.isPending;
  const showProvisioningPanel =
    isMutating || isProvisioning || provisioningTimedOut || isProvisioningStatus(data.status);
  const showManualRefreshButton =
    provisioningTimedOut || data.status === "platform_unavailable";
  const provisioningTitle = createTenantMutation.isPending
    ? t("onboarding.provisioning.createTenant")
    : selectTenantMutation.isPending
      ? t("onboarding.provisioning.connectTenant")
      : t("onboarding.provisioning.connectEntitlement");
  const provisioningDescription = provisioningTimedOut
    ? t("onboarding.provisioning.delayed")
    : t("onboarding.provisioning.redirect");

  return (
    <div className="space-y-6">
      {showProvisioningPanel ? (
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-base font-medium text-foreground">{provisioningTitle}</p>
          <p className="mt-2 text-sm text-muted-foreground">{provisioningDescription}</p>
          <p className="mt-3 text-xs text-muted-foreground">{message}</p>
          {showManualRefreshButton ? (
            <div className="mt-5 flex justify-center">
              <Button variant="outline" onClick={() => void contextQuery.refetch()}>
                {t("onboarding.checkStatus")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{t("onboarding.currentStatus")}</p>
            <p className="mt-2">{message}</p>
          </div>

          {data.platformProduct ? (
            <div className="rounded-lg border border-border bg-card p-5 text-sm">
              <p className="font-medium text-foreground">{t("onboarding.subscriptionInfo")}</p>
              <div className="mt-3 space-y-1 text-muted-foreground">
                <p>{t("common.status")}: {formatEntitlementStatus(t, data.platformProduct.status)}</p>
                <p>{t("onboarding.plan")}: {data.platformProduct.plan || "-"}</p>
                <p>{t("onboarding.seatLimit")}: {data.platformProduct.seatLimit ?? "-"}</p>
                <p>{t("onboarding.expiresAt")}: {data.platformProduct.expiresAt || "-"}</p>
              </div>
            </div>
          ) : null}

          {data.localEntitlement ? (
            <div className="rounded-lg border border-border bg-card p-5 text-sm">
              <p className="font-medium text-foreground">{t("onboarding.entitlementInfo")}</p>
              <div className="mt-3 space-y-1 text-muted-foreground">
                <p>{t("common.status")}: {formatEntitlementStatus(t, data.localEntitlement.status)}</p>
                <p>{t("onboarding.plan")}: {data.localEntitlement.planCode || "-"}</p>
                <p>{t("onboarding.seatLimit")}: {data.localEntitlement.seatLimit ?? "-"}</p>
                <p>{t("onboarding.expiresAt")}: {data.localEntitlement.expiresAt || "-"}</p>
              </div>
            </div>
          ) : null}

          {data.status === "tenant_missing" ? (
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="font-medium text-foreground">{t("onboarding.createTenantTitle")}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("onboarding.createTenantDescription")}
              </p>
              <form
                className="mt-4 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!trimmedTenantName || createTenantMutation.isPending) {
                    return;
                  }
                  createTenantMutation.mutate(trimmedTenantName);
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="tenant-name">{t("onboarding.tenantName")}</Label>
                  <Input
                    id="tenant-name"
                    name="tenantName"
                    value={tenantName}
                    onChange={(event) => setTenantName(event.target.value)}
                    placeholder={t("onboarding.tenantNamePlaceholder")}
                    autoComplete="organization"
                    disabled={isSubmitting}
                  />
                </div>

                {createTenantMutation.isError ? (
                  <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {createTenantMutation.error.message}
                  </div>
                ) : null}

                <div className="flex justify-end">
                  <Button type="submit" disabled={!trimmedTenantName || isSubmitting}>
                    {createTenantMutation.isPending
                      ? t("onboarding.createTenantProgress")
                      : t("onboarding.createTenantAction")}
                  </Button>
                </div>
              </form>
            </div>
          ) : null}

          {data.status === "tenant_selection_required" ? (
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="font-medium text-foreground">{t("onboarding.selectTenantTitle")}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("onboarding.selectTenantDescription")}
              </p>
              <div className="mt-4 space-y-3">
                {tenantOptions.map((tenant) => (
                  <button
                    key={tenant.tenantId}
                    type="button"
                    onClick={() => selectTenantMutation.mutate(tenant.tenantId)}
                    className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-4 py-3 text-left transition-colors hover:bg-muted"
                    disabled={isSubmitting}
                  >
                    <span>
                      <span className="block font-medium text-foreground">{tenant.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatRoleLabel(t, tenant.role)}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">{t("onboarding.selectAction")}</span>
                  </button>
                ))}
              </div>
              {selectTenantMutation.isError ? (
                <p className="mt-3 text-sm text-red-300">
                  {t("onboarding.selectTenantError")}
                </p>
              ) : null}
            </div>
          ) : null}

          {showManualRefreshButton ? (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => void contextQuery.refetch()}>
                {t("onboarding.checkStatus")}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
