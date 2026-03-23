"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Mail, Send, CheckCircle2, RefreshCw, ArrowLeft } from "lucide-react";
import type { Template, TrainingPage, Target, Project } from "@shared/schema";
import {
  type TemplateAiCandidate,
  type TemplateAiGenerateResponse,
  templateAiDifficultyLabels,
  templateAiDifficultyOptions,
  templateAiToneLabels,
  templateAiToneOptions,
  templateAiTopicLabels,
  templateAiTopicOptions,
} from "@shared/templateAi";
import {
  type TrainingPageAiCandidate,
  type TrainingPageAiGenerateResponse,
} from "@shared/trainingPageAi";
import { buildMailHtml } from "@shared/templateMail";
import type { SmtpConfigSummary } from "@/types/smtp";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { TemplatePreviewFrame } from "@/components/template-preview-frame";
import { useToast } from "@/hooks/use-toast";

type SessionResponse = {
  authenticated: boolean;
  user?: {
    email?: string | null;
    name?: string | null;
  };
};

type ApiError = Error & {
  status?: number;
  payload?: unknown;
};

const previewLandingUrl = "/example-domain?type=landing";
const previewOpenPixelUrl = "https://example.com/o/preview";
const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const resolveExperienceSmtp = (smtpConfigs: SmtpConfigSummary[]) =>
  smtpConfigs
    .filter((config) => config.isActive && config.hasPassword)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0] ?? null;

const buildExperienceProjectName = (subject: string) => {
  const trimmed = subject.trim();
  if (!trimmed) return "첫 체험 프로젝트";
  return `첫 체험 - ${trimmed.slice(0, 40)}`;
};

const focusStepCard = (element: HTMLDivElement | null) => {
  if (!element) return;

  element.scrollIntoView({ behavior: "smooth", block: "start" });
  window.requestAnimationFrame(() => {
    element.focus({ preventScroll: true });
  });
};

const parseErrorMessage = (error: unknown, fallback: string) => {
  if (!error || typeof error !== "object") {
    return fallback;
  }

  const typed = error as ApiError;
  const payload = typed.payload as
    | {
        reason?: string;
        message?: string;
        error?: string;
        issues?: Array<{ message?: string }>;
      }
    | undefined;

  if (Array.isArray(payload?.issues) && payload.issues.length > 0) {
    return payload.issues.map((issue) => issue.message).filter(Boolean).join(", ");
  }

  return payload?.reason || payload?.message || payload?.error || typed.message || fallback;
};

