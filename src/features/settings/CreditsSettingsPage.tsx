"use client";

import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/I18nProvider";
import { fetchTenantCredits } from "@/lib/platformApi";
import {
  buildTenantCreditsQueryKey,
  TENANT_CREDITS_ALWAYS_FRESH_QUERY_OPTIONS,
} from "@/lib/tenantCreditsRealtime";
import { useSettingsTenant } from "@/features/settings/useSettingsTenant";

export default function CreditsSettingsPage() {
  const { t } = useI18n();
  const { tenantId, membership, isLoading: isTenantLoading } = useSettingsTenant();
  const canViewCredits = ["OWNER", "ADMIN"].includes(membership?.role ?? "");

  const formatAmount = (amount: number) => (amount > 0 ? `+${amount}` : `${amount}`);
  const formatDate = (value: string) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
  };

  const creditsQuery = useQuery({
    queryKey: tenantId ? buildTenantCreditsQueryKey(tenantId) : ["settings-credits-empty"],
    queryFn: () => fetchTenantCredits(tenantId as string),
    enabled: Boolean(tenantId) && canViewCredits,
    ...TENANT_CREDITS_ALWAYS_FRESH_QUERY_OPTIONS,
  });

  if (isTenantLoading) {
    return (
      <Card className="border-white/10 bg-card/85 p-6">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </Card>
    );
  }

  if (!canViewCredits) {
    return (
      <Card className="border-white/10 bg-card/85 p-6">
        <p className="text-sm text-muted-foreground">
          {t("settings.credits.requireAdmin")}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-card/85 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
              Credits
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight">
              {t("settings.credits.title")}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("settings.credits.description")}
            </p>
          </div>

          <div className="min-w-[220px] rounded-2xl border border-border/60 bg-background/50 p-5 md:self-stretch">
            <p className="text-sm text-muted-foreground">{t("settings.credits.balance")}</p>
            {creditsQuery.data ? (
              <p className="mt-3 text-4xl font-black">{creditsQuery.data.balance ?? "-"}</p>
            ) : creditsQuery.isError ? (
              <p className="mt-3 text-sm text-destructive">{t("common.unavailable")}</p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">{t("common.loading")}</p>
            )}
          </div>
        </div>
      </Card>

      {creditsQuery.data ? (
        <>
          <Card className="border-white/10 bg-card/85 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold">{t("settings.credits.policy")}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("settings.credits.reason")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {creditsQuery.data.rechargeUrl ? (
                  <Button asChild>
                    <a href={creditsQuery.data.rechargeUrl}>{t("settings.credits.recharge")}</a>
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {creditsQuery.data.policies.map((policy) => (
                <div
                  key={policy.featureKey}
                  className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-background/40 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-semibold">{policy.label}</p>
                  </div>
                  <Badge variant="default">
                    {t("settings.credits.policyCost", { count: policy.cost })}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card className="border-white/10 bg-card/85 p-6">
            <h3 className="text-xl font-bold">{t("settings.credits.history")}</h3>
            <div className="mt-5 space-y-3">
              {creditsQuery.data.recentEvents.length > 0 ? (
                creditsQuery.data.recentEvents.map((event) => (
                  <div
                    key={event.eventId}
                    className="rounded-2xl border border-border/60 bg-background/40 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">{event.description}</p>
                      <Badge variant="outline">{formatAmount(event.amount)}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {event.type} · {formatDate(event.createdAt)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("settings.credits.emptyHistory")}
                </p>
              )}
            </div>
          </Card>
        </>
      ) : creditsQuery.isError ? (
        <Card className="border-white/10 bg-card/85 p-6">
          <p className="text-sm text-destructive">
            {creditsQuery.error instanceof Error
              ? creditsQuery.error.message
              : t("common.unavailable")}
          </p>
        </Card>
      ) : (
        <Card className="border-white/10 bg-card/85 p-6">
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        </Card>
      )}
    </div>
  );
}
