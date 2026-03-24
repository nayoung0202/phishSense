"use client";

import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/I18nProvider";

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

const roleLabelMap: Record<string, string> = {
  OWNER: "소유자",
  ADMIN: "관리자",
  MEMBER: "구성원",
  USER: "사용자",
};

const entitlementStatusLabelMap: Record<string, string> = {
  ACTIVE: "이용 가능",
  SUSPENDED: "이용 일시 중지",
  EXPIRED: "이용 기간 만료",
  PENDING: "확인 중",
};

const fetchPlatformContext = async (): Promise<PlatformContextResponse> => {
  const response = await fetch("/api/auth/platform-context", {
    credentials: "include",
    cache: "no-store",
  });

  const body = (await response.json()) as PlatformContextResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error || "이용 상태를 확인하지 못했습니다.");
  }

  return body;
};

const updateTenantContext = async (tenantId: string): Promise<PlatformContextResponse> => {
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
    throw new Error(body.error || "회사 또는 조직을 선택하지 못했습니다.");
  }

  return body;
};

const createTenantContext = async (
  name: string,
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
    throw new Error(body.error || "회사 또는 조직을 생성하지 못했습니다.");
  }

  return body;
};

const statusMessageMap: Record<PlatformContextResponse["status"], string> = {
  ready: "이용 준비가 완료되었습니다.",
  dev_bypass: "개발 환경에서 바로 이용할 수 있습니다.",
  tenant_missing: "아직 소속된 회사 또는 조직이 없습니다. 먼저 회사 또는 조직을 만들어 주세요.",
  tenant_selection_required: "이용할 회사 또는 조직을 선택해 주세요.",
  entitlement_pending: "이용 권한 정보를 확인하는 중입니다. 잠시 후 다시 시도해 주세요.",
  entitlement_inactive:
    "현재 소속된 회사 또는 조직에서는 PhishSense를 이용할 수 없습니다.",
  platform_token_missing: "로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.",
  platform_not_configured:
    "서비스 설정이 아직 완료되지 않았습니다. 관리자에게 문의해 주세요.",
  platform_unauthorized: "로그인 정보 확인에 실패했습니다. 다시 로그인해 주세요.",
  platform_unavailable: "서비스 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
};

const getStatusMessage = (
  t: (key: string) => string,
  status: PlatformContextResponse["status"],
) => t(statusMessageMap[status] || "이용 상태를 확인해 주세요.");

const formatRoleLabel = (t: (key: string) => string, role: string) =>
  t(roleLabelMap[role] ?? role);

const formatEntitlementStatus = (t: (key: string) => string, status: string) =>
  t(entitlementStatusLabelMap[status] ?? status);

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
    queryFn: fetchPlatformContext,
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
    mutationFn: updateTenantContext,
    onSuccess: (data) => {
      handleContextUpdate(data);
    },
  });

  const createTenantMutation = useMutation({
    mutationFn: createTenantContext,
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
        {t("이용 상태를 확인하고 있습니다.")}
      </div>
    );
  }

  if (contextQuery.isError || !contextQuery.data) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          {t("이용 상태를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.")}
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
    ? t("회사 또는 조직을 만드는 중입니다.")
    : selectTenantMutation.isPending
      ? t("회사 또는 조직을 연결하는 중입니다.")
      : t("이용 권한을 연결하는 중입니다.");
  const provisioningDescription = provisioningTimedOut
    ? t("연결이 지연되고 있습니다. 잠시 후 상태를 다시 확인해 주세요.")
    : t("이용 권한이 연결되면 자동으로 다음 화면으로 이동합니다.");

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
                {t("상태 다시 확인")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{t("현재 상태")}</p>
            <p className="mt-2">{message}</p>
          </div>

          {data.platformProduct ? (
            <div className="rounded-lg border border-border bg-card p-5 text-sm">
              <p className="font-medium text-foreground">{t("구독 정보")}</p>
              <div className="mt-3 space-y-1 text-muted-foreground">
                <p>{t("상태")}: {formatEntitlementStatus(t, data.platformProduct.status)}</p>
                <p>{t("플랜")}: {data.platformProduct.plan || "-"}</p>
                <p>{t("좌석 수")}: {data.platformProduct.seatLimit ?? "-"}</p>
                <p>{t("만료일")}: {data.platformProduct.expiresAt || "-"}</p>
              </div>
            </div>
          ) : null}

          {data.localEntitlement ? (
            <div className="rounded-lg border border-border bg-card p-5 text-sm">
              <p className="font-medium text-foreground">{t("이용 권한 정보")}</p>
              <div className="mt-3 space-y-1 text-muted-foreground">
                <p>{t("상태")}: {formatEntitlementStatus(t, data.localEntitlement.status)}</p>
                <p>{t("플랜")}: {data.localEntitlement.planCode || "-"}</p>
                <p>{t("좌석 수")}: {data.localEntitlement.seatLimit ?? "-"}</p>
                <p>{t("만료일")}: {data.localEntitlement.expiresAt || "-"}</p>
              </div>
            </div>
          ) : null}

          {data.status === "tenant_missing" ? (
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="font-medium text-foreground">{t("회사 또는 조직 만들기")}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("사용할 회사 또는 조직 이름을 입력해 주세요. 생성 후 이용 권한을 다시 확인합니다.")}
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
                  <Label htmlFor="tenant-name">{t("회사 또는 조직 이름")}</Label>
                  <Input
                    id="tenant-name"
                    name="tenantName"
                    value={tenantName}
                    onChange={(event) => setTenantName(event.target.value)}
                    placeholder={t("예: EVRIZ")}
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
                      ? t("회사 또는 조직을 만드는 중...")
                      : t("회사 또는 조직 만들기")}
                  </Button>
                </div>
              </form>
            </div>
          ) : null}

          {data.status === "tenant_selection_required" ? (
            <div className="rounded-lg border border-border bg-card p-5">
              <p className="font-medium text-foreground">{t("회사 또는 조직 선택")}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("계속하려면 이용할 회사 또는 조직을 선택해 주세요.")}
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
                    <span className="text-xs text-muted-foreground">{t("선택")}</span>
                  </button>
                ))}
              </div>
              {selectTenantMutation.isError ? (
                <p className="mt-3 text-sm text-red-300">
                  {t("회사 또는 조직을 선택하지 못했습니다. 잠시 후 다시 시도해 주세요.")}
                </p>
              ) : null}
            </div>
          ) : null}

          {showManualRefreshButton ? (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => void contextQuery.refetch()}>
                {t("상태 다시 확인")}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
