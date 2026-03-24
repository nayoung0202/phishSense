import { z } from "zod";

export const TEMPLATE_AI_DRAFT_SESSION_KEY = "phishsense.template.ai-draft";
export const DEFAULT_TEMPLATE_AI_MODEL = "gemini-2.5-flash-lite";
export const TEMPLATE_AI_REFERENCE_ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;
export const TEMPLATE_AI_REFERENCE_ATTACHMENT_ACCEPT =
  ".html,.htm,image/png,image/jpeg,image/webp,image/gif";

const templateAiReferenceHtmlExtensions = [".html", ".htm"] as const;
const templateAiReferenceHtmlMimeTypes = ["text/html", "application/xhtml+xml"] as const;
const templateAiReferenceImageMimeTypes = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export const templateAiTopicOptions = [
  "shipping",
  "account-security",
  "payroll-benefits",
  "hr-announcement",
  "approval",
  "it-maintenance",
  "other",
] as const;

export const templateAiToneOptions = [
  "formal",
  "informational",
  "internal-notice",
  "urgent-request",
] as const;

export const templateAiDifficultyOptions = ["easy", "medium", "hard"] as const;

export const templateAiTopicLabels: Record<(typeof templateAiTopicOptions)[number], string> = {
  shipping: "배송",
  "account-security": "계정 보안",
  "payroll-benefits": "급여/복지",
  "hr-announcement": "인사 공지",
  approval: "전자결재",
  "it-maintenance": "IT 점검",
  other: "기타",
};

export const templateAiToneLabels: Record<(typeof templateAiToneOptions)[number], string> = {
  formal: "공식형",
  informational: "안내형",
  "internal-notice": "자연스러운 내부 공지형",
  "urgent-request": "긴급 요청형",
};

export const templateAiDifficultyLabels: Record<
  (typeof templateAiDifficultyOptions)[number],
  string
> = {
  easy: "쉬움",
  medium: "보통",
  hard: "어려움",
};

export const resolveTemplateAiTopicText = (args: {
  topic: (typeof templateAiTopicOptions)[number];
  customTopic?: string;
}) => {
  if (args.topic === "other") {
    return args.customTopic?.trim() ?? "";
  }

  return templateAiTopicLabels[args.topic];
};

export const resolveTemplateAiReferenceAttachmentKind = (args: {
  name: string;
  mimeType?: string | null;
}) => {
  const normalizedMimeType = args.mimeType?.trim().toLowerCase() ?? "";
  const normalizedName = args.name.trim().toLowerCase();

  if (
    templateAiReferenceHtmlMimeTypes.includes(
      normalizedMimeType as (typeof templateAiReferenceHtmlMimeTypes)[number],
    ) ||
    templateAiReferenceHtmlExtensions.some((extension) => normalizedName.endsWith(extension))
  ) {
    return "html" as const;
  }

  if (
    templateAiReferenceImageMimeTypes.includes(
      normalizedMimeType as (typeof templateAiReferenceImageMimeTypes)[number],
    )
  ) {
    return "image" as const;
  }

  return null;
};

export const validateTemplateAiReferenceAttachmentMeta = (args: {
  name: string;
  mimeType?: string | null;
  size: number;
}) => {
  if (args.size <= 0) {
    return "빈 파일은 업로드할 수 없습니다.";
  }

  if (args.size > TEMPLATE_AI_REFERENCE_ATTACHMENT_MAX_BYTES) {
    return "첨부파일은 2MB 이하만 업로드할 수 있습니다.";
  }

  if (!resolveTemplateAiReferenceAttachmentKind(args)) {
    return "이미지(PNG/JPEG/WEBP/GIF) 또는 HTML 파일만 업로드할 수 있습니다.";
  }

  return null;
};

export const templateAiReferenceAttachmentSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(100),
    kind: z.enum(["html", "image"]),
    textContent: z.string().max(20_000).optional(),
    base64Data: z.string().max(4_000_000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "html" && !value.textContent?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["textContent"],
        message: "HTML 첨부 내용이 비어 있습니다.",
      });
    }

    if (value.kind === "image" && !value.base64Data?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["base64Data"],
        message: "이미지 첨부 데이터가 비어 있습니다.",
      });
    }
  });

export type TemplateAiReferenceAttachment = z.infer<typeof templateAiReferenceAttachmentSchema>;

