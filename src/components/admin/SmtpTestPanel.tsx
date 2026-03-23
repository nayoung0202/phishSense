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
      return "허용 발신 도메인 제한 없음";
    }
    return `허용 발신 도메인(하위 도메인 포함): ${allowedSenderDomains.join(", ")}`;
  }, [allowedSenderDomains]);

  const badge = useMemo(() => {
    if (lastTestStatus === "success") {
      return <Badge className="gap-1 bg-emerald-100 text-emerald-700"><MailCheck className="w-4 h-4" />성공</Badge>;
    }
    if (lastTestStatus === "failure") {
      return <Badge className="gap-1 bg-red-100 text-red-700"><MailWarning className="w-4 h-4" />실패</Badge>;
    }
    return <Badge variant="outline">미실행</Badge>;
  }, [lastTestStatus]);

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
        <CardTitle>SMTP 테스트 발송</CardTitle>
        <CardDescription>발신 이메일과 수신 이메일을 직접 넣어 연결 상태와 템플릿 렌더링을 확인합니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="smtp-test-sender-email">테스트 발신 이메일 *</Label>
            <Input
              id="smtp-test-sender-email"
              type="email"
              value={sender}
              onChange={(event) => setSender(event.target.value)}
              placeholder="sender@example.com"
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">{senderDomainHint}</p>
            {!isSenderValid && sender && <p className="text-sm text-destructive">올바른 발신 이메일을 입력하세요.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="smtp-test-recipient-email">테스트 수신 이메일 *</Label>
            <Input
              id="smtp-test-recipient-email"
              type="email"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="user@example.com"
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              실제로 수신 가능한 이메일 주소를 입력하세요. (예: user@example.com)
            </p>
            {!isRecipientValid && recipient && <p className="text-sm text-destructive">올바른 수신 이메일을 입력하세요.</p>}
            {disabledReason && (
              <p className="text-xs text-amber-600 mt-1">{disabledReason}</p>
            )}
          </div>
          {visibleError && (
            <Alert variant="destructive">
              <AlertTitle>테스트 실패</AlertTitle>
              <AlertDescription>{visibleError.slice(0, 400)}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex-1 rounded-md border p-3 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">최근 테스트 상태</span>
                <span className="flex items-center gap-2">{badge}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">최근 실행 시각</span>
                <span>{formattedDate}</span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">최근 오류 메시지</p>
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
                {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : "테스트 발송"}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
