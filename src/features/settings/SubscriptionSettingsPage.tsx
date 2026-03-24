"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, Check, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/I18nProvider";
import { useFeatureFlags } from "@/components/FeatureFlagProvider";
import { useToast } from "@/hooks/use-toast";
import type { PlatformContextResponse } from "@/hooks/usePlatformContext";
import { getIntlLocale } from "@/lib/i18n";
import {
  buildTenantBillingSubscriptionApiPath,
  PLATFORM_BILLING_PLAN_CODE,
  PLATFORM_BILLING_PRODUCT_ID,
  PLATFORM_BILLING_RETURN_PARAM,
  PLATFORM_BILLING_RETURN_VALUES,
  type PlatformBillingPortalFlowType,
  type PlatformBillingReturnState,
} from "@/lib/platformBilling";
import {
  createCheckoutSession,
  createPortalSession,
  fetchBillingCatalog,
  fetchBillingSubscription,
} from "@/lib/platformApi";
import { useSettingsTenant } from "@/features/settings/useSettingsTenant";

const BILLING_SYNC_POLL_INTERVAL_MS = 2_000;
const BILLING_SYNC_TIMEOUT_MS = 30_000;
const BILLING_IDEMPOTENCY_TTL_MS = 15 * 60 * 1000;
const BILLING_IDEMPOTENCY_STORAGE_PREFIX = "phishsense-billing-idempotency";
const BILLING_LAST_ACTION_STORAGE_PREFIX = "phishsense-billing-last-action";

type BillingSubscription = Awaited<ReturnType<typeof fetchBillingSubscription>>;
type BillingSyncPhase = "idle" | "syncing" | "waiting" | "confirmed" | "timed_out";
type BillingActionKey =
  | `checkout:${number}`
  | `portal:${PlatformBillingPortalFlowType}`;

const billingReturnStateSet = new Set<PlatformBillingReturnState>(
  Object.values(PLATFORM_BILLING_RETURN_VALUES),
);

const formatWon = (value: number | null | undefined) =>
  typeof value === "number" ? `₩${value.toLocaleString("ko-KR")}` : "-";

const formatDateTime = (
  value: string | null | undefined,
  locale: ReturnType<typeof getIntlLocale>,
) => {
  if (!value) return "-";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
};

const normalizeBillingReturnState = (
  value: string | null,
): PlatformBillingReturnState | null => {
  if (!value || !billingReturnStateSet.has(value as PlatformBillingReturnState)) {
    return null;
  }

  return value as PlatformBillingReturnState;
};

const buildCheckoutActionKey = (seatCount: number) =>
  `checkout:${seatCount}` as const;

const buildPortalActionKey = (flowType: PlatformBillingPortalFlowType) =>
  `portal:${flowType}` as const;

const getBillingIdempotencyStorageKey = (
  tenantId: string,
  actionKey: BillingActionKey,
) => `${BILLING_IDEMPOTENCY_STORAGE_PREFIX}:${tenantId}:${actionKey}`;

const getBillingLastActionStorageKey = (tenantId: string) =>
  `${BILLING_LAST_ACTION_STORAGE_PREFIX}:${tenantId}`;

const getOrCreateBillingIdempotencyKey = (
  tenantId: string,
  actionKey: BillingActionKey,
) => {
  const fallbackKey = crypto.randomUUID();
  if (typeof window === "undefined") {
    return fallbackKey;
  }

  const storageKey = getBillingIdempotencyStorageKey(tenantId, actionKey);

  try {
    const stored = window.sessionStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored) as {
        key?: string;
        createdAt?: number;
      };

      if (
        typeof parsed.key === "string" &&
        parsed.key.trim() &&
        typeof parsed.createdAt === "number" &&
        Date.now() - parsed.createdAt < BILLING_IDEMPOTENCY_TTL_MS
      ) {
        return parsed.key;
      }
    }
  } catch {
    // ignore invalid session storage payloads
  }

  const nextKey = crypto.randomUUID();
  window.sessionStorage.setItem(
    storageKey,
    JSON.stringify({ key: nextKey, createdAt: Date.now() }),
  );
  return nextKey;
};

const clearStoredBillingIdempotencyKeys = (tenantId: string) => {
  if (typeof window === "undefined") {
    return;
  }

  const prefix = `${BILLING_IDEMPOTENCY_STORAGE_PREFIX}:${tenantId}:`;

  for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = window.sessionStorage.key(index);
    if (key?.startsWith(prefix)) {
      window.sessionStorage.removeItem(key);
    }
  }
};

