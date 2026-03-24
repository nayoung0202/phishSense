import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, X } from "lucide-react";
import {
  MAX_ALLOWED_SENDER_DOMAINS,
  getSmtpValidationErrorCode,
  normalizeSmtpDomain,
  normalizeSmtpDomains,
  validateAllowedSenderDomains,
  validateSmtpConnectionInput,
  validateSmtpHost,
} from "@/lib/smtpValidation";
import type { SmtpConfigResponse, UpdateSmtpConfigPayload } from "@/types/smtp";
import { useI18n } from "@/components/I18nProvider";

type FormState = {
  name: string;
  host: string;
  port: number;
  securityMode: SmtpConfigResponse["securityMode"];
  username: string;
  allowedSenderDomains: string[];
  tlsVerify: boolean;
  rateLimitPerMin: number;
  isActive: boolean;
};

type PortMode = "25" | "465" | "587" | "custom";
type SecurityPreset = "SMTP" | "SMTPS" | "STARTTLS";

export const defaultFormState: FormState = {
  name: "",
  host: "",
  port: 587,
  securityMode: "STARTTLS",
  username: "",
  allowedSenderDomains: [],
  tlsVerify: true,
  rateLimitPerMin: 60,
  isActive: true,
};

export function createEmptySmtpConfig(tenantId: string): SmtpConfigResponse {
  return {
    id: "",
    tenantId,
    name: "",
    host: "",
    port: 587,
    securityMode: "STARTTLS",
    username: "",
    tlsVerify: true,
    rateLimitPerMin: 60,
    allowedSenderDomains: [],
    isActive: true,
    lastTestedAt: null,
    lastTestStatus: null,
    lastTestError: null,
    hasPassword: false,
  };
}

const inferPortMode = (port: number): PortMode => {
  if (port === 25) return "25";
  if (port === 465) return "465";
  if (port === 587) return "587";
  return "custom";
};

const snapshotFormState = (state: FormState) =>
  JSON.stringify(state);

type SmtpConfigFormProps = {
  mode: "create" | "edit";
  tenantId: string;
  initialData?: SmtpConfigResponse | null;
  onSubmit: (payload: UpdateSmtpConfigPayload) => Promise<void> | void;
  isSubmitting?: boolean;
  disabled?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
};

export type SmtpConfigFormHandle = {
  submit: () => Promise<void>;
};

