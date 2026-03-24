import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, MailCheck, MailWarning } from "lucide-react";
import type { SmtpConfigResponse, TestSmtpConfigPayload } from "@/types/smtp";
import { useI18n } from "@/components/I18nProvider";

const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Props = {
  onSubmit: (payload: TestSmtpConfigPayload) => Promise<void> | void;
  isTesting?: boolean;
  disabled?: boolean;
  allowedSenderDomains?: string[] | null;
  lastTestedAt?: SmtpConfigResponse["lastTestedAt"];
  lastTestStatus?: SmtpConfigResponse["lastTestStatus"];
  lastTestError?: SmtpConfigResponse["lastTestError"];
  disabledReason?: string;
  testSubject?: string;
  testBody?: string;
};

export function SmtpTestPanel({
  onSubmit,
  isTesting,
  disabled,
  allowedSenderDomains,
  lastTestedAt,
  lastTestStatus,
  lastTestError,
  disabledReason,
  testSubject,
  testBody,
}: Props) {
  const { t } = useI18n();
  const [sender, setSender] = useState("");
  const [recipient, setRecipient] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const senderValue = sender.trim();
  const recipientValue = recipient.trim();
  const isSenderValid = emailRegex.test(senderValue);
  const isRecipientValid = emailRegex.test(recipientValue);
  const subjectValue = typeof testSubject === "string" ? testSubject.trim() : "";
  const bodyValue = typeof testBody === "string" ? testBody.trim() : "";
  const hasCustomMessage = subjectValue.length > 0 || bodyValue.length > 0;
  const isMessageValid = !hasCustomMessage || (subjectValue.length > 0 && bodyValue.length > 0);

  const senderDomainHint = useMemo(() => {
    if (!allowedSenderDomains || allowedSenderDomains.length === 0) {
      return t("smtpTest.noDomainRestriction");
    }
    return t("smtpTest.allowedDomainsHint", {
      domains: allowedSenderDomains.join(", "),
    });
  }, [allowedSenderDomains, t]);

  const badge = useMemo(() => {
    if (lastTestStatus === "success") {
      return <Badge className="gap-1 bg-emerald-100 text-emerald-700"><MailCheck className="w-4 h-4" />{t("smtp.testSuccess")}</Badge>;
    }
    if (lastTestStatus === "failure") {
      return <Badge className="gap-1 bg-red-100 text-red-700"><MailWarning className="w-4 h-4" />{t("smtp.testFailure")}</Badge>;
    }
    return <Badge variant="outline">{t("smtp.notRun")}</Badge>;
  }, [lastTestStatus, t]);

  const formattedDate = lastTestedAt ? format(new Date(lastTestedAt), "yyyy-MM-dd HH:mm:ss") : "-";
  const visibleError =
    errorMessage ?? (lastTestStatus === "failure" ? lastTestError ?? null : null);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (disabled || !isSenderValid || !isRecipientValid || !isMessageValid) return;
      setErrorMessage(null);
      try {
        const payload: TestSmtpConfigPayload = {
          testSenderEmail: senderValue,
          testRecipientEmail: recipientValue,
        };
        if (subjectValue.length > 0) {
          payload.testSubject = subjectValue;
        }
        if (bodyValue.length > 0) {
          payload.testBody = bodyValue;
        }
        await onSubmit(payload);
      } catch (error) {
        if (error instanceof Error) {
          setErrorMessage(error.message);
        }
      }
    },
    [
      bodyValue,
      disabled,
      isMessageValid,
      isRecipientValid,
      isSenderValid,
      onSubmit,
      recipientValue,
      senderValue,
      subjectValue,
    ],
  );

  useEffect(() => {
    if (disabled) {
      setErrorMessage(null);
    }
  }, [disabled]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("smtpTest.title")}</CardTitle>
        <CardDescription>{t("smtpTest.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="smtp-test-sender-email">{t("smtpTest.senderLabel")}</Label>
            <Input
              id="smtp-test-sender-email"
              type="email"
              value={sender}
              onChange={(event) => setSender(event.target.value)}
              placeholder="sender@example.com"
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">{senderDomainHint}</p>
            {!isSenderValid && sender && <p className="text-sm text-destructive">{t("smtpTest.senderInvalid")}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="smtp-test-recipient-email">{t("smtpTest.recipientLabel")}</Label>
            <Input
              id="smtp-test-recipient-email"
              type="email"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="user@example.com"
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              {t("smtpTest.recipientHint")}
            </p>
            {!isRecipientValid && recipient && <p className="text-sm text-destructive">{t("smtpTest.recipientInvalid")}</p>}
            {disabledReason && (
              <p className="text-xs text-amber-600 mt-1">{disabledReason}</p>
            )}
          </div>
          {visibleError && (
            <Alert variant="destructive">
              <AlertTitle>{t("smtpTest.failureTitle")}</AlertTitle>
              <AlertDescription>{visibleError.slice(0, 400)}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex-1 rounded-md border p-3 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("smtpTest.lastStatus")}</span>
                <span className="flex items-center gap-2">{badge}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("smtpTest.lastRunAt")}</span>
                <span>{formattedDate}</span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("smtpTest.lastError")}</p>
                <p className="text-sm whitespace-pre-wrap break-words">
                  {visibleError ? visibleError.slice(0, 400) : "-"}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <Button
                type="submit"
                disabled={disabled || !isSenderValid || !isRecipientValid || !isMessageValid || !!isTesting}
              >
                {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("smtpTest.send")}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
