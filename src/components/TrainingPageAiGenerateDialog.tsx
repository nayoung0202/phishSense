"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Loader2, RefreshCw, Sparkles } from "lucide-react";
import {
  TEMPLATE_AI_REFERENCE_ATTACHMENT_ACCEPT,
  templateAiToneLabels,
  templateAiToneOptions,
  validateTemplateAiReferenceAttachmentMeta,
} from "@shared/templateAi";
import {
  TRAINING_PAGE_AI_DRAFT_SESSION_KEY,
  type TrainingPageAiCandidate,
} from "@shared/trainingPageAi";
import { TemplatePreviewFrame } from "@/components/template-preview-frame";
import { cn } from "@/lib/utils";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type GenerateResponse = {
  candidates: TrainingPageAiCandidate[];
  usage?: {
    estimatedCredits: number;
  };
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type DialogStep = "options" | "candidates";

const DEFAULT_TONE: (typeof templateAiToneOptions)[number] = "informational";
const optionsDialogContentClass =
  "w-[min(94vw,840px)] max-w-[840px] max-h-[88vh] overflow-y-auto p-5";
const previewSurfaceClass =
  "site-scrollbar max-h-[320px] overflow-y-auto rounded-lg bg-slate-50 p-4 text-slate-900";
const focusedPreviewSurfaceClass =
  "site-scrollbar max-h-[70vh] overflow-y-auto rounded-lg bg-slate-50 p-4 text-slate-900";
const candidateDialogContentClass =
  "w-[min(94vw,1120px)] max-w-[1120px] h-[88vh] overflow-hidden p-5";
const focusedDialogContentClass = "max-w-5xl h-[88vh] overflow-hidden";

const getGenerateErrorMessage = (error: unknown) => {
  if (!(error instanceof Error)) {
    return "AI 훈련안내페이지 생성 중 오류가 발생했습니다.";
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

export function TrainingPageAiGenerateDialog({ open, onOpenChange }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<DialogStep>("options");
  const [tone, setTone] = useState<(typeof templateAiToneOptions)[number]>(DEFAULT_TONE);
  const [prompt, setPrompt] = useState("");
  const [candidates, setCandidates] = useState<TrainingPageAiCandidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [pairPage, setPairPage] = useState(0);
  const [focusedCandidate, setFocusedCandidate] = useState<TrainingPageAiCandidate | null>(null);
  const [referenceAttachment, setReferenceAttachment] = useState<File | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [fileInputResetKey, setFileInputResetKey] = useState(0);

  const visibleCandidates = candidates.slice(pairPage * 2, pairPage * 2 + 2);
  const maxPairPage = Math.max(0, Math.ceil(candidates.length / 2) - 1);
  const selectedCandidate =
    candidates.find((candidate) => candidate.id === selectedCandidateId) ?? null;

  const resetDialogState = () => {
    setStep("options");
    setTone(DEFAULT_TONE);
    setPrompt("");
    setCandidates([]);
    setSelectedCandidateId(null);
    setPairPage(0);
    setFocusedCandidate(null);
    setReferenceAttachment(null);
    setAttachmentError(null);
    setFileInputResetKey((prev) => prev + 1);
  };

  useEffect(() => {
    if (!open) {
      resetDialogState();
    }
  }, [open]);

  const generateMutation = useMutation({
    mutationFn: async (preservedCandidates: TrainingPageAiCandidate[]) => {
      const formData = new FormData();
      formData.set("tone", tone);
      formData.set("prompt", prompt);
      formData.set("usageContext", "standard");
      formData.set("generateCount", String(4 - preservedCandidates.length));
      formData.set(
        "preservedCandidates",
        JSON.stringify(
          preservedCandidates.map((candidate) => ({
            id: candidate.id,
            name: candidate.name,
          })),
        ),
      );

      if (referenceAttachment) {
        formData.set("referenceAttachment", referenceAttachment);
      }

      const response = await fetch("/api/training-pages/ai-generate", {
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

  const handleReferenceAttachmentChange = (files: FileList | null) => {
    const nextFile = files?.[0] ?? null;

    if (!nextFile) {
      setReferenceAttachment(null);
      setAttachmentError(null);
      return;
    }

    const validationMessage = validateTemplateAiReferenceAttachmentMeta({
      name: nextFile.name,
      mimeType: nextFile.type,
      size: nextFile.size,
    });

    if (validationMessage) {
      setReferenceAttachment(null);
      setAttachmentError(validationMessage);
      return;
    }

    setReferenceAttachment(nextFile);
    setAttachmentError(null);
  };

  const handleGenerate = () => {
    if (attachmentError) return;
    setSelectedCandidateId(null);
    setFocusedCandidate(null);
    setPairPage(0);
    generateMutation.mutate([]);
  };

  const handleBackToOptions = () => {
    setFocusedCandidate(null);
    setStep("options");
  };

  const handleReturnToCandidates = () => {
    if (candidates.length === 0) return;
    setStep("candidates");
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
      TRAINING_PAGE_AI_DRAFT_SESSION_KEY,
      JSON.stringify({
        ...selectedCandidate,
        source: "ai",
        generatedAt: new Date().toISOString(),
      }),
    );

    onOpenChange(false);
    router.push("/training-pages/new?source=ai");
  };

  const renderError = () => {
    if (!attachmentError && !generateMutation.error) return null;

    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
        {attachmentError ?? getGenerateErrorMessage(generateMutation.error)}
      </div>
    );
  };

  const renderOptionsStep = () => (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <Card className="space-y-4 p-5">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">1단계. 생성 조건 설정</h3>
          <p className="text-sm text-muted-foreground">
            문체를 선택하면 AI가 훈련안내페이지 제목과 안내 구성을 자동으로 생성합니다.
          </p>
        </div>

        <div className="space-y-2">
          <Label>문체</Label>
          <Select value={tone} onValueChange={(value) => setTone(value as typeof tone)}>
            <SelectTrigger>
              <SelectValue placeholder="문체를 선택해 주세요" />
            </SelectTrigger>
            <SelectContent>
              {templateAiToneOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {templateAiToneLabels[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="training-page-ai-prompt">추가 요청사항</Label>
          <Textarea
            id="training-page-ai-prompt"
            aria-label="추가 요청사항"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="강조하고 싶은 학습 포인트나 꼭 포함하고 싶은 안내 문구를 입력해 주세요"
            className="min-h-[140px]"
            maxLength={800}
          />
          <p className="text-xs text-muted-foreground">{prompt.length}/800자</p>
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="space-y-3 p-5">
          <div className="space-y-2">
            <Label htmlFor="training-page-ai-reference">훈련안내페이지 첨부파일</Label>
            <Input
              key={`${fileInputResetKey}-reference`}
              id="training-page-ai-reference"
              aria-label="훈련안내페이지 첨부파일"
              type="file"
              accept={TEMPLATE_AI_REFERENCE_ATTACHMENT_ACCEPT}
              onChange={(event) => handleReferenceAttachmentChange(event.target.files)}
            />
            <p className="text-xs text-muted-foreground">
              이미지(PNG/JPEG/WEBP/GIF) 또는 HTML 파일 1개를 업로드할 수 있습니다. 최대 2MB.
            </p>
            {referenceAttachment ? (
              <p className="text-xs text-slate-700">선택된 파일: {referenceAttachment.name}</p>
            ) : null}
          </div>
        </Card>

        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          피싱 대응 기본 수칙은 자동으로 포함됩니다. 메일 링크를 바로 누르지 말고 공식 사이트나
          공식 앱에 직접 접속해 확인하라는 안내가 기본 포함됩니다.
        </div>

        <div className="flex flex-col gap-2">
          <Button
            onClick={handleGenerate}
            disabled={generateMutation.isPending || Boolean(attachmentError)}
          >
            {generateMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            AI 훈련안내페이지 생성
          </Button>
          {candidates.length > 0 ? (
            <Button
              variant="outline"
              onClick={handleReturnToCandidates}
              disabled={generateMutation.isPending}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              후보 비교로 돌아가기
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
          <h3 className="text-lg font-semibold">2단계. 후보 비교 및 선택</h3>
          <p className="text-sm text-muted-foreground">
            후보 4개를 비교하고 하나를 선택해 새 훈련안내페이지 작성 화면에 반영합니다.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 overflow-x-auto pb-1">
          <Button
            variant="outline"
            onClick={handleBackToOptions}
            disabled={generateMutation.isPending}
            className="shrink-0"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            옵션 다시 설정
          </Button>
          <Button
            variant="outline"
            onClick={handleRegenerateAll}
            disabled={generateMutation.isPending}
            className="shrink-0"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            전체 재생성
          </Button>
          <Button
            variant="outline"
            onClick={handleRegenerate}
            disabled={generateMutation.isPending || !selectedCandidate}
            className="shrink-0"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            선택 제외 나머지 재생성
          </Button>
          <Button
            variant="secondary"
            onClick={handleApply}
            disabled={!selectedCandidate || generateMutation.isPending}
            className="shrink-0"
          >
            선택 후보 반영
          </Button>
        </div>
      </div>

      {renderError()}

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {candidates.length === 0 ? "후보가 없습니다." : `${pairPage + 1} / ${maxPairPage + 1}`}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPairPage((current) => Math.max(0, current - 1))}
            disabled={pairPage === 0}
          >
            이전 2개
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPairPage((current) => Math.min(maxPairPage, current + 1))}
            disabled={pairPage >= maxPairPage}
          >
            다음 2개
          </Button>
        </div>
      </div>

      {visibleCandidates.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          생성된 후보가 없습니다. 옵션을 다시 설정하고 훈련안내페이지를 생성해 주세요.
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
                    <p className="text-lg font-semibold">{candidate.name}</p>
                    <p className="text-sm text-muted-foreground">{candidate.summary}</p>
                  </div>
                  <Button
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCandidateId(candidate.id)}
                  >
                    {isSelected ? "선택됨" : "이 후보 선택"}
                  </Button>
                </div>

                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">{candidate.description}</p>
                  <div
                    className={previewSurfaceClass}
                    data-testid="training-ai-candidate-preview-surface"
                  >
                    <TemplatePreviewFrame html={candidate.content} />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setFocusedCandidate(candidate)}>
                    <Eye className="mr-2 h-4 w-4" />
                    크게 보기
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
          data-testid={
            step === "options"
              ? "training-page-ai-options-dialog"
              : "training-page-ai-candidates-dialog"
          }
        >
          <DialogHeader>
            <DialogTitle>AI 훈련안내페이지 생성</DialogTitle>
            <DialogDescription>
              {step === "options"
                ? "생성 조건을 입력하고 훈련안내페이지 후보를 생성합니다."
                : "후보를 비교하고 하나를 선택해 새 훈련안내페이지 작성 화면에 반영합니다."}
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
            <DialogTitle>{focusedCandidate?.name ?? "후보 미리보기"}</DialogTitle>
            <DialogDescription>{focusedCandidate?.summary ?? ""}</DialogDescription>
          </DialogHeader>
          {focusedCandidate ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{focusedCandidate.description}</p>
              <div className={focusedPreviewSurfaceClass}>
                <TemplatePreviewFrame html={focusedCandidate.content} />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