export const SmtpConfigForm = forwardRef<SmtpConfigFormHandle, SmtpConfigFormProps>(function SmtpConfigForm(
  { mode, tenantId, initialData, onSubmit, isSubmitting, disabled, onDirtyChange },
  ref,
) {
  const { t } = useI18n();
  const [formState, setFormState] = useState<FormState>(defaultFormState);
  const [passwordInput, setPasswordInput] = useState("");
  const [senderDomainDraft, setSenderDomainDraft] = useState("");
  const [portMode, setPortMode] = useState<PortMode>("587");
  const [customPortInput, setCustomPortInput] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [senderDomainError, setSenderDomainError] = useState<string | null>(null);
  const snapshotRef = useRef<string | null>(null);
  const [isDirtyState, setIsDirtyState] = useState(false);

  useEffect(() => {
    if (!initialData) {
      setFormState(defaultFormState);
      setPasswordInput("");
      setSenderDomainDraft("");
      setSenderDomainError(null);
      setPortMode("587");
      setCustomPortInput("");
      snapshotRef.current = snapshotFormState(defaultFormState);
      setIsDirtyState(false);
      onDirtyChange?.(false);
      return;
    }

    const normalizedDomains = normalizeSmtpDomains(initialData.allowedSenderDomains);
    const nextPortMode = inferPortMode(initialData.port);

    const safePort = Number(initialData.port) || 0;

    const nextState: FormState = {
      name: initialData.name || "",
      host: initialData.host,
      port: safePort > 0 ? safePort : 587,
      securityMode:
        initialData.securityMode === "SMTPS" || initialData.securityMode === "STARTTLS"
          ? initialData.securityMode
          : "NONE",
      username: initialData.username || "",
      allowedSenderDomains: normalizedDomains,
      tlsVerify: initialData.tlsVerify,
      rateLimitPerMin: initialData.rateLimitPerMin,
      isActive: initialData.isActive,
    };
    setFormState(nextState);
    setPortMode(nextPortMode);
    setCustomPortInput(nextPortMode === "custom" ? String(initialData.port) : "");
    setPasswordInput("");
    setSenderDomainDraft("");
    setSenderDomainError(null);
    snapshotRef.current = snapshotFormState(nextState);
    setIsDirtyState(false);
    onDirtyChange?.(false);
  }, [initialData, onDirtyChange]);

  useEffect(() => {
    if (!snapshotRef.current) return;
    const currentSnapshot = snapshotFormState(formState);
    const dirty = currentSnapshot !== snapshotRef.current || passwordInput.length > 0;
    if (dirty !== isDirtyState) {
      setIsDirtyState(dirty);
      onDirtyChange?.(dirty);
    }
  }, [formState, passwordInput, isDirtyState, onDirtyChange]);

  const handleChange = useCallback(<TKey extends keyof FormState>(key: TKey, value: FormState[TKey]) => {
    setFormState((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  const hostValue = (formState.host ?? "").trim();
  const normalizedAllowedSenderDomains = useMemo(
    () => normalizeSmtpDomains(formState.allowedSenderDomains),
    [formState.allowedSenderDomains],
  );
  const isSenderDomainLimitReached =
    normalizedAllowedSenderDomains.length >= MAX_ALLOWED_SENDER_DOMAINS;

  const translateValidationError = useCallback(
    (
      error: unknown,
      fallbackKey:
        | "smtpForm.hostFallback"
        | "smtpForm.connectionFallback"
        | "smtpForm.allowedDomainsFallback",
    ) => {
      const code = getSmtpValidationErrorCode(error);

      switch (code) {
        case "invalid_host":
          return t("smtpForm.invalidHost");
        case "invalid_allowed_domain":
          return t("smtpForm.invalidAllowedDomain");
        case "allowed_domain_limit":
          return t("smtpForm.allowedDomainLimit", { count: MAX_ALLOWED_SENDER_DOMAINS });
        case "invalid_port":
          return t("smtpForm.invalidPort");
        case "invalid_security_for_465":
          return t("smtpForm.invalidSecurityFor465");
        case "invalid_security_for_587":
          return t("smtpForm.invalidSecurityFor587");
        case "invalid_custom_port_security":
          return t("smtpForm.invalidCustomPortSecurity");
        default:
          return error instanceof Error ? error.message : t(fallbackKey);
      }
    },
    [t],
  );

  const isHostFilled = hostValue.length > 0;
  const hostError = useMemo(() => {
    if (!isHostFilled) return null;

    try {
      validateSmtpHost(hostValue);
      return null;
    } catch (error) {
      return translateValidationError(error, "smtpForm.hostFallback");
    }
  }, [hostValue, isHostFilled, translateValidationError]);

  const isCustomPort = portMode === "custom";
  const isPortValid = isCustomPort ? formState.port > 0 && formState.port <= 65535 : true;
  const connectionValidation = useMemo(() => {
    if (!isHostFilled || hostError || !isPortValid) {
      return { normalized: null, error: null };
    }

    try {
      return {
        normalized: validateSmtpConnectionInput({
          host: hostValue,
          port: formState.port,
          securityMode: formState.securityMode,
        }),
        error: null,
      };
    } catch (error) {
      return {
        normalized: null,
        error: translateValidationError(error, "smtpForm.connectionFallback"),
      };
    }
  }, [formState.port, formState.securityMode, hostError, hostValue, isHostFilled, isPortValid, translateValidationError]);

  const canSubmit =
    !disabled &&
    !isSubmitting &&
    !!initialData &&
    isHostFilled &&
    hostError === null &&
    isPortValid &&
    connectionValidation.error === null;

  const resolveAllowedSenderDomains = useCallback(() => {
    if (!senderDomainDraft.trim() || isSenderDomainLimitReached) {
      return validateAllowedSenderDomains(normalizedAllowedSenderDomains);
    }

    return validateAllowedSenderDomains([
      ...normalizedAllowedSenderDomains,
      senderDomainDraft,
    ]);
  }, [isSenderDomainLimitReached, normalizedAllowedSenderDomains, senderDomainDraft]);

  const handleAddSenderDomain = useCallback(() => {
    const trimmedDraft = normalizeSmtpDomain(senderDomainDraft);
    if (!trimmedDraft) {
      setSenderDomainDraft("");
      setSenderDomainError(null);
      return;
    }

    if (isSenderDomainLimitReached) {
      setSenderDomainDraft("");
      setSenderDomainError(t("smtpForm.allowedDomainLimit", { count: MAX_ALLOWED_SENDER_DOMAINS }));
      return;
    }

    try {
      const nextDomains = validateAllowedSenderDomains([
        ...normalizedAllowedSenderDomains,
        trimmedDraft,
      ]);
      handleChange("allowedSenderDomains", nextDomains);
      setSenderDomainDraft("");
      setSenderDomainError(null);
    } catch (error) {
      setSenderDomainError(translateValidationError(error, "smtpForm.allowedDomainsFallback"));
    }
  }, [
    handleChange,
    isSenderDomainLimitReached,
    normalizedAllowedSenderDomains,
    senderDomainDraft,
    t,
    translateValidationError,
  ]);

  const handleRemoveSenderDomain = useCallback(
    (domain: string) => {
      handleChange(
        "allowedSenderDomains",
        normalizedAllowedSenderDomains.filter((value) => value !== domain),
      );
      setSenderDomainError(null);
    },
    [handleChange, normalizedAllowedSenderDomains],
  );

  const handlePortModeChange = useCallback(
    (value: string) => {
      const nextMode = value as PortMode;
      setPortMode(nextMode);
      if (nextMode === "custom") {
        setCustomPortInput("");
        handleChange("port", 0);
        handleChange("securityMode", "NONE");
        return;
      }
      const numeric = Number(nextMode);
      handleChange("port", numeric);
      handleChange(
        "securityMode",
        nextMode === "465" ? "SMTPS" : nextMode === "587" ? "STARTTLS" : "NONE",
      );
      setCustomPortInput("");
    },
    [handleChange],
  );

  const handleCustomPortInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setCustomPortInput(value);
      const numeric = Number(value);
      handleChange("port", Number.isNaN(numeric) ? 0 : numeric);
    },
    [handleChange],
  );

  const handleSecurityPresetChange = useCallback(
    (value: SecurityPreset) => {
      const mode: FormState["securityMode"] =
        value === "SMTPS" ? "SMTPS" : value === "STARTTLS" ? "STARTTLS" : "NONE";
      handleChange("securityMode", mode);
    },
    [handleChange],
  );

  const securityPreset: SecurityPreset = useMemo(() => {
    if (formState.securityMode === "SMTPS") return "SMTPS";
    if (formState.securityMode === "STARTTLS") return "STARTTLS";
    return "SMTP";
  }, [formState.securityMode]);

  const submitForm = useCallback(async () => {
    if (!canSubmit || !initialData) {
      setSubmitError(t("common.checkInputs"));
      throw new Error(t("common.checkInputs"));
    }
    setSubmitError(null);

    const normalizedConnection = connectionValidation.normalized;
    let nextAllowedSenderDomains = normalizedAllowedSenderDomains;

    if (!normalizedConnection) {
      setSubmitError(t("common.checkInputs"));
      throw new Error(t("common.checkInputs"));
    }

    try {
      nextAllowedSenderDomains = resolveAllowedSenderDomains();
      setSenderDomainError(null);
    } catch (error) {
      const message = translateValidationError(error, "smtpForm.allowedDomainsFallback");
      setSenderDomainError(message);
      setSubmitError(message);
      throw new Error(message);
    }

    const payload: UpdateSmtpConfigPayload = {
      host: normalizedConnection.host,
      port: normalizedConnection.port,
      securityMode: normalizedConnection.securityMode,
      tlsVerify: formState.tlsVerify,
      rateLimitPerMin: formState.rateLimitPerMin,
      isActive: formState.isActive,
    };

    if (formState.name.trim()) payload.name = formState.name.trim();
    if (formState.username.trim()) payload.username = formState.username.trim();
    if (nextAllowedSenderDomains.length > 0) {
      payload.allowedSenderDomains = nextAllowedSenderDomains;
    }
    if (passwordInput.length > 0) payload.password = passwordInput;

    try {
      await onSubmit(payload);
      setPasswordInput("");
      setSenderDomainDraft("");
    } catch (error) {
      if (error instanceof Error) {
        setSubmitError(error.message);
      }
      throw error;
    }
  }, [
    canSubmit,
    connectionValidation.normalized,
    formState.isActive,
    formState.name,
    formState.rateLimitPerMin,
    formState.tlsVerify,
    formState.username,
    initialData,
    onSubmit,
    passwordInput,
    normalizedAllowedSenderDomains,
    resolveAllowedSenderDomains,
    t,
    translateValidationError,
  ]);

  useImperativeHandle(ref, () => ({
    submit: submitForm,
  }));

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      await submitForm();
    },
    [submitForm],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("smtpForm.cardTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        {!initialData ? (
          <p className="text-sm text-muted-foreground">{t("smtpForm.loading")}</p>
        ) : (
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-6 rounded-lg border bg-muted/30 p-4">
              <section className="space-y-4 rounded-lg border bg-background p-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold">{t("smtpForm.connectionTitle")}</h3>
                  <p className="text-xs text-muted-foreground">
                    {t("smtpForm.connectionDescription")}
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="smtp-config-name">{t("smtp.alias")}</Label>
                    <Input
                      id="smtp-config-name"
                      value={formState.name}
                      onChange={(event) => handleChange("name", event.target.value)}
                      placeholder={t("smtpForm.aliasPlaceholder")}
                      disabled={disabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("smtpForm.aliasDescription")}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtp-host">{t("smtp.host")}</Label>
                    <Input
                      id="smtp-host"
                      value={formState.host}
                      onChange={(event) => handleChange("host", event.target.value)}
                      placeholder="smtp.example.com"
                      disabled={disabled}
                    />
                    {hostError && <p className="text-sm text-destructive">{hostError}</p>}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("smtp.port")}</Label>
                    <Select value={portMode} onValueChange={handlePortModeChange} disabled={disabled}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("smtpForm.portPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25">25 (SMTP)</SelectItem>
                        <SelectItem value="465">465 (SMTPS)</SelectItem>
                        <SelectItem value="587">587 (STARTTLS)</SelectItem>
                        <SelectItem value="custom">{t("smtpForm.customPortOption")}</SelectItem>
                      </SelectContent>
                    </Select>
                    {isCustomPort && (
                      <Input
                        className="mt-2"
                        type="number"
                        min={1}
                        max={65535}
                        value={customPortInput}
                        onChange={handleCustomPortInputChange}
                        placeholder={t("smtpForm.customPortPlaceholder")}
                        disabled={disabled}
                      />
                    )}
                    {isCustomPort && !isPortValid && (
                      <p className="text-sm text-destructive">{t("smtpForm.invalidPort")}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>{t("smtp.securityMode")}</Label>
                    <Select
                      value={securityPreset}
                      onValueChange={(value) => handleSecurityPresetChange(value as SecurityPreset)}
                      disabled={disabled}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("smtpForm.securityPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SMTP">SMTP</SelectItem>
                        <SelectItem value="SMTPS">SMTPS</SelectItem>
                        <SelectItem value="STARTTLS">STARTTLS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {connectionValidation.error && (
                  <p className="text-sm text-destructive">{connectionValidation.error}</p>
                )}

                <div className="flex flex-col gap-2 rounded-md border px-3 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="smtp-active">{t("smtpForm.statusLabel")}</Label>
                    <p className="text-xs text-muted-foreground">{t("smtpForm.statusDescription")}</p>
                  </div>
                  <Switch
                    id="smtp-active"
                    checked={formState.isActive}
                    onCheckedChange={(checked) => handleChange("isActive", checked)}
                    disabled={disabled}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="smtp-username">{t("smtp.accountId")}</Label>
                    <Input
                      id="smtp-username"
                      value={formState.username}
                      onChange={(event) => handleChange("username", event.target.value)}
                      placeholder={t("smtpForm.optionalPlaceholder")}
                      disabled={disabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="smtp-password">{t("smtp.password")}</Label>
                    <Input
                      id="smtp-password"
                      type="password"
                      value={passwordInput}
                      onChange={(event) => setPasswordInput(event.target.value)}
                      placeholder={t("smtpForm.optionalPlaceholder")}
                      disabled={disabled}
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-4 rounded-lg border bg-background p-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold">{t("smtp.allowedDomains")}</h3>
                  <p className="text-xs text-muted-foreground">
                    {t("smtpForm.allowedDomainsDescription", { count: MAX_ALLOWED_SENDER_DOMAINS })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("smtpForm.allowedDomainsSubdescription")}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sender-domain-register">{t("smtpForm.domainInputLabel")}</Label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      className="w-full"
                      id="sender-domain-register"
                      value={senderDomainDraft}
                      onChange={(event) => {
                        setSenderDomainDraft(event.target.value);
                        if (senderDomainError) {
                          setSenderDomainError(null);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.nativeEvent.isComposing) return;
                        if (event.key === "Enter" || event.key === ",") {
                          event.preventDefault();
                          handleAddSenderDomain();
                        }
                      }}
                      placeholder={t("smtpForm.domainInputPlaceholder")}
                      disabled={disabled || isSenderDomainLimitReached}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAddSenderDomain}
                      disabled={disabled || isSenderDomainLimitReached}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {t("common.add")}
                    </Button>
                  </div>
                  {isSenderDomainLimitReached && !senderDomainError && (
                    <p className="text-sm text-muted-foreground">
                      {t("smtpForm.domainLimitReachedHint", { count: MAX_ALLOWED_SENDER_DOMAINS })}
                    </p>
                  )}
                  {senderDomainError && (
                    <p className="text-sm text-destructive">{senderDomainError}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>{t("smtpForm.registeredDomainsLabel")}</Label>
                    <span className="text-xs text-muted-foreground">
                      {normalizedAllowedSenderDomains.length}/{MAX_ALLOWED_SENDER_DOMAINS}
                    </span>
                  </div>
                  {normalizedAllowedSenderDomains.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {normalizedAllowedSenderDomains.map((domain) => (
                        <Badge key={domain} variant="secondary" className="flex items-center gap-1">
                          {domain}
                          <button
                            type="button"
                            onClick={() => handleRemoveSenderDomain(domain)}
                            className="rounded-full p-0.5 text-muted-foreground transition hover:text-destructive"
                            aria-label={t("smtpForm.removeDomainAriaLabel", { domain })}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                      {t("smtpForm.noDomains")}
                    </div>
                  )}
                </div>
              </section>
            </div>

            {submitError && (
              <Alert variant="destructive">
                <AlertTitle>{t("smtpForm.submitFailedTitle")}</AlertTitle>
                <AlertDescription>{submitError.slice(0, 400)}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={!canSubmit}>
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("common.save")}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
});
