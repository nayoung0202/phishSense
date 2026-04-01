"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, Globe2, Loader2, ShieldCheck, Waypoints } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/hooks/use-toast";
import { useSettingsTenant } from "@/features/settings/useSettingsTenant";
import {
  fetchTenantDomainSettingsApi,
  saveTenantDomainApi,
} from "@/lib/tenantDomainApi";

const DOMAIN_QUERY_KEY = ["/api/settings/domain"] as const;

export default function DomainSettingsPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { membership, isLoading: isTenantLoading } = useSettingsTenant();
  const [slug, setSlug] = useState("");

  const canView = ["OWNER", "ADMIN"].includes(membership?.role ?? "");
  const canManage = membership?.role === "OWNER";

  const domainQuery = useQuery({
    queryKey: DOMAIN_QUERY_KEY,
    queryFn: fetchTenantDomainSettingsApi,
    enabled: canView && !isTenantLoading,
  });

  useEffect(() => {
    if (domainQuery.data?.domain?.slug) {
      setSlug(domainQuery.data.domain.slug);
    }
  }, [domainQuery.data?.domain?.slug]);

  const saveMutation = useMutation({
    mutationFn: () => saveTenantDomainApi(slug.replace(/-+$/, "")),
    onSuccess: (data) => {
      queryClient.setQueryData(DOMAIN_QUERY_KEY, data);
      setSlug(data.domain?.slug ?? "");
      toast({
        title: t("settings.domain.title"),
        description: t("settings.domain.saved"),
      });
    },
    onError: (error) => {
      toast({
        title: t("settings.domain.title"),
        description: error instanceof Error ? error.message : t("common.unavailable"),
        variant: "destructive",
      });
    },
  });

  const baseDomain = domainQuery.data?.baseDomain ?? "phishsense.cloud";
  const savedSlug = domainQuery.data?.domain?.slug ?? "";
  const normalizedSlug = slug.replace(/-+$/, "");
  const previewFqdn = normalizedSlug ? `${normalizedSlug}.${baseDomain}` : `tenant-slug.${baseDomain}`;
  const activeFqdn = domainQuery.data?.domain?.fqdn ?? null;
  const cnameTarget = activeFqdn ?? previewFqdn;
  const isUnchanged = !!savedSlug && normalizedSlug === savedSlug;

  const handleCopy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast({
      title: t("common.copied"),
      description: value,
    });
  };

  if (isTenantLoading) {
    return (
      <Card className="border-white/10 bg-card/85 p-6">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </Card>
    );
  }

  if (!canView) {
    return (
      <Card className="border-white/10 bg-card/85 p-6">
        <p className="text-sm text-muted-foreground">{t("settings.domain.requireAdmin")}</p>
      </Card>
    );
  }

  if (domainQuery.isLoading) {
    return (
      <Card className="border-white/10 bg-card/85 p-6">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </Card>
    );
  }

  if (domainQuery.isError) {
    return (
      <Card className="border-white/10 bg-card/85 p-6">
        <p className="text-sm text-destructive">
          {domainQuery.error instanceof Error
            ? domainQuery.error.message
            : t("common.unavailable")}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-card/85 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
              Tracking Domain
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight">
              {t("settings.domain.title")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {t("settings.domain.description")}
            </p>
          </div>
          <Badge variant={canManage ? "default" : "outline"} className="h-fit">
            <ShieldCheck className="mr-2 h-4 w-4" />
            {membership?.role ?? "-"}
          </Badge>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          {/* 1단계: slug 입력 */}
          <div className="rounded-2xl border border-border/70 bg-background/40 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Waypoints className="h-4 w-4 text-primary" />
              <p className="font-semibold">{t("settings.domain.saveTitle")}</p>
            </div>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!canManage || !normalizedSlug || isUnchanged || saveMutation.isPending) {
                  return;
                }
                saveMutation.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="tenant-domain-slug">{t("settings.domain.slug")}</Label>
                <Input
                  id="tenant-domain-slug"
                  value={slug}
                  onChange={(e) =>
                    setSlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, "")
                        .replace(/^-+/, ""),
                    )
                  }
                  placeholder={t("settings.domain.slugPlaceholder")}
                  disabled={!canManage}
                />
                <p className="text-xs text-muted-foreground">
                  {t("settings.domain.slugDescription")}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/50 p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("settings.domain.preview")}
                </p>
                <p className="mt-2 break-all font-semibold">{previewFqdn}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="submit"
                  disabled={!canManage || !normalizedSlug || isUnchanged || saveMutation.isPending}
                >
                  {saveMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("common.saveProgress")}
                    </>
                  ) : (
                    t("common.save")
                  )}
                </Button>
                {isUnchanged && (
                  <p className="text-xs text-muted-foreground">{t("settings.domain.noChange")}</p>
                )}
                {!canManage && (
                  <p className="text-xs text-muted-foreground">
                    {t("settings.domain.requireOwner")}
                  </p>
                )}
              </div>
            </form>
          </div>

          {/* 2단계: 발급 도메인 확인 */}
          <div className="rounded-2xl border border-border/70 bg-background/40 p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Globe2 className="h-4 w-4 text-primary" />
                <p className="font-semibold">{t("settings.domain.issuedDomain")}</p>
              </div>
              {activeFqdn && (
                <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />
                  {t("settings.domain.active")}
                </Badge>
              )}
            </div>
            {activeFqdn ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {t("settings.domain.current")}
                </p>
                <p className="mt-2 break-all text-lg font-semibold">{activeFqdn}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <Globe2 className="h-10 w-10 text-muted-foreground/25" />
                <p className="text-sm text-muted-foreground">{t("settings.domain.none")}</p>
                <p className="text-xs text-muted-foreground/60">
                  {t("settings.domain.noneHint")}
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card
        className={`border-white/10 bg-card/85 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.22)] transition-opacity ${!activeFqdn ? "opacity-60" : ""}`}
      >
        <h3 className="text-xl font-bold">{t("settings.domain.cnameTitle")}</h3>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {t("settings.domain.cnameDescription")}
        </p>
        {!activeFqdn && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
            <p className="text-sm text-amber-600 dark:text-amber-400">
              {t("settings.domain.cnameSetupNote")}
            </p>
          </div>
        )}
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
            <p className="text-xs font-medium text-muted-foreground">
              {t("settings.domain.cnameType")}
            </p>
            <p className="mt-2 font-semibold">CNAME</p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
            <p className="text-xs font-medium text-muted-foreground">
              {t("settings.domain.cnameHost")}
            </p>
            <p className="mt-2 font-semibold">training.customer.example</p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
            <p className="text-xs font-medium text-muted-foreground">
              {t("settings.domain.cnameValue")}
            </p>
            <p className="mt-2 break-all font-semibold">{cnameTarget}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={() => handleCopy(cnameTarget)}>
            <Copy className="mr-2 h-4 w-4" />
            {t("settings.domain.copyCnameValue")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
