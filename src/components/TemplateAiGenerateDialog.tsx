"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Loader2, RefreshCw, Sparkles } from "lucide-react";
import {
  type TemplateAiCandidate,
  TEMPLATE_AI_DRAFT_SESSION_KEY,
  TEMPLATE_AI_REFERENCE_ATTACHMENT_ACCEPT,
  templateAiDifficultyOptions,
  validateTemplateAiReferenceAttachmentMeta,
  templateAiToneOptions,
  templateAiTopicOptions,
} from "@shared/templateAi";
import { cn } from "@/lib/utils";
import { TemplatePreviewFrame } from "@/components/template-preview-frame";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/I18nProvider";

type GenerateResponse = {
  candidates: TemplateAiCandidate[];
  usage?: {
    estimatedCredits: number;
  };
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type DialogStep = "options" | "candidates";

const DEFAULT_TOPIC: (typeof templateAiTopicOptions)[number] = "shipping";
const DEFAULT_TONE: (typeof templateAiToneOptions)[number] = "informational";
const DEFAULT_DIFFICULTY: (typeof templateAiDifficultyOptions)[number] = "medium";

const previewSurfaceClass =
  "site-scrollbar max-h-[420px] overflow-y-auto rounded-lg bg-slate-50 p-4 text-slate-900";
const optionsDialogContentClass =
  "w-[min(94vw,960px)] max-w-3xl h-[min(760px,88vh)] overflow-hidden p-5";
const candidateDialogContentClass =
  "w-[min(94vw,1120px)] max-w-[1120px] h-[88vh] overflow-hidden p-5";
const candidatePreviewSurfaceClass =
  "site-scrollbar max-h-[320px] overflow-y-auto rounded-lg bg-slate-50 p-4 text-slate-900";
const focusedDialogContentClass = "max-w-5xl h-[88vh] overflow-hidden";

const getGenerateErrorMessage = (error: unknown, fallbackMessage: string) => {
  if (!(error instanceof Error)) {
    return fallbackMessage;
  }

  const matchedBody = error.message.match(/^\d{3}:\s*([\s\S]+)$/)?.[1]?.trim();
  const rawMessage = matchedBody ?? error.message;

  try {
    const parsed = JSON.parse(rawMessage) as {
      error?: string;
      message?: string;
    };

    return parsed.error ?? parsed.message ?? rawMessage;
  } catch {
    return rawMessage;
  }
};

export function TemplateAiGenerateDialog({ open, onOpenChange }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState<DialogStep>("options");
  const [topic, setTopic] = useState<(typeof templateAiTopicOptions)[number]>(DEFAULT_TOPIC);
  const [customTopic, setCustomTopic] = useState("");
  const [tone, setTone] = useState<(typeof templateAiToneOptions)[number]>(DEFAULT_TONE);
  const [difficulty, setDifficulty] =
    useState<(typeof templateAiDifficultyOptions)[number]>(DEFAULT_DIFFICULTY);
  const [prompt, setPrompt] = useState("");
  const [candidates, setCandidates] = useState<TemplateAiCandidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [pairPage, setPairPage] = useState(0);
  const [focusedCandidate, setFocusedCandidate] = useState<TemplateAiCandidate | null>(null);
  const [mailBodyReferenceAttachment, setMailBodyReferenceAttachment] = useState<File | null>(null);
  const [maliciousPageReferenceAttachment, setMaliciousPageReferenceAttachment] =
    useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [fileInputResetKey, setFileInputResetKey] = useState(0);

  const requiresCustomTopic = topic === "other";
  const canGenerate = !requiresCustomTopic || customTopic.trim().length > 0;

  const visibleCandidates = candidates.slice(pairPage * 2, pairPage * 2 + 2);
  const maxPairPage = Math.max(0, Math.ceil(candidates.length / 2) - 1);
  const selectedCandidate =
    candidates.find((candidate) => candidate.id === selectedCandidateId) ?? null;
  const topicLabels = {
    shipping: t("templateAi.topic.shipping"),
    "account-security": t("templateAi.topic.accountSecurity"),
    "payroll-benefits": t("templateAi.topic.payrollBenefits"),
    "hr-announcement": t("templateAi.topic.hrAnnouncement"),
    approval: t("templateAi.topic.approval"),
    "it-maintenance": t("templateAi.topic.itMaintenance"),
    other: t("templateAi.topic.other"),
  } as const;
  const toneLabels = {
    formal: t("templateAi.tone.formal"),
    informational: t("templateAi.tone.informational"),
    "internal-notice": t("templateAi.tone.internalNotice"),
    "urgent-request": t("templateAi.tone.urgentRequest"),
  } as const;
  const difficultyLabels = {
    easy: t("templateAi.difficulty.easy"),
    medium: t("templateAi.difficulty.medium"),
    hard: t("templateAi.difficulty.hard"),
  } as const;

  const translateAttachmentError = (message: string) => {
    if (message === "빈 파일은 업로드할 수 없습니다.") {
      return t("templateAi.emptyFile");
    }
    if (message === "첨부파일은 2MB 이하만 업로드할 수 있습니다.") {
      return t("templateAi.attachmentSizeLimit");
    }
    if (message === "이미지(PNG/JPEG/WEBP/GIF) 또는 HTML 파일만 업로드할 수 있습니다.") {
      return t("templateAi.attachmentTypeLimit");
    }
    return message;
  };

  const resetDialogState = () => {
    setStep("options");
    setTopic(DEFAULT_TOPIC);
    setCustomTopic("");
    setTone(DEFAULT_TONE);
    setDifficulty(DEFAULT_DIFFICULTY);
    setPrompt("");
    setCandidates([]);
    setSelectedCandidateId(null);
    setPairPage(0);
    setFocusedCandidate(null);
    setMailBodyReferenceAttachment(null);
    setMaliciousPageReferenceAttachment(null);
    setAttachmentError(null);
    setFileInputResetKey((prev) => prev + 1);
  };

  useEffect(() => {
    if (!open) {
      resetDialogState();
    }
  }, [open]);

  const generateMutation = useMutation({
    mutationFn: async (preservedCandidates: TemplateAiCandidate[]) => {
      const formData = new FormData();
      formData.set("topic", topic);
      formData.set("customTopic", customTopic);
      formData.set("tone", tone);
      formData.set("difficulty", difficulty);
      formData.set("prompt", prompt);
      formData.set("usageContext", "standard");
      formData.set("generateCount", String(4 - preservedCandidates.length));
      formData.set(
        "preservedCandidates",
        JSON.stringify(
          preservedCandidates.map((candidate) => ({
            id: candidate.id,
            subject: candidate.subject,
          })),
        ),
      );

      if (mailBodyReferenceAttachment) {
        formData.set("mailBodyReferenceAttachment", mailBodyReferenceAttachment);
      }

      if (maliciousPageReferenceAttachment) {
        formData.set("maliciousPageReferenceAttachment", maliciousPageReferenceAttachment);
      }

      const response = await fetch("/api/templates/ai-generate", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const text = (await response.text()) || response.statusText;
        throw new Error(`${response.status}: ${text}`);
      }

      return (await response.json()) as GenerateResponse;
    },
    onSuccess: (response, preservedCandidates) => {
      const nextCandidates = [...preservedCandidates, ...response.candidates];
      setCandidates(nextCandidates);
      setSelectedCandidateId(preservedCandidates[0]?.id ?? null);
      setPairPage(0);
      setStep("candidates");
      setFocusedCandidate(null);
    },
  });

  const handleReferenceAttachmentChange = (
    kind: "mail" | "malicious",
    files: FileList | null,
  ) => {
    const nextFile = files?.[0] ?? null;
    const setter =
      kind === "mail" ? setMailBodyReferenceAttachment : setMaliciousPageReferenceAttachment;

    if (!nextFile) {
      setter(null);
      setAttachmentError(null);
      return;
    }

    const validationMessage = validateTemplateAiReferenceAttachmentMeta({
      name: nextFile.name,
      mimeType: nextFile.type,
      size: nextFile.size,
    });

    if (validationMessage) {
      setter(null);
      setAttachmentError(translateAttachmentError(validationMessage));
      return;
    }

    setter(nextFile);
    setAttachmentError(null);
  };

  const handleGenerate = () => {
    if (!canGenerate || attachmentError) return;
    setSelectedCandidateId(null);
    setFocusedCandidate(null);
    setPairPage(0);
    generateMutation.mutate([]);
  };

  const handleReturnToCandidates = () => {
    if (candidates.length === 0) return;
    setStep("candidates");
  };

  const handleBackToOptions = () => {
    setFocusedCandidate(null);
    setStep("options");
  };

  const handleRegenerateAll = () => {
    setSelectedCandidateId(null);
    setFocusedCandidate(null);
    generateMutation.mutate([]);
  };

  const handleRegenerate = () => {
    if (!selectedCandidate) return;
    setFocusedCandidate(null);
    generateMutation.mutate([selectedCandidate]);
  };

  const handleApply = () => {
    if (!selectedCandidate) return;

    sessionStorage.setItem(
      TEMPLATE_AI_DRAFT_SESSION_KEY,
      JSON.stringify({
        ...selectedCandidate,
        source: "ai",
        generatedAt: new Date().toISOString(),
      }),
    );

    onOpenChange(false);
    router.push("/templates/new?source=ai");
  };

  const renderError = () => {
    if (!attachmentError && !generateMutation.error) return null;

    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
        {attachmentError ?? getGenerateErrorMessage(generateMutation.error, t("templateAi.generateErrorFallback"))}
      </div>
    );
  };

  const renderReferenceAttachmentField = (args: {
    id: string;
    label: string;
    selectedFile: File | null;
    onChange: (files: FileList | null) => void;
  }) => (
    <div className="space-y-2">
      <Label htmlFor={args.id}>{args.label}</Label>
      <Input
        key={`${fileInputResetKey}-${args.id}`}
        id={args.id}
        aria-label={args.label}
        type="file"
        accept={TEMPLATE_AI_REFERENCE_ATTACHMENT_ACCEPT}
        onChange={(event) => args.onChange(event.target.files)}
      />
      <p className="text-xs text-muted-foreground">
        {t("templateAi.attachmentHelp")}
      </p>
      {args.selectedFile ? (
        <p className="text-xs text-slate-700">{t("templateAi.selectedFile", { file: args.selectedFile.name })}</p>
      ) : null}
    </div>
  );

  const renderOptionsStep = () => (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <Card className="space-y-4 p-5">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">{t("templateAi.optionsStepTitle")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("templateAi.optionsStepDescription")}
          </p>
        </div>

        <div className="space-y-2">
          <Label>{t("templateAi.topicLabel")}</Label>
          <Select value={topic} onValueChange={(value) => setTopic(value as typeof topic)}>
            <SelectTrigger>
              <SelectValue placeholder={t("templateAi.topicPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {templateAiTopicOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {topicLabels[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {requiresCustomTopic ? (
          <div className="space-y-2">
            <Label htmlFor="template-ai-custom-topic">{t("templateAi.customTopicLabel")}</Label>
            <Input
              id="template-ai-custom-topic"
              aria-label={t("templateAi.customTopicLabel")}
              value={customTopic}
              onChange={(event) => setCustomTopic(event.target.value)}
              placeholder={t("templateAi.customTopicPlaceholder")}
              maxLength={60}
            />
            <p className="text-xs text-muted-foreground">
              {t("templateAi.customTopicDescription")}
            </p>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label>{t("templateAi.toneLabel")}</Label>
          <Select value={tone} onValueChange={(value) => setTone(value as typeof tone)}>
            <SelectTrigger>
              <SelectValue placeholder={t("templateAi.tonePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {templateAiToneOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {toneLabels[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t("templateAi.difficultyLabel")}</Label>
          <Select
            value={difficulty}
            onValueChange={(value) => setDifficulty(value as typeof difficulty)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("templateAi.difficultyPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {templateAiDifficultyOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {difficultyLabels[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t("templateAi.additionalRequestLabel")}</Label>
          <Textarea
            aria-label={t("templateAi.additionalRequestLabel")}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={t("templateAi.additionalRequestPlaceholder")}
            className="min-h-[180px]"
            maxLength={800}
          />
          <p className="text-xs text-muted-foreground">{prompt.length}/800</p>
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="space-y-3 p-5">
          {renderReferenceAttachmentField({
            id: "template-ai-mail-body-reference",
            label: t("templateAi.mailBodyAttachmentLabel"),
            selectedFile: mailBodyReferenceAttachment,
            onChange: (files) => handleReferenceAttachmentChange("mail", files),
          })}
          {renderReferenceAttachmentField({
            id: "template-ai-malicious-reference",
            label: t("templateAi.maliciousBodyAttachmentLabel"),
            selectedFile: maliciousPageReferenceAttachment,
            onChange: (files) => handleReferenceAttachmentChange("malicious", files),
          })}
        </Card>

        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          {t("templateAi.draftNotice")}
        </div>

        <div className="flex flex-col gap-2">
          <Button
            onClick={handleGenerate}
            disabled={generateMutation.isPending || !canGenerate || Boolean(attachmentError)}
          >
            {generateMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {t("templateAi.generateButton")}
          </Button>
          {requiresCustomTopic && !canGenerate ? (
            <p className="text-xs text-destructive">{t("templateAi.customTopicRequired")}</p>
          ) : null}
          {candidates.length > 0 ? (
            <Button
              variant="outline"
              onClick={handleReturnToCandidates}
              disabled={generateMutation.isPending}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("templateAi.backToCandidates")}
            </Button>
          ) : null}
        </div>

        {renderError()}
      </div>
    </div>
  );

  const renderCandidatesStep = () => (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-1">
          <h3 className="text-lg font-semibold">{t("templateAi.candidatesStepTitle")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("templateAi.candidatesStepDescription")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handleBackToOptions} disabled={generateMutation.isPending}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("templateAi.backToOptions")}
          </Button>
          <Button
            variant="outline"
            onClick={handleRegenerateAll}
            disabled={generateMutation.isPending}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("templateAi.regenerateAll")}
          </Button>
          <Button
            variant="outline"
            onClick={handleRegenerate}
            disabled={generateMutation.isPending || !selectedCandidate}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("templateAi.regenerateExceptSelected")}
          </Button>
          <Button
            variant="secondary"
            onClick={handleApply}
            disabled={!selectedCandidate || generateMutation.isPending}
          >
            {t("templateAi.applySelected")}
          </Button>
        </div>
      </div>

      {renderError()}

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {candidates.length === 0 ? t("templateAi.noCandidates") : `${pairPage + 1} / ${maxPairPage + 1}`}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPairPage((current) => Math.max(0, current - 1))}
            disabled={pairPage === 0}
          >
            {t("templateAi.previousTwo")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPairPage((current) => Math.min(maxPairPage, current + 1))}
            disabled={pairPage >= maxPairPage}
          >
            {t("templateAi.nextTwo")}
          </Button>
        </div>
      </div>

      {visibleCandidates.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {t("templateAi.noGeneratedCandidates")}
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visibleCandidates.map((candidate) => {
            const isSelected = candidate.id === selectedCandidateId;

            return (
              <Card
                key={candidate.id}
                className={cn("space-y-4 p-4", isSelected && "ring-2 ring-primary")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">{candidate.subject}</p>
                    <p className="text-sm text-muted-foreground">{candidate.summary}</p>
                  </div>
                  <Button
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCandidateId(candidate.id)}
                  >
                    {isSelected ? t("templateAi.selected") : t("templateAi.selectCandidate")}
                  </Button>
                </div>

                <Tabs defaultValue="body" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="body">{t("templateAi.mailBodyTab")}</TabsTrigger>
                    <TabsTrigger value="malicious">{t("templateAi.maliciousBodyTab")}</TabsTrigger>
                  </TabsList>
                  <TabsContent value="body" className="space-y-3">
                    <div
                      className={candidatePreviewSurfaceClass}
                      data-testid="template-ai-candidate-preview-surface"
                    >
                      <TemplatePreviewFrame html={candidate.body} />
                    </div>
                  </TabsContent>
                  <TabsContent value="malicious" className="space-y-3">
                    <div
                      className={candidatePreviewSurfaceClass}
                      data-testid="template-ai-candidate-preview-surface"
                    >
                      <TemplatePreviewFrame html={candidate.maliciousPageContent} />
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setFocusedCandidate(candidate)}>
                    <Eye className="mr-2 h-4 w-4" />
                    {t("templateAi.zoomPreview")}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={step === "options" ? optionsDialogContentClass : candidateDialogContentClass}
          data-testid={step === "options" ? "template-ai-options-dialog" : "template-ai-candidates-dialog"}
        >
          <DialogHeader>
            <DialogTitle>{t("templateAi.dialogTitle")}</DialogTitle>
            <DialogDescription>
              {step === "options"
                ? t("templateAi.dialogDescriptionOptions")
                : t("templateAi.dialogDescriptionCandidates")}
            </DialogDescription>
          </DialogHeader>

          {step === "options" ? renderOptionsStep() : renderCandidatesStep()}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(focusedCandidate)}
        onOpenChange={(nextOpen) => !nextOpen && setFocusedCandidate(null)}
      >
        <DialogContent className={focusedDialogContentClass}>
          <DialogHeader>
            <DialogTitle>{focusedCandidate?.subject ?? t("templateAi.previewTitle")}</DialogTitle>
            <DialogDescription>{focusedCandidate?.summary ?? ""}</DialogDescription>
          </DialogHeader>
          {focusedCandidate ? (
            <Tabs defaultValue="body" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="body">{t("templateAi.mailBodyTab")}</TabsTrigger>
                <TabsTrigger value="malicious">{t("templateAi.maliciousBodyTab")}</TabsTrigger>
              </TabsList>
              <TabsContent value="body">
                <div className={cn(previewSurfaceClass, "max-h-[70vh]")}>
                  <TemplatePreviewFrame html={focusedCandidate.body} />
                </div>
              </TabsContent>
              <TabsContent value="malicious">
                <div className={cn(previewSurfaceClass, "max-h-[70vh]")}>
                  <TemplatePreviewFrame html={focusedCandidate.maliciousPageContent} />
                </div>
              </TabsContent>
            </Tabs>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