const setLastBillingAction = (tenantId: string, actionKey: BillingActionKey) => {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    getBillingLastActionStorageKey(tenantId),
    actionKey,
  );
};

const popLastBillingAction = (tenantId: string) => {
  if (typeof window === "undefined") {
    return null;
  }

  const storageKey = getBillingLastActionStorageKey(tenantId);
  const stored = window.sessionStorage.getItem(storageKey);
  window.sessionStorage.removeItem(storageKey);

  if (!stored) {
    return null;
  }

  if (
    stored.startsWith("checkout:") ||
    stored === "portal:payment_method_update" ||
    stored === "portal:subscription_cancel"
  ) {
    return stored as BillingActionKey;
  }

  return null;
};

const hasBusinessAccess = (context: PlatformContextResponse | null | undefined) =>
  Boolean(
    context?.platformProduct?.productId === PLATFORM_BILLING_PRODUCT_ID &&
      context.platformProduct?.status === "ACTIVE" &&
      context.platformProduct?.plan === PLATFORM_BILLING_PLAN_CODE,
  ) ||
  Boolean(
    context?.localEntitlement?.status === "ACTIVE" &&
      context.localEntitlement?.planCode === PLATFORM_BILLING_PLAN_CODE,
  );

const hasCancellationScheduled = (subscription: BillingSubscription) =>
  Boolean(subscription?.cancelAtPeriodEnd);

