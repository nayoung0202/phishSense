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
  normalizeSmtpDomain,
  normalizeSmtpDomains,
  validateAllowedSenderDomains,
  validateSmtpConnectionInput,
  validateSmtpHost,
} from "@/lib/smtpValidation";
import type { SmtpConfigResponse, UpdateSmtpConfigPayload } from "@/types/smtp";

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

  const isHostFilled = hostValue.length > 0;
  const hostError = useMemo(() => {
    if (!isHostFilled) return null;

    try {
      validateSmtpHost(hostValue);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "SMTP 호스트를 확인하세요.";
    }
  }, [hostValue, isHostFilled]);

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
        error: error instanceof Error ? error.message : "SMTP 연결 정보를 확인하세요.",
      };
    }
  }, [formState.port, formState.securityMode, hostError, hostValue, isHostFilled, isPortValid]);

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
      setSenderDomainError(
        `허용 발신 도메인은 최대 ${MAX_ALLOWED_SENDER_DOMAINS}개까지 등록할 수 있습니다.`,
      );
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
      setSenderDomainError(
        error instanceof Error ? error.message : "허용 발신 도메인을 확인하세요.",
      );
    }
  }, [
    handleChange,
    isSenderDomainLimitReached,
    normalizedAllowedSenderDomains,
    senderDomainDraft,
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
      setSubmitError("입력값을 확인하세요.");
      throw new Error("입력값을 확인하세요.");
    }
    setSubmitError(null);

    const normalizedConnection = connectionValidation.normalized;
    let nextAllowedSenderDomains = normalizedAllowedSenderDomains;

    if (!normalizedConnection) {
      setSubmitError("입력값을 확인하세요.");
      throw new Error("입력값을 확인하세요.");
    }

    try {
      nextAllowedSenderDomains = resolveAllowedSenderDomains();
      setSenderDomainError(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "허용 발신 도메인을 확인하세요.";
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
        <CardTitle>발송 설정</CardTitle>
      </CardHeader>
      <CardContent>
        {!initialData ? (
          <p className="text-sm text-muted-foreground">발송 설정을 불러오고 있습니다. 잠시만 기다려주세요.</p>
        ) : (
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-6 rounded-lg border bg-muted/30 p-4">
              <section className="space-y-4 rounded-lg border bg-background p-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold">SMTP 연결 정보</h3>
                  <p className="text-xs text-muted-foreground">
                    메일 전송에 사용할 SMTP 서버 연결 값을 입력합니다.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="smtp-config-name">설정 별칭</Label>
                    <Input
                      id="smtp-config-name"
                      value={formState.name}
                      onChange={(event) => handleChange("name", event.target.value)}
                      placeholder="예: 보안훈련 기본 발송"
                      disabled={disabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      프로젝트 생성 화면에서 발송 설정을 구분하는 표시 이름입니다.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtp-host">SMTP 호스트</Label>
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
                    <Label>포트</Label>
                    <Select value={portMode} onValueChange={handlePortModeChange} disabled={disabled}>
                      <SelectTrigger>
                        <SelectValue placeholder="포트를 선택하세요" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25">25 (SMTP)</SelectItem>
                        <SelectItem value="465">465 (SMTPS)</SelectItem>
                        <SelectItem value="587">587 (STARTTLS)</SelectItem>
                        <SelectItem value="custom">직접 입력</SelectItem>
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
                        placeholder="포트를 입력하세요"
                        disabled={disabled}
                      />
                    )}
                    {isCustomPort && !isPortValid && (
                      <p className="text-sm text-destructive">1~65535 범위의 포트를 입력하세요.</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>보안 모드</Label>
                    <Select
                      value={securityPreset}
                      onValueChange={(value) => handleSecurityPresetChange(value as SecurityPreset)}
                      disabled={disabled}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="보안 방식을 선택" />
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
                    <Label htmlFor="smtp-active">SMTP 상태</Label>
                    <p className="text-xs text-muted-foreground">비활성화 시 발송 및 테스트가 제한됩니다.</p>
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
                    <Label htmlFor="smtp-username">계정 아이디</Label>
                    <Input
                      id="smtp-username"
                      value={formState.username}
                      onChange={(event) => handleChange("username", event.target.value)}
                      placeholder="선택 입력"
                      disabled={disabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="smtp-password">비밀번호</Label>
                    <Input
                      id="smtp-password"
                      type="password"
                      value={passwordInput}
                      onChange={(event) => setPasswordInput(event.target.value)}
                      placeholder="선택 입력"
                      disabled={disabled}
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-4 rounded-lg border bg-background p-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold">허용 발신 도메인</h3>
                  <p className="text-xs text-muted-foreground">
                    프로젝트 발신 이메일과 SMTP 테스트 발신 이메일이 사용할 수 있는 도메인을 관리합니다. 최대 {MAX_ALLOWED_SENDER_DOMAINS}개까지 등록할 수 있습니다.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    등록한 도메인은 하위 도메인까지 허용합니다. 예: example.com 등록 시 user@sub.example.com도 사용할 수 있습니다.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sender-domain-register">도메인 입력</Label>
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
                      placeholder="example.com 입력 후 Enter"
                      disabled={disabled || isSenderDomainLimitReached}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAddSenderDomain}
                      disabled={disabled || isSenderDomainLimitReached}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      추가
                    </Button>
                  </div>
                  {isSenderDomainLimitReached && !senderDomainError && (
                    <p className="text-sm text-muted-foreground">
                      최대 {MAX_ALLOWED_SENDER_DOMAINS}개까지 등록되었습니다. 새 도메인을 추가하려면 기존 도메인을 삭제하세요.
                    </p>
                  )}
                  {senderDomainError && (
                    <p className="text-sm text-destructive">{senderDomainError}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>등록된 도메인</Label>
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
                            aria-label={`${domain} 도메인 제거`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                      아직 등록된 허용 발신 도메인이 없습니다. 비워 두면 발신 도메인을 제한하지 않습니다.
                    </div>
                  )}
                </div>
              </section>
            </div>

            {submitError && (
              <Alert variant="destructive">
                <AlertTitle>저장 실패</AlertTitle>
                <AlertDescription>{submitError.slice(0, 400)}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={!canSubmit}>
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "저장"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
});
