"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/I18nProvider";
import { useFeatureFlags } from "@/components/FeatureFlagProvider";
import { useToast } from "@/hooks/use-toast";
import {
  createTenantAiKey,
  deleteTenantAiKey,
  fetchTenantAiKeys,
  updateTenantAiKey,
} from "@/lib/platformApi";
import { useSettingsTenant } from "@/features/settings/useSettingsTenant";

export default function ApiKeysSettingsPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { byokUiEnabled } = useFeatureFlags();
  const { tenantId, membership, isLoading: isTenantLoading } = useSettingsTenant();
  const [provider, setProvider] = useState("CLAUDE");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [scopesText, setScopesText] = useState("template-ai,training-page-ai");
  const canManageAiKeys = membership?.role === "OWNER";

  const aiKeysQuery = useQuery({
    queryKey: tenantId ? [`/api/platform/tenants/${tenantId}/ai-keys`] : ["settings-ai-keys-empty"],
    queryFn: () => fetchTenantAiKeys(tenantId as string),
    enabled: Boolean(tenantId) && byokUiEnabled && canManageAiKeys,
  });

  const scopes = useMemo(
    () =>
      scopesText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    [scopesText],
  );

  const createMutation = useMutation({
    mutationFn: async () =>
      createTenantAiKey({
        tenantId: tenantId as string,
        provider,
        label,
        apiKey,
        scopes,
      }),
    onSuccess: () => {
      setLabel("");
      setApiKey("");
      queryClient.invalidateQueries({
        queryKey: [`/api/platform/tenants/${tenantId}/ai-keys`],
      });
      toast({
        title: t("settings.apiKeys.title"),
        description: "API 키를 등록했습니다.",
      });
    },
    onError: (error) => {
      toast({
        title: t("settings.apiKeys.title"),
        description: error instanceof Error ? error.message : t("common.unavailable"),
        variant: "destructive",
      });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (input: { keyId: string; status: string }) =>
      updateTenantAiKey({
        tenantId: tenantId as string,
        keyId: input.keyId,
        status: input.status,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/platform/tenants/${tenantId}/ai-keys`],
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (keyId: string) =>
      deleteTenantAiKey({
        tenantId: tenantId as string,
        keyId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/platform/tenants/${tenantId}/ai-keys`],
      });
    },
  });

  if (!byokUiEnabled) {
    return (
      <Card className="border-white/10 bg-card/85 p-6">
        <p className="text-sm text-muted-foreground">BYOK 기능이 현재 비활성화되어 있습니다.</p>
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

  if (!canManageAiKeys) {
    return (
      <Card className="border-white/10 bg-card/85 p-6">
        <p className="text-sm text-muted-foreground">
          {t("settings.apiKeys.requireOwner")}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-card/85 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
          BYOK
        </p>
        <h2 className="mt-3 text-3xl font-black tracking-tight">
          {t("settings.apiKeys.title")}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {t("settings.apiKeys.description")}
        </p>
        <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
          저장 시 API 키 원문은 다시 노출되지 않으며, 제품 DB에 암호화된 상태로 보관됩니다.
        </p>

        <form
          className="mt-6 grid gap-4 rounded-2xl border border-border/70 bg-background/40 p-5 lg:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!label.trim() || !apiKey.trim()) return;
            createMutation.mutate();
          }}
        >
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CLAUDE">CLAUDE</SelectItem>
                <SelectItem value="OPENAI">OPENAI</SelectItem>
                <SelectItem value="GEMINI">GEMINI</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("settings.apiKeys.label")}</Label>
            <Input value={label} onChange={(event) => setLabel(event.target.value)} />
          </div>
          <div className="space-y-2 lg:col-span-2">
            <Label>API Key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="sk-..."
            />
          </div>
          <div className="space-y-2 lg:col-span-2">
            <Label>Scopes</Label>
            <Input
              value={scopesText}
              onChange={(event) => setScopesText(event.target.value)}
              placeholder="template-ai,training-page-ai"
            />
          </div>
          <div className="lg:col-span-2">
            <Button type="submit" disabled={!label.trim() || !apiKey.trim() || createMutation.isPending}>
              {t("settings.apiKeys.create")}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="border-white/10 bg-card/85 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
        <h3 className="text-xl font-bold">{t("settings.apiKeys.title")}</h3>
        <div className="mt-5 space-y-3">
          {aiKeysQuery.isError ? (
            <p className="text-sm text-destructive">
              {aiKeysQuery.error instanceof Error
                ? aiKeysQuery.error.message
                : t("settings.apiKeys.unavailable")}
            </p>
          ) : aiKeysQuery.data?.items.length ? (
            aiKeysQuery.data.items.map((item) => (
              <div
                key={item.keyId}
                className="rounded-2xl border border-border/60 bg-background/40 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{item.label}</p>
                      <Badge variant={item.status === "ACTIVE" ? "default" : "outline"}>
                        {item.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {item.provider} · {item.maskedValue}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      scopes: {item.scopes.join(", ") || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("settings.apiKeys.lastUsedAt")}: {item.lastUsedAt ?? "-"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        toggleMutation.mutate({
                          keyId: item.keyId,
                          status: item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                        })
                      }
                    >
                      {item.status === "ACTIVE" ? "비활성화" : "활성화"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => deleteMutation.mutate(item.keyId)}
                    >
                      삭제
                    </Button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">{t("settings.apiKeys.empty")}</p>
          )}
        </div>
      </Card>
    </div>
  );
}
