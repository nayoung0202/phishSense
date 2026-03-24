"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SmtpConfigForm, createEmptySmtpConfig, type SmtpConfigFormHandle } from "@/components/admin/SmtpConfigForm";
import { SmtpTestPanel } from "@/components/admin/SmtpTestPanel";
import { createSmtpConfig, getSmtpConfig, testSmtpConfig, updateSmtpConfig } from "@/lib/api";
import type { SmtpConfigResponse, TestSmtpConfigPayload, UpdateSmtpConfigPayload } from "@/types/smtp";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/components/I18nProvider";

export type SmtpConfigDetailProps = {
  smtpAccountId?: string;
  tenantId?: string;
  mode: "create" | "edit";
  title: string;
  description?: string;
  onBack?: () => void;
  onSaveSuccess?: () => void;
};

export function SmtpConfigDetail({
  smtpAccountId,
  tenantId,
  mode,
  title,
  description,
  onBack,
  onSaveSuccess,
}: SmtpConfigDetailProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [formResetKey, setFormResetKey] = useState(0);
  const [savedConfig, setSavedConfig] = useState<SmtpConfigResponse | null>(null);
  const formRef = useRef<SmtpConfigFormHandle>(null);
  const queryClient = useQueryClient();
  const activeSmtpAccountId = smtpAccountId ?? savedConfig?.id ?? "";
  const isPersistedConfig = activeSmtpAccountId.length > 0;
  const effectiveMode = isPersistedConfig ? "edit" : mode;

  const shouldFetch = isPersistedConfig;
  const {
    data: fetchedConfigData,
    error: fetchError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["smtp-config", activeSmtpAccountId],
    queryFn: () => getSmtpConfig(activeSmtpAccountId),
    enabled: shouldFetch,
  });
  const configData = (fetchedConfigData as SmtpConfigResponse | undefined) ?? savedConfig ?? null;

  const refreshConfig = useCallback(() => {
    if (!activeSmtpAccountId) return;
    void refetch();
  }, [activeSmtpAccountId, refetch]);

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateSmtpConfigPayload) =>
      activeSmtpAccountId
        ? updateSmtpConfig(activeSmtpAccountId, payload)
        : createSmtpConfig(payload),
    onSuccess: (result) => {
      const nextConfig = result?.item ?? null;
      const savedConfigId = nextConfig?.id ?? activeSmtpAccountId;
      if (nextConfig) {
        setSavedConfig(nextConfig);
      }
      toast({ title: t("smtpDetail.saveSuccess") });
      void queryClient.invalidateQueries({ queryKey: ["smtp-configs"] });
      if (savedConfigId) {
        void queryClient.invalidateQueries({ queryKey: ["smtp-config", savedConfigId] });
      }
      if (savedConfigId) {
        refreshConfig();
      }
      if (onSaveSuccess) {
        onSaveSuccess();
      }
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : t("common.unknownError");
      toast({ title: t("smtpDetail.saveFailedTitle"), description: message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: (payload: TestSmtpConfigPayload) => testSmtpConfig(activeSmtpAccountId, payload),
    onSuccess: (response) => {
      toast({
        title: t("smtpDetail.testRequestedTitle"),
        description: response?.message || t("smtpDetail.testRequestedDescription"),
      });
      refreshConfig();
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : t("common.unknownError");
      toast({ title: t("smtpDetail.testFailedTitle"), description: message, variant: "destructive" });
    },
  });

  const handleSave = useCallback(
    async (payload: UpdateSmtpConfigPayload) => {
      await updateMutation.mutateAsync(payload);
    },
    [updateMutation],
  );

  const handleTest = useCallback(
    async (payload: TestSmtpConfigPayload) => {
      await testMutation.mutateAsync(payload);
    },
    [testMutation],
  );

  const fetchErrorMessage = useMemo(() => {
    if (!fetchError) return null;
    if (fetchError instanceof Error) return fetchError.message;
    return t("smtpDetail.fetchFailed");
  }, [fetchError, t]);

  const testDisabledReason = useMemo(() => {
    if (!activeSmtpAccountId) {
      return t("smtpDetail.testDisabled.notSaved");
    }
    if (!configData) {
      return t("smtpDetail.testDisabled.loading");
    }
    if (!configData.hasPassword) {
      return t("smtpDetail.testDisabled.missingPassword");
    }
    if (configData.port !== 465 && configData.port !== 587) {
      return t("smtpDetail.testDisabled.unsupportedPort");
    }
    return undefined;
  }, [activeSmtpAccountId, configData, t]);

  const canTest = Boolean(!testDisabledReason);

  const handleRefreshClick = useCallback(() => {
    setFormResetKey((prev) => prev + 1);
    refreshConfig();
  }, [refreshConfig]);

  const initialFormData = useMemo<SmtpConfigResponse | null>(() => {
    if (!configData) {
      return createEmptySmtpConfig(tenantId ?? "") as SmtpConfigResponse;
    }
    return configData;
  }, [configData, tenantId]);

  const formIdentifier = activeSmtpAccountId || tenantId || "new";

  return (
    <div className="space-y-6 px-4 py-6 lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {onBack && (
            <Button variant="outline" onClick={onBack}>
              {t("common.backToList")}
            </Button>
          )}
          <Button variant="outline" onClick={handleRefreshClick} disabled={!shouldFetch || isFetching}>
            <RefreshCw className="w-4 h-4 mr-1" /> {t("common.refresh")}
          </Button>
        </div>
      </div>

      {shouldFetch && fetchErrorMessage && (
        <Alert variant="destructive">
          <AlertTitle>{t("smtpDetail.fetchFailedTitle")}</AlertTitle>
          <AlertDescription>{fetchErrorMessage.slice(0, 400)}</AlertDescription>
        </Alert>
      )}

      <SmtpConfigForm
        ref={formRef}
        key={`${formIdentifier}-${effectiveMode}-${formResetKey}`}
        mode={effectiveMode}
        tenantId={tenantId ?? configData?.tenantId ?? ""}
        initialData={initialFormData}
        onSubmit={handleSave}
        isSubmitting={updateMutation.isPending}
        disabled={updateMutation.isPending || (shouldFetch && !configData)}
      />

      <SmtpTestPanel
        key={`test-${formIdentifier}-${effectiveMode}-${formResetKey}`}
        onSubmit={handleTest}
        isTesting={testMutation.isPending}
        disabled={!canTest || testMutation.isPending || updateMutation.isPending}
        disabledReason={testDisabledReason}
        allowedSenderDomains={configData?.allowedSenderDomains || null}
        lastTestedAt={configData?.lastTestedAt}
        lastTestStatus={configData?.lastTestStatus}
        lastTestError={configData?.lastTestError}
      />
    </div>
  );
}
