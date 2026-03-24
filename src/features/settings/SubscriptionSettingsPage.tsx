"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowUpRight, Check, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/I18nProvider";
import { useFeatureFlags } from "@/components/FeatureFlagProvider";
import { useToast } from "@/hooks/use-toast";
import {
  createCheckoutSession,
  createPortalSession,
  fetchBillingCatalog,
  fetchTenantSubscription,
} from "@/lib/platformApi";
import { useSettingsTenant } from "@/features/settings/useSettingsTenant";

const formatWon = (value: number | null | undefined) =>
  typeof value === "number" ? `₩${value.toLocaleString("ko-KR")}` : "-";

export default function SubscriptionSettingsPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { billingUiEnabled } = useFeatureFlags();
  const { tenantId, membership, isLoading: isTenantLoading } = useSettingsTenant();
  const [seatCount, setSeatCount] = useState("6");
  const canManageBilling = membership?.role === "OWNER";
  const normalizedSeatCount = Math.max(6, Number(seatCount) || 6);

  const catalogQuery = useQuery({
    queryKey: ["/api/platform/billing/catalog"],
    queryFn: fetchBillingCatalog,
  });

  const subscriptionQuery = useQuery({
    queryKey: tenantId ? [`/api/platform/tenants/${tenantId}/subscription`] : ["settings-subscription-empty"],
    queryFn: () => fetchTenantSubscription(tenantId as string),
    enabled: Boolean(tenantId) && canManageBilling,
  });

  const checkoutMutation = useMutation({
    mutationFn: async () =>
      createCheckoutSession({
        tenantId: tenantId as string,
        planCode: "BUSINESS",
        seatCount: Number(seatCount),
        successUrl: `${window.location.origin}/settings/subscription?checkout=success`,
        cancelUrl: `${window.location.origin}/settings/subscription?checkout=cancel`,
      }),
    onSuccess: (result) => {
      window.location.href = result.checkoutUrl;
    },
    onError: (error) => {
      toast({
        title: t("settings.subscription.title"),
        description: error instanceof Error ? error.message : t("settings.subscription.unavailable"),
        variant: "destructive",
      });
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () =>
      createPortalSession({
        tenantId: tenantId as string,
        returnUrl: `${window.location.origin}/settings/subscription`,
      }),
    onSuccess: (result) => {
      window.location.href = result.portalUrl;
    },
    onError: (error) => {
      toast({
        title: t("settings.subscription.title"),
        description: error instanceof Error ? error.message : t("settings.subscription.unavailable"),
        variant: "destructive",
      });
    },
  });

  const businessPlan = catalogQuery.data?.plans.find((plan) => plan.planCode === "BUSINESS");
  const currentPlanCode = subscriptionQuery.data?.planCode ?? "FREE";
  const matchedTier = useMemo(() => {
    return businessPlan?.tierTable.find((tier) => {
      const maxSeats = tier.maxSeats ?? Number.MAX_SAFE_INTEGER;
      return normalizedSeatCount >= tier.minSeats && normalizedSeatCount <= maxSeats;
    }) ?? null;
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
          <Badge>{t("settings.subscription.currentPlan")}: {currentPlanCode}</Badge>
          {subscriptionQuery.data?.seatLimit ? (
            <Badge variant="outline">
              {t("settings.subscription.range")}: {subscriptionQuery.data.seatLimit}
            </Badge>
          ) : null}
        </div>
      </Card>

      {catalogQuery.isError ? (
        <Card className="border-white/10 bg-card/85 p-6">
          <p className="text-sm text-destructive">{t("settings.subscription.unavailable")}</p>
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
                        <p className="text-sm font-semibold">{t("settings.subscription.range")}</p>
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
                      {currentPlanCode === "BUSINESS" ? (
                        <Button
                          variant="outline"
                          className="w-full"
                          disabled={portalMutation.isPending}
                          onClick={() => portalMutation.mutate()}
                        >
                          {portalMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <ArrowUpRight className="mr-2 h-4 w-4" />
                          )}
                          {t("settings.subscription.manageBilling")}
                        </Button>
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
