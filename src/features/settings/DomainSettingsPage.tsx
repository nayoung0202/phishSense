"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Globe2, Loader2, ShieldCheck, Waypoints } from "lucide-react";
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

const normalizeSlugPreview = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+/, "").replace(/-+$/, "");

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
    mutationFn: () => saveTenantDomainApi(slug),
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
  const previewSlug = normalizeSlugPreview(slug);
  const previewFqdn = previewSlug ? `${previewSlug}.${baseDomain}` : `tenant-slug.${baseDomain}`;
  const activeFqdn = domainQuery.data?.domain?.fqdn ?? null;
  const cnameTarget = activeFqdn ?? previewFqdn;

  const trackingExamples = useMemo(
    () => [
      `/p/{token}`,
      `/t/{token}`,
      `/o/{token}`,
    ].map((path) => `https://${cnameTarget}${path}`),
    [cnameTarget],
  );

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
          <div className="rounded-2xl border border-border/70 bg-background/40 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-primary" />
              <p className="font-semibold">{t("settings.domain.issuedDomain")}</p>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {t("settings.domain.current")}
                </p>
                <p className="mt-2 text-lg font-semibold">
                  {activeFqdn ?? t("settings.domain.none")}
                </p>
              </div>
              {activeFqdn ? (
                <Button type="button" variant="outline" onClick={() => handleCopy(activeFqdn)}>
                  <Copy className="mr-2 h-4 w-4" />
                  {t("settings.domain.copyIssuedDomain")}
                </Button>
              ) : null}
              <div className="rounded-xl border border-primary/20 bg-primary/10 p-4 text-sm text-muted-foreground">
                {t("settings.domain.trackingOnly")}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-background/40 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Waypoints className="h-4 w-4 text-primary" />
              <p className="font-semibold">{t("settings.domain.saveTitle")}</p>
            </div>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!canManage || !slug.trim() || saveMutation.isPending) {
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
                  onChange={(event) => setSlug(event.target.value)}
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
              {!canManage ? (
                <p className="text-sm text-muted-foreground">
                  {t("settings.domain.requireOwner")}
                </p>
              ) : null}
              <Button type="submit" disabled={!canManage || !slug.trim() || saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("common.saveProgress")}
                  </>
                ) : (
                  t("common.save")
                )}
              </Button>
            </form>
          </div>
        </div>
      </Card>

      <Card className="border-white/10 bg-card/85 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
        <h3 className="text-xl font-bold">{t("settings.domain.cnameTitle")}</h3>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {t("settings.domain.cnameDescription")}
        </p>
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
        <p className="mt-4 text-sm text-muted-foreground">{t("settings.domain.cnameTlsNote")}</p>
      </Card>

      <Card className="border-white/10 bg-card/85 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
        <h3 className="text-xl font-bold">{t("settings.domain.trackingExamples")}</h3>
        <div className="mt-5 space-y-3">
          {trackingExamples.map((example) => (
            <div
              key={example}
              className="rounded-2xl border border-border/60 bg-background/40 p-4"
            >
              <p className="break-all text-sm font-medium">{example}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