export default function SubscriptionSettingsPage() {
  const { t, locale } = useI18n();
  const intlLocale = getIntlLocale(locale);
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { billingUiEnabled } = useFeatureFlags();
  const {
    context,
    tenantId,
    membership,
    isLoading: isTenantLoading,
    refetch: refetchPlatformContext,
  } = useSettingsTenant();
  const [seatCount, setSeatCount] = useState("6");
  const [billingSyncPhase, setBillingSyncPhase] =
    useState<BillingSyncPhase>("idle");
  const [billingReturnAction, setBillingReturnAction] =
    useState<BillingActionKey | null>(null);
  const handledReturnKeyRef = useRef<string | null>(null);
  const canManageBilling = membership?.role === "OWNER";
  const normalizedSeatCount = Math.max(6, Number(seatCount) || 6);
  const billingReturnState = normalizeBillingReturnState(
    searchParams.get(PLATFORM_BILLING_RETURN_PARAM),
  );
  const accessPlanCode =
    context?.platformProduct?.plan ??
    context?.localEntitlement?.planCode ??
    "FREE";
  const accessSeatLimit =
    context?.platformProduct?.seatLimit ??
    context?.localEntitlement?.seatLimit ??
    null;

  const catalogQuery = useQuery({
    queryKey: ["/api/platform/billing/catalog"],
    queryFn: fetchBillingCatalog,
  });

  const subscriptionQuery = useQuery({
    queryKey: tenantId
      ? [buildTenantBillingSubscriptionApiPath(tenantId)]
      : ["settings-billing-subscription-empty"],
    queryFn: () => fetchBillingSubscription(tenantId as string),
    enabled: Boolean(tenantId) && canManageBilling,
  });

  const refetchBillingSubscription = subscriptionQuery.refetch;

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const actionKey = buildCheckoutActionKey(normalizedSeatCount);
      const result = await createCheckoutSession({
        tenantId: tenantId as string,
        seatCount: normalizedSeatCount,
        idempotencyKey: getOrCreateBillingIdempotencyKey(
          tenantId as string,
          actionKey,
        ),
      });
      setLastBillingAction(tenantId as string, actionKey);
      return result;
    },
    onSuccess: (result) => {
      window.location.href = result.url;
    },
    onError: (error) => {
      toast({
        title: t("settings.subscription.title"),
        description:
          error instanceof Error
            ? error.message
            : t("settings.subscription.unavailable"),
        variant: "destructive",
      });
    },
  });

  const portalMutation = useMutation({
    mutationFn: async (flowType: PlatformBillingPortalFlowType) => {
      const actionKey = buildPortalActionKey(flowType);
      const result = await createPortalSession({
        tenantId: tenantId as string,
        flowType,
        idempotencyKey: getOrCreateBillingIdempotencyKey(
          tenantId as string,
          actionKey,
        ),
      });
      setLastBillingAction(tenantId as string, actionKey);
      return result;
    },
    onSuccess: (result) => {
      window.location.href = result.url;
    },
    onError: (error) => {
      toast({
        title: t("settings.subscription.title"),
        description:
          error instanceof Error
            ? error.message
            : t("settings.subscription.unavailable"),
        variant: "destructive",
      });
    },
  });

  const businessPlan = catalogQuery.data?.plans.find(
    (plan) => plan.planCode === "BUSINESS",
  );
  const matchedTier = useMemo(() => {
    return (
      businessPlan?.tierTable.find((tier) => {
        const maxSeats = tier.maxSeats ?? Number.MAX_SAFE_INTEGER;
        return normalizedSeatCount >= tier.minSeats && normalizedSeatCount <= maxSeats;
      }) ?? null
    );
  }, [businessPlan?.tierTable, normalizedSeatCount]);
  const pricingSummary = useMemo(() => {
    if (!matchedTier) return null;

    const annualTotal =
      typeof matchedTier.annualUnitPrice === "number"
        ? matchedTier.annualUnitPrice * normalizedSeatCount
        : null;
    const monthlyEquivalent =
      annualTotal !== null
        ? Math.round(annualTotal / 12)
        : matchedTier.monthlyEquivalentPrice ?? null;

    return {
      annualTotal,
      monthlyEquivalent,
    };
  }, [matchedTier, normalizedSeatCount]);
  const hasManagedBillingSubscription = Boolean(
    subscriptionQuery.data?.providerSubscriptionId,
  );
  const canScheduleCancellation =
    hasManagedBillingSubscription &&
    subscriptionQuery.data?.cancelAtPeriodEnd !== true &&
    ["active", "trialing", "past_due"].includes(subscriptionQuery.data?.status ?? "");
  const isCancelReturn = billingReturnAction === "portal:subscription_cancel";

  const refreshBillingState = async () => {
    const [subscriptionResult, platformContextResult] = await Promise.all([
      refetchBillingSubscription(),
      refetchPlatformContext(),
    ]);

    return {
      subscription: subscriptionResult.data ?? null,
      platformContext: platformContextResult.data ?? context ?? null,
    };
  };

  const handleManualBillingRefresh = async () => {
    if (!billingReturnState) {
      await refreshBillingState();
      return;
    }

    setBillingSyncPhase("syncing");
    const next = await refreshBillingState();

    if (
      billingReturnState === PLATFORM_BILLING_RETURN_VALUES.checkoutSuccess &&
      !hasBusinessAccess(next.platformContext)
    ) {
      setBillingSyncPhase("timed_out");
      return;
    }

    if (
      billingReturnAction === "portal:subscription_cancel" &&
      !hasCancellationScheduled(next.subscription)
    ) {
      setBillingSyncPhase("timed_out");
      return;
    }

    setBillingSyncPhase("confirmed");
  };

  useEffect(() => {
    if (!billingReturnState || !tenantId || !canManageBilling) {
      if (!billingReturnState) {
        handledReturnKeyRef.current = null;
        setBillingSyncPhase("idle");
        setBillingReturnAction(null);
      }
      return;
    }

    const handledKey = `${tenantId}:${billingReturnState}`;
    if (handledReturnKeyRef.current === handledKey) {
      return;
    }
    handledReturnKeyRef.current = handledKey;

    clearStoredBillingIdempotencyKeys(tenantId);
    const lastAction = popLastBillingAction(tenantId);
    setBillingReturnAction(lastAction);

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const shouldKeepPolling = (next: {
      subscription: BillingSubscription;
      platformContext: PlatformContextResponse | null;
    }) => {
      if (billingReturnState === PLATFORM_BILLING_RETURN_VALUES.checkoutSuccess) {
        return !hasBusinessAccess(next.platformContext);
      }

      if (lastAction === "portal:subscription_cancel") {
        return !hasCancellationScheduled(next.subscription);
      }

      return false;
    };

    const syncOnce = async () => {
      setBillingSyncPhase("syncing");
      const next = await refreshBillingState();
      if (cancelled) {
        return true;
      }

      if (shouldKeepPolling(next)) {
        setBillingSyncPhase("waiting");
        return false;
      }

      setBillingSyncPhase("confirmed");
      return true;
    };

    void (async () => {
      const isCompleted = await syncOnce();
      if (isCompleted) {
        return;
      }

      intervalId = setInterval(() => {
        void (async () => {
          const completed = await syncOnce();
          if (completed && intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
        })();
      }, BILLING_SYNC_POLL_INTERVAL_MS);

      timeoutId = setTimeout(() => {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }

        if (!cancelled) {
          setBillingSyncPhase("timed_out");
        }
      }, BILLING_SYNC_TIMEOUT_MS);
    })();

    return () => {
      cancelled = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    billingReturnState,
    canManageBilling,
    context,
    refetchBillingSubscription,
    refetchPlatformContext,
    tenantId,
  ]);

  const syncMessage =
    !billingReturnState || billingSyncPhase === "idle"
      ? null
      : billingReturnState === PLATFORM_BILLING_RETURN_VALUES.checkoutCancel
        ? t("settings.subscription.checkoutCancelled")
        : billingReturnState === PLATFORM_BILLING_RETURN_VALUES.checkoutSuccess
          ? billingSyncPhase === "confirmed"
            ? t("settings.subscription.checkoutConfirmed")
            : billingSyncPhase === "timed_out"
              ? t("settings.subscription.checkoutPending")
              : t("settings.subscription.checkoutSyncing")
          : isCancelReturn
            ? billingSyncPhase === "confirmed"
              ? t("settings.subscription.cancelConfirmed")
              : billingSyncPhase === "timed_out"
                ? t("settings.subscription.cancelPending")
                : t("settings.subscription.cancelSyncing")
            : billingSyncPhase === "syncing"
              ? t("settings.subscription.refreshingStatus")
              : t("settings.subscription.portalReturned");

  if (!billingUiEnabled) {
    return (
      <Card className="border-white/10 bg-card/85 p-6">
        <p className="text-sm text-muted-foreground">
          구독 UI 기능이 현재 비활성화되어 있습니다.
        </p>
      </Card>
    );
  }

  if (isTenantLoading) {
    return (
      <Card className="border-white/10 bg-card/85 p-6">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </Card>
    );
  }

  if (!canManageBilling) {
    return (
      <Card className="border-white/10 bg-card/85 p-6">
        <p className="text-sm text-muted-foreground">
          {t("settings.subscription.requireOwner")}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-card/85 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
          Billing
        </p>
        <h2 className="mt-3 text-3xl font-black tracking-tight">
          {t("settings.subscription.title")}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {t("settings.subscription.description")}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Badge>{t("settings.subscription.currentPlan")}: {accessPlanCode}</Badge>
          {accessSeatLimit ? (
            <Badge variant="outline">
              {t("settings.subscription.range")}: {accessSeatLimit}
            </Badge>
          ) : null}
        </div>
      </Card>

      {syncMessage ? (
        <Card className="border-white/10 bg-card/85 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-muted-foreground">{syncMessage}</p>
            {billingSyncPhase === "waiting" || billingSyncPhase === "timed_out" ? (
              <Button variant="outline" onClick={() => void handleManualBillingRefresh()}>
                {t("common.refresh")}
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {subscriptionQuery.isError ? (
        <Card className="border-white/10 bg-card/85 p-6">
          <p className="text-sm text-destructive">
            {t("settings.subscription.unavailable")}
          </p>
        </Card>
      ) : subscriptionQuery.data ? (
        <Card className="border-white/10 bg-card/85 p-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t("settings.subscription.billingStatus")}
              </p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {subscriptionQuery.data.status}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t("settings.subscription.billingCycle")}
              </p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {subscriptionQuery.data.billingCycle ?? "-"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t("settings.subscription.range")}
              </p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {subscriptionQuery.data.quantity ?? "-"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t("settings.subscription.currentPeriodEnd")}
              </p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {formatDateTime(subscriptionQuery.data.currentPeriodEndAt, intlLocale)}
              </p>
            </div>
          </div>

          {subscriptionQuery.data.cancelAtPeriodEnd ? (
            <p className="mt-4 text-sm text-amber-300">
              {t("settings.subscription.cancelAtPeriodEnd")}:{" "}
              {formatDateTime(subscriptionQuery.data.currentPeriodEndAt, intlLocale)}
            </p>
          ) : null}
        </Card>
      ) : (
        <Card className="border-white/10 bg-card/85 p-6">
          <p className="text-sm text-muted-foreground">
            {t("settings.subscription.noActiveBilling")}
          </p>
        </Card>
      )}

      {catalogQuery.isError ? (
        <Card className="border-white/10 bg-card/85 p-6">
          <p className="text-sm text-destructive">
            {t("settings.subscription.unavailable")}
          </p>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          {catalogQuery.data?.plans.map((plan) => {
            const isBusiness = plan.planCode === "BUSINESS";
            const isFree = plan.planCode === "FREE";
            const isEnterprise = plan.planCode === "ENTERPRISE";

            return (
              <Card
                key={plan.planCode}
                className={`relative overflow-hidden border p-6 shadow-[0_20px_60px_rgba(0,0,0,0.22)] ${
                  plan.highlighted
                    ? "border-primary/40 bg-primary/5"
                    : "border-white/10 bg-card/85"
                }`}
              >
                <div className="space-y-5">
                  <div>
                    <h3 className="text-4xl font-black tracking-tight">{plan.name}</h3>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {plan.shortDescription}
                    </p>
                  </div>

                  <div>
                    <p className="text-5xl font-black tracking-tight">{plan.priceLabel}</p>
                  </div>

                  <div className="space-y-3">
                    {plan.features.map((feature) => (
                      <div key={feature} className="flex items-start gap-3 text-sm">
                        <Check className="mt-0.5 h-4 w-4 text-primary" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>

                  {isBusiness ? (
                    <div className="space-y-4 rounded-2xl border border-border/70 bg-background/40 p-4">
                      <div>
                        <p className="text-sm font-semibold">
                          {t("settings.subscription.range")}
                        </p>
                        <Input
                          type="number"
                          min={plan.minSeats ?? 6}
                          max={plan.maxSeats ?? 10000}
                          value={seatCount}
                          onChange={(event) => setSeatCount(event.target.value)}
                          className="mt-3"
                        />
                      </div>
                      {matchedTier ? (
                        <div className="space-y-2 text-sm text-muted-foreground">
                          <p>
                            {t("settings.subscription.monthlyEquivalent")}:{" "}
                            <span className="font-semibold text-foreground">
                              {formatWon(pricingSummary?.monthlyEquivalent ?? null)}
                            </span>
                          </p>
                          <p>
                            {t("settings.subscription.annualTotal")}:{" "}
                            <span className="font-semibold text-foreground">
                              {formatWon(pricingSummary?.annualTotal ?? null)}
                            </span>
                          </p>
                          <p>
                            {t("settings.subscription.includedCredits")}:{" "}
                            <span className="font-semibold text-foreground">
                              {matchedTier.includedCredits ?? "-"}
                            </span>
                          </p>
                        </div>
                      ) : null}
                      <div className="rounded-xl border border-border/60">
                        <table className="w-full text-sm">
                          <thead className="text-muted-foreground">
                            <tr className="border-b border-border/60">
                              <th className="px-3 py-2 text-left">구간</th>
                              <th className="px-3 py-2 text-left">가격</th>
                              <th className="px-3 py-2 text-left">비고</th>
                            </tr>
                          </thead>
                          <tbody>
                            {plan.tierTable.map((tier) => (
                              <tr
                                key={`${tier.minSeats}-${tier.maxSeats ?? "plus"}`}
                                className="border-b border-border/40"
                              >
                                <td className="px-3 py-2">
                                  {tier.minSeats} - {tier.maxSeats ?? "10,001+"}
                                </td>
                                <td className="px-3 py-2">
                                  {formatWon(tier.annualUnitPrice ?? null)}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">
                                  {tier.note ?? "-"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}

                  {isFree ? (
                    <Link href="/projects/experience">
                      <Button className="w-full">
                        {t("settings.subscription.startExperience")}
                      </Button>
                    </Link>
                  ) : null}

                  {isBusiness ? (
                    <div className="space-y-3">
                      <Button
                        className="w-full"
                        disabled={checkoutMutation.isPending || !matchedTier}
                        onClick={() => checkoutMutation.mutate()}
                      >
                        {checkoutMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {t("common.loading")}
                          </>
                        ) : (
                          t("settings.subscription.upgrade")
                        )}
                      </Button>
                      {accessPlanCode === "BUSINESS" ? (
                        <>
                          <Button
                            variant="outline"
                            className="w-full"
                            disabled={
                              portalMutation.isPending || !hasManagedBillingSubscription
                            }
                            onClick={() =>
                              portalMutation.mutate("payment_method_update")
                            }
                          >
                            {portalMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <ArrowUpRight className="mr-2 h-4 w-4" />
                            )}
                            {t("settings.subscription.updatePaymentMethod")}
                          </Button>
                          <Button
                            variant="outline"
                            className="w-full"
                            disabled={portalMutation.isPending || !canScheduleCancellation}
                            onClick={() =>
                              portalMutation.mutate("subscription_cancel")
                            }
                          >
                            {portalMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <ArrowUpRight className="mr-2 h-4 w-4" />
                            )}
                            {t("settings.subscription.scheduleCancellation")}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  ) : null}

                  {isEnterprise ? (
                    <Button asChild variant="outline" className="w-full">
                      <a href={plan.contactUrl ?? "mailto:sales@evriz.co.kr"}>
                        {t("settings.subscription.contact")}
                      </a>
                    </Button>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