export const templateAiRequestSchema = z
  .object({
    topic: z.enum(templateAiTopicOptions),
    customTopic: z
      .string()
      .trim()
      .max(60, "직접 입력하는 주제는 60자 이하로 입력해 주세요.")
      .default(""),
    tone: z.enum(templateAiToneOptions),
    difficulty: z.enum(templateAiDifficultyOptions),
    prompt: z
      .string()
      .trim()
      .max(800, "추가 요청사항은 800자 이하로 입력해 주세요.")
      .default(""),
    generateCount: z.number().int().min(1).max(4).default(4),
    preservedCandidates: z
      .array(
        z.object({
          id: z.string().min(1),
          subject: z.string().min(1),
        }),
      )
      .max(3)
      .default([]),
    usageContext: z.enum(["standard", "experience"]).default("standard"),
    mailBodyReferenceAttachment: templateAiReferenceAttachmentSchema.optional(),
    maliciousPageReferenceAttachment: templateAiReferenceAttachmentSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.topic === "other" && value.customTopic.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customTopic"],
        message: "기타를 선택한 경우 주제를 직접 입력해 주세요.",
      });
    }
  });

export type TemplateAiRequest = z.infer<typeof templateAiRequestSchema>;

export const templateAiCandidateSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  maliciousPageContent: z.string().min(1),
  summary: z.string().min(1),
});

export type TemplateAiCandidate = z.infer<typeof templateAiCandidateSchema>;

export const templateAiGenerateResponseSchema = z.object({
  candidates: z.array(templateAiCandidateSchema).min(1).max(4),
  usage: z
    .object({
      promptTokenCount: z.number().int().nonnegative(),
      candidatesTokenCount: z.number().int().nonnegative(),
      totalTokenCount: z.number().int().nonnegative(),
      estimatedCredits: z.number().int().positive(),
      model: z.string().min(1),
    })
    .optional(),
});

export type TemplateAiGenerateResponse = z.infer<typeof templateAiGenerateResponseSchema>;

export type TemplateAiDraft = TemplateAiCandidate & {
  source: "ai";
  generatedAt: string;
};

const TEMPLATE_AI_INPUT_COST_PER_MILLION = 0.1;
const TEMPLATE_AI_OUTPUT_COST_PER_MILLION = 0.4;
const CREDIT_USD_UNIT = 0.001;

export const estimateTokenCountFromText = (value: string) =>
  Math.max(1, Math.ceil(value.trim().length / 4));

export const estimateTemplateAiCredits = (args: {
  topic: string;
  tone: string;
  difficulty: string;
  prompt: string;
  candidateCount: number;
}) => {
  const promptTokenCount =
    estimateTokenCountFromText(`${args.topic} ${args.tone} ${args.difficulty} ${args.prompt}`) +
    2200;
  const candidateTokenCount = Math.max(1, args.candidateCount) * 2600;
  const estimatedCostUsd =
    (promptTokenCount / 1_000_000) * TEMPLATE_AI_INPUT_COST_PER_MILLION +
    (candidateTokenCount / 1_000_000) * TEMPLATE_AI_OUTPUT_COST_PER_MILLION;

  return Math.max(1, Math.ceil(estimatedCostUsd / CREDIT_USD_UNIT));
};

export const findUnsafeTemplateHtmlIssues = (html: string) => {
  const issues: string[] = [];
  const rules: Array<[RegExp, string]> = [
    [/<script[\s\S]*?>/i, "script 태그는 사용할 수 없습니다."],
    [/<iframe[\s\S]*?>/i, "iframe 태그는 사용할 수 없습니다."],
    [/<object[\s\S]*?>/i, "object 태그는 사용할 수 없습니다."],
    [/<embed[\s\S]*?>/i, "embed 태그는 사용할 수 없습니다."],
    [/<link[\s\S]*?>/i, "외부 CSS link 태그는 사용할 수 없습니다."],
    [/\son[a-z]+\s*=/i, "인라인 이벤트 핸들러는 사용할 수 없습니다."],
    [/\s(?:src|href)\s*=\s*["']\s*(?:https?:)?\/\//i, "외부 리소스 URL은 사용할 수 없습니다."],
    [/\s(?:src|href)\s*=\s*["']\s*javascript:/i, "javascript: URL은 사용할 수 없습니다."],
  ];

  rules.forEach(([pattern, message]) => {
    if (pattern.test(html)) {
      issues.push(message);
    }
  });

  return issues;
};