async function requestJson<TResponse>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<TResponse> {
  const response = await fetch(input, {
    ...init,
    credentials: "include",
    headers: init?.body
      ? {
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        }
      : init?.headers,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(response.statusText) as ApiError;
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload as TResponse;
}

export default function ProjectExperienceWizard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [templateTopic, setTemplateTopic] =
    useState<(typeof templateAiTopicOptions)[number]>("shipping");
  const [templateCustomTopic, setTemplateCustomTopic] = useState("");
  const [templateTone, setTemplateTone] =
    useState<(typeof templateAiToneOptions)[number]>("urgent-request");
  const [templateDifficulty, setTemplateDifficulty] =
    useState<(typeof templateAiDifficultyOptions)[number]>("medium");
  const [templatePrompt, setTemplatePrompt] = useState("");
  const [templateCandidates, setTemplateCandidates] = useState<TemplateAiCandidate[]>([]);
  const [selectedTemplateCandidateId, setSelectedTemplateCandidateId] = useState<string | null>(null);
  const [savedTemplate, setSavedTemplate] = useState<Template | null>(null);

  const [trainingTone, setTrainingTone] =
    useState<(typeof templateAiToneOptions)[number]>("informational");
  const [trainingPrompt, setTrainingPrompt] = useState("");
  const [trainingCandidates, setTrainingCandidates] = useState<TrainingPageAiCandidate[]>([]);
  const [selectedTrainingCandidateId, setSelectedTrainingCandidateId] = useState<string | null>(null);
  const [savedTrainingPage, setSavedTrainingPage] = useState<TrainingPage | null>(null);
  const templateStepRef = useRef<HTMLDivElement | null>(null);
  const trainingStepRef = useRef<HTMLDivElement | null>(null);
  const smtpStepRef = useRef<HTMLDivElement | null>(null);
  const deliveryStepRef = useRef<HTMLDivElement | null>(null);

  const sessionQuery = useQuery<SessionResponse>({
    queryKey: ["/api/auth/session"],
    queryFn: () => requestJson<SessionResponse>("/api/auth/session"),
  });

  const smtpQuery = useQuery<SmtpConfigSummary[]>({
    queryKey: ["smtp-configs"],
    queryFn: () => requestJson<SmtpConfigSummary[]>("/api/admin/smtp-configs"),
  });

  const activeSmtpConfig = useMemo(
    () => resolveExperienceSmtp(smtpQuery.data ?? []),
    [smtpQuery.data],
  );

  const [recipientEmail, setRecipientEmail] = useState<string | null>(null);
  const [senderEmail, setSenderEmail] = useState<string | null>(null);

  const sessionEmail = sessionQuery.data?.user?.email?.trim() ?? "";
  const sessionName = sessionQuery.data?.user?.name?.trim() ?? "";
  const currentRecipient = recipientEmail ?? sessionEmail;
  const currentSender = senderEmail ?? sessionEmail;

  const selectedTemplateCandidate =
    templateCandidates.find((candidate) => candidate.id === selectedTemplateCandidateId) ?? null;
  const selectedTrainingCandidate =
    trainingCandidates.find((candidate) => candidate.id === selectedTrainingCandidateId) ?? null;

  const templateGenerateMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        topic: templateTopic,
        customTopic: templateCustomTopic,
        tone: templateTone,
        difficulty: templateDifficulty,
        prompt: templatePrompt,
        generateCount: 4,
        preservedCandidates: [],
      };
      return requestJson<TemplateAiGenerateResponse>("/api/templates/ai-generate", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (result) => {
      setTemplateCandidates(result.candidates);
      setSelectedTemplateCandidateId(result.candidates[0]?.id ?? null);
    },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplateCandidate) {
        throw new Error("저장할 템플릿 후보를 먼저 선택하세요.");
      }

      const payload = {
        name: selectedTemplateCandidate.subject,
        subject: selectedTemplateCandidate.subject,
        body: selectedTemplateCandidate.body,
        maliciousPageContent: selectedTemplateCandidate.maliciousPageContent,
        autoInsertLandingEnabled: true,
        autoInsertLandingLabel: "문서 확인하기",
        autoInsertLandingKind: "link",
        autoInsertLandingNewTab: true,
      };

      return requestJson<Template>("/api/templates", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (template) => {
      setSavedTemplate(template);
      void queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({
        title: "템플릿 저장 완료",
        description: "체험용 메일 템플릿을 저장했습니다.",
      });
      window.requestAnimationFrame(() => {
        focusStepCard(trainingStepRef.current);
      });
    },
    onError: (error) => {
      toast({
        title: "템플릿 저장 실패",
        description: parseErrorMessage(error, "템플릿 저장에 실패했습니다."),
        variant: "destructive",
      });
    },
  });

  const trainingGenerateMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        tone: trainingTone,
        prompt: trainingPrompt,
        generateCount: 4,
        preservedCandidates: [],
      };
      return requestJson<TrainingPageAiGenerateResponse>("/api/training-pages/ai-generate", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (result) => {
      setTrainingCandidates(result.candidates);
      setSelectedTrainingCandidateId(result.candidates[0]?.id ?? null);
    },
  });

  const saveTrainingPageMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTrainingCandidate) {
        throw new Error("저장할 훈련 안내 페이지 후보를 먼저 선택하세요.");
      }

      const payload = {
        name: selectedTrainingCandidate.name,
        description: selectedTrainingCandidate.description,
        content: selectedTrainingCandidate.content,
        status: "active",
      };

      return requestJson<TrainingPage>("/api/training-pages", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (trainingPage) => {
      setSavedTrainingPage(trainingPage);
      void queryClient.invalidateQueries({ queryKey: ["/api/training-pages"] });
      toast({
        title: "훈련 안내 페이지 저장 완료",
        description: "체험용 훈련 안내 페이지를 저장했습니다.",
      });
      window.requestAnimationFrame(() => {
        focusStepCard(activeSmtpConfig ? deliveryStepRef.current : smtpStepRef.current);
      });
    },
    onError: (error) => {
      toast({
        title: "훈련 안내 페이지 저장 실패",
        description: parseErrorMessage(error, "훈련 안내 페이지 저장에 실패했습니다."),
        variant: "destructive",
      });
    },
  });

  const launchExperienceMutation = useMutation({
    mutationFn: async () => {
      if (!savedTemplate || !savedTrainingPage) {
        throw new Error("템플릿과 훈련 안내 페이지를 먼저 저장하세요.");
      }
      if (!activeSmtpConfig) {
        throw new Error("실제 발송을 위해 발송 설정이 필요합니다.");
      }

      const trimmedRecipient = currentRecipient.trim();
      if (!trimmedRecipient) {
        throw new Error("수신 이메일을 입력하세요.");
      }
      if (!emailRegex.test(trimmedRecipient)) {
        throw new Error("수신 이메일 형식을 확인하세요.");
      }

      const trimmedSender = currentSender.trim();
      if (!trimmedSender) {
        throw new Error("발신 이메일을 입력하세요.");
      }
      if (!emailRegex.test(trimmedSender)) {
        throw new Error("발신 이메일 형식을 확인하세요.");
      }

      const targets = await requestJson<Target[]>("/api/targets");
      let target = targets.find((item) => item.email.trim().toLowerCase() === trimmedRecipient.toLowerCase());

      if (!target) {
        target = await requestJson<Target>("/api/targets", {
          method: "POST",
          body: JSON.stringify({
            name: sessionName || trimmedRecipient.split("@")[0] || "체험 사용자",
            email: trimmedRecipient,
            department: "",
            tags: ["experience"],
            status: "active",
          }),
        });
      }



      const now = new Date();
      const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const project = await requestJson<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: buildExperienceProjectName(savedTemplate.subject),
          description: "AI 생성부터 실제 메일 체험까지 확인하는 1인 체험 프로젝트",
          department: "",
          departmentTags: [],
          templateId: savedTemplate.id,
          trainingPageId: savedTrainingPage.id,
          smtpAccountId: activeSmtpConfig.id,
          fromName: sessionName || "PhishSense",
          fromEmail: trimmedSender,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          notificationEmails: [trimmedRecipient],
          startDate: now.toISOString(),
          endDate: end.toISOString(),
          status: "진행중",
          targetIds: [target.id],
        }),
      });

      return project;
    },
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "체험 프로젝트 발송 시작",
        description: "메일 발송을 시작했습니다. 프로젝트 상세에서 이벤트를 확인하세요.",
      });
      router.push(`/projects/${project.id}`);
    },
    onError: (error) => {
      toast({
        title: "체험 발송 실패",
        description: parseErrorMessage(error, "체험 프로젝트 발송에 실패했습니다."),
        variant: "destructive",
      });
    },
  });

  const canGenerateTemplate = templateTopic !== "other" || templateCustomTopic.trim().length > 0;
  const smtpReady = Boolean(activeSmtpConfig);
  const smtpRefreshInProgress = smtpQuery.isFetching && !smtpQuery.isLoading;

  useEffect(() => {
    window.requestAnimationFrame(() => {
      focusStepCard(templateStepRef.current);
    });
  }, []);

  const handleRefreshSmtp = async () => {
    if (smtpRefreshInProgress) return;

    const result = await smtpQuery.refetch();

    if (result.error) {
      toast({
        title: "발송 설정 상태 확인 실패",
        description: parseErrorMessage(result.error, "발송 설정 상태를 확인하지 못했습니다."),
        variant: "destructive",
      });
      return;
    }

    const refreshedSmtpConfig = resolveExperienceSmtp(result.data ?? []);
    if (refreshedSmtpConfig) {
      toast({
        title: "SMTP 연결 확인 완료",
        description: `${refreshedSmtpConfig.host}:${refreshedSmtpConfig.port} 연결을 확인했습니다. 다음 단계로 이동합니다.`,
      });
      window.setTimeout(() => {
        focusStepCard(deliveryStepRef.current);
      }, 250);
      return;
    }

    toast({
      title: "발송 설정 미확인",
      description: "아직 활성화된 발송 설정을 찾지 못했습니다. 설정 후 다시 새로고침하세요.",
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="icon" aria-label="대시보드로 이동">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Ready Tenant</Badge>
            <Badge variant={smtpReady ? "default" : "secondary"}>
              {smtpReady ? "발송 설정 준비 완료" : "발송 설정 필요"}
            </Badge>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">첫 피싱 시뮬레이션 체험</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            AI로 메일과 훈련 안내 페이지를 만든 뒤, 내 이메일로 실제 프로젝트를 발송하고
            프로젝트 상세 화면에서 오픈, 클릭, 제출 집계를 직접 확인합니다.
          </p>
        </div>
      </div>

      <Card className="border-sky-200 bg-sky-50 p-5 text-sm text-sky-900">
        실제 메일 발송까지 하려면 발송 설정이 필요합니다. 다만 템플릿 생성과 훈련 안내
        페이지 생성은 먼저 진행할 수 있습니다.
      </Card>

      <Card
        ref={templateStepRef}
        tabIndex={-1}
        className="space-y-5 p-6 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            Step 1/4
          </div>
          <h2 className="text-2xl font-semibold">AI 피싱 메일 만들기</h2>
          <p className="text-sm text-muted-foreground">
            주제와 톤을 정하면 AI가 실제 체험용 메일 후보를 생성합니다.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>주제</Label>
            <Select value={templateTopic} onValueChange={(value) => setTemplateTopic(value as typeof templateTopic)}>
              <SelectTrigger>
                <SelectValue placeholder="주제를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {templateAiTopicOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {templateAiTopicLabels[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>톤</Label>
            <Select value={templateTone} onValueChange={(value) => setTemplateTone(value as typeof templateTone)}>
              <SelectTrigger>
                <SelectValue placeholder="톤을 선택하세요" />
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
            <Label>난이도</Label>
            <Select
              value={templateDifficulty}
              onValueChange={(value) => setTemplateDifficulty(value as typeof templateDifficulty)}
            >
              <SelectTrigger>
                <SelectValue placeholder="난이도를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {templateAiDifficultyOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {templateAiDifficultyLabels[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {templateTopic === "other" ? (
            <div className="space-y-2">
              <Label htmlFor="template-custom-topic">주제 직접 입력</Label>
              <Input
                id="template-custom-topic"
                value={templateCustomTopic}
                onChange={(event) => setTemplateCustomTopic(event.target.value)}
                placeholder="예: 전자세금계산서, 사내 공지"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="template-recipient-preview">예상 체험자</Label>
              <Input id="template-recipient-preview" value={sessionEmail} disabled />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="template-prompt">추가 요청사항</Label>
          <Textarea
            id="template-prompt"
            value={templatePrompt}
            onChange={(event) => setTemplatePrompt(event.target.value)}
            placeholder="예: 한국어 기업 내부 메일처럼 보이게, CTA는 하나만"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => templateGenerateMutation.mutate()}
            disabled={!canGenerateTemplate || templateGenerateMutation.isPending}
          >
            {templateGenerateMutation.isPending ? "생성 중..." : "메일 후보 생성"}
          </Button>
          {savedTemplate ? (
            <Badge className="gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              저장 완료
            </Badge>
          ) : null}
        </div>

        {templateCandidates.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {templateCandidates.map((candidate) => {
              const previewHtml = buildMailHtml(
                {
                  body: candidate.body,
                  autoInsertLandingEnabled: true,
                  autoInsertLandingLabel: "문서 확인하기",
                  autoInsertLandingKind: "link",
                  autoInsertLandingNewTab: true,
                },
                previewLandingUrl,
                previewOpenPixelUrl,
              ).html;
              const isSelected = candidate.id === selectedTemplateCandidateId;
              return (
                <Card
                  key={candidate.id}
                  className={`space-y-4 p-4 ${isSelected ? "border-sky-500 shadow-sm" : ""}`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold">{candidate.subject}</h3>
                      <Button
                        size="sm"
                        variant={isSelected ? "default" : "outline"}
                        onClick={() => setSelectedTemplateCandidateId(candidate.id)}
                      >
                        {isSelected ? "선택됨" : "선택"}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">{candidate.summary}</p>
                  </div>
                  <div className="overflow-hidden rounded-md border border-slate-200">
                    <TemplatePreviewFrame html={previewHtml} theme="light" className="max-h-[320px]" />
                  </div>
                </Card>
              );
            })}
          </div>
        ) : null}

        {selectedTemplateCandidate ? (
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => saveTemplateMutation.mutate()}
              disabled={saveTemplateMutation.isPending}
            >
              {saveTemplateMutation.isPending ? "저장 중..." : "이 메일로 진행"}
            </Button>
            {savedTemplate ? (
              <Link href={`/templates/${savedTemplate.id}/edit`}>
                <Button variant="outline">템플릿 편집</Button>
              </Link>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card
        ref={trainingStepRef}
        tabIndex={-1}
        className={`space-y-5 p-6 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 ${
          savedTemplate ? "" : "opacity-70"
        }`}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            Step 2/4
          </div>
          <h2 className="text-2xl font-semibold">AI 훈련 안내 페이지 만들기</h2>
          <p className="text-sm text-muted-foreground">
            메일 클릭 뒤 표시할 안내 페이지를 생성합니다.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>문체</Label>
            <Select value={trainingTone} onValueChange={(value) => setTrainingTone(value as typeof trainingTone)}>
              <SelectTrigger>
                <SelectValue placeholder="문체를 선택하세요" />
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
            <Label htmlFor="training-resource-name">연결 대상 메일</Label>
            <Input id="training-resource-name" value={savedTemplate?.subject ?? ""} disabled />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="training-prompt">추가 요청사항</Label>
          <Textarea
            id="training-prompt"
            value={trainingPrompt}
            onChange={(event) => setTrainingPrompt(event.target.value)}
            placeholder="예: 사용자가 실수한 포인트와 다음 행동 요령을 짧게 정리"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => trainingGenerateMutation.mutate()}
            disabled={!savedTemplate || trainingGenerateMutation.isPending}
          >
            {trainingGenerateMutation.isPending ? "생성 중..." : "훈련 안내 페이지 생성"}
          </Button>
          {savedTrainingPage ? (
            <Badge className="gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              저장 완료
            </Badge>
          ) : null}
        </div>

        {trainingCandidates.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {trainingCandidates.map((candidate) => {
              const isSelected = candidate.id === selectedTrainingCandidateId;
              return (
                <Card
                  key={candidate.id}
                  className={`space-y-4 p-4 ${isSelected ? "border-sky-500 shadow-sm" : ""}`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold">{candidate.name}</h3>
                      <Button
                        size="sm"
                        variant={isSelected ? "default" : "outline"}
                        onClick={() => setSelectedTrainingCandidateId(candidate.id)}
                      >
                        {isSelected ? "선택됨" : "선택"}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">{candidate.summary}</p>
                  </div>
                  <div className="overflow-hidden rounded-md border border-slate-200">
                    <TemplatePreviewFrame html={candidate.content} theme="light" className="max-h-[320px]" />
                  </div>
                </Card>
              );
            })}
          </div>
        ) : null}

        {selectedTrainingCandidate ? (
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => saveTrainingPageMutation.mutate()}
              disabled={!savedTemplate || saveTrainingPageMutation.isPending}
            >
              {saveTrainingPageMutation.isPending ? "저장 중..." : "이 안내 페이지로 진행"}
            </Button>
            {savedTrainingPage ? (
              <Link href={`/training-pages/${savedTrainingPage.id}/edit`}>
                <Button variant="outline">안내 페이지 편집</Button>
              </Link>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card
        ref={smtpStepRef}
        tabIndex={-1}
        className={`space-y-5 p-6 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 ${
          savedTrainingPage ? "" : "opacity-70"
        }`}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Mail className="h-4 w-4" />
            Step 3/4
          </div>
          <h2 className="text-2xl font-semibold">SMTP 연결 확인</h2>
          <p className="text-sm text-muted-foreground">
            실제 메일 수신 체험은 활성화된 발송 설정이 있어야 진행됩니다. 여기서는
            전송 계정 연결 상태만 확인하고, 실제 발신 이메일은 다음 단계에서 입력합니다.
          </p>
        </div>

        {smtpReady && activeSmtpConfig ? (
          <Card className="border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="font-semibold">SMTP 연결 완료</p>
                <p>
                  {activeSmtpConfig.host}:{activeSmtpConfig.port}
                  {activeSmtpConfig.username ? ` · 계정 ${activeSmtpConfig.username}` : ""}
                </p>
                <p className="text-emerald-800">
                  실제 발신 이메일은 다음 단계에서 프로젝트별로 입력합니다.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => void handleRefreshSmtp()}
                disabled={smtpRefreshInProgress}
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${smtpRefreshInProgress ? "animate-spin" : ""}`}
                />
                {smtpRefreshInProgress ? "상태 확인 중..." : "상태 새로고침"}
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="space-y-3">
              <p className="font-semibold">발송 설정이 아직 없습니다.</p>
              <p>
                새 탭에서 발송 설정을 추가한 뒤 이 화면으로 돌아와 상태를 새로고침하세요.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href="/admin/smtp/new" target="_blank" rel="noopener noreferrer">
                  <Button>발송 설정 열기</Button>
                </Link>
                <Button
                  variant="outline"
                  onClick={() => void handleRefreshSmtp()}
                  disabled={smtpRefreshInProgress}
                >
                  <RefreshCw
                    className={`mr-2 h-4 w-4 ${smtpRefreshInProgress ? "animate-spin" : ""}`}
                  />
                  {smtpRefreshInProgress ? "상태 확인 중..." : "상태 새로고침"}
                </Button>
              </div>
            </div>
          </Card>
        )}
      </Card>

      <Card
        ref={deliveryStepRef}
        tabIndex={-1}
        className={`space-y-5 p-6 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 ${
          smtpReady ? "" : "opacity-70"
        }`}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Send className="h-4 w-4" />
            Step 4/4
          </div>
          <h2 className="text-2xl font-semibold">내 메일로 실제 발송</h2>
          <p className="text-sm text-muted-foreground">
            방금 만든 리소스로 1인 체험 프로젝트를 생성하고 바로 발송합니다. 발신 이메일은
            이 단계에서 직접 지정합니다.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="recipient-email">내 이메일</Label>
            <Input
              id="recipient-email"
              value={currentRecipient}
              onChange={(event) => setRecipientEmail(event.target.value)}
              placeholder="user@company.com"
            />
            {!emailRegex.test(currentRecipient.trim()) && currentRecipient && (
              <p className="text-sm text-destructive">올바른 수신 이메일을 입력하세요.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="sender-email">발신 이메일</Label>
            <Input
              id="sender-email"
              value={currentSender}
              onChange={(event) => setSenderEmail(event.target.value)}
              placeholder="sender@company.com"
            />
            {!emailRegex.test(currentSender.trim()) && currentSender && (
              <p className="text-sm text-destructive">올바른 발신 이메일을 입력하세요.</p>
            )}
          </div>
        </div>

        <div className="rounded-md border border-border bg-muted/30 p-4 text-sm">
          <p className="font-medium text-foreground">발송 시 생성되는 리소스</p>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            <li>템플릿: {savedTemplate?.name ?? "-"}</li>
            <li>훈련 안내 페이지: {savedTrainingPage?.name ?? "-"}</li>
            <li>수신 대상: {currentRecipient || "-"}</li>
            <li>발신 이메일: {currentSender || "-"}</li>
            <li>프로젝트명: {buildExperienceProjectName(savedTemplate?.subject ?? "")}</li>
          </ul>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => launchExperienceMutation.mutate()}
            disabled={
              !savedTemplate ||
              !savedTrainingPage ||
              !smtpReady ||
              launchExperienceMutation.isPending ||
              !emailRegex.test(currentRecipient.trim()) ||
              !emailRegex.test(currentSender.trim())
            }
          >
            {launchExperienceMutation.isPending ? "프로젝트 생성 및 발송 중..." : "체험 프로젝트 발송하기"}
          </Button>
          <Link href="/projects">
            <Button variant="outline">프로젝트 목록 보기</Button>
          </Link>
        </div>
      </Card>

      {templateGenerateMutation.isError ? (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {parseErrorMessage(templateGenerateMutation.error, "템플릿 후보 생성에 실패했습니다.")}
        </Card>
      ) : null}
      {trainingGenerateMutation.isError ? (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {parseErrorMessage(trainingGenerateMutation.error, "훈련 안내 페이지 생성에 실패했습니다.")}
        </Card>
      ) : null}
    </div>
  );
}
