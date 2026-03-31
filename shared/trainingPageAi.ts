import { z } from "zod";
import {
  DEFAULT_TEMPLATE_AI_MODEL,
  TEMPLATE_AI_REFERENCE_ATTACHMENT_ACCEPT,
  type TemplateAiReferenceAttachment,
  templateAiReferenceAttachmentSchema,
  templateAiToneLabels,
  templateAiToneOptions,
} from "./templateAi";

export const TRAINING_PAGE_AI_DRAFT_SESSION_KEY = "phishsense.training-page.ai-draft";
export const DEFAULT_TRAINING_PAGE_AI_MODEL = DEFAULT_TEMPLATE_AI_MODEL;
export const TRAINING_PAGE_AI_FIXED_CREDIT_COST = 1;
export { TEMPLATE_AI_REFERENCE_ATTACHMENT_ACCEPT };
export type { TemplateAiReferenceAttachment };

export const trainingPageAiRequestSchema = z
  .object({
    tone: z.enum(templateAiToneOptions),
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
          name: z.string().min(1),
        }),
      )
      .max(3)
      .default([]),
    usageContext: z.literal("standard").default("standard"),
    referenceAttachment: templateAiReferenceAttachmentSchema.optional(),
  });

export type TrainingPageAiRequest = z.infer<typeof trainingPageAiRequestSchema>;

export const trainingPageAiCandidateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  content: z.string().min(1),
  summary: z.string().min(1),
});

export type TrainingPageAiCandidate = z.infer<typeof trainingPageAiCandidateSchema>;

export const trainingPageAiGenerateResponseSchema = z.object({
  candidates: z.array(trainingPageAiCandidateSchema).min(1).max(4),
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

export type TrainingPageAiGenerateResponse = z.infer<typeof trainingPageAiGenerateResponseSchema>;

export type TrainingPageAiDraft = TrainingPageAiCandidate & {
  source: "ai";
  generatedAt: string;
};

export const buildTrainingPageAiToneText = (request: TrainingPageAiRequest) =>
  templateAiToneLabels[request.tone];

const trainingPageAiBaseGuidance = [
  "이 페이지는 피싱 모의훈련 또는 보안 인식 학습 안내 화면임을 명확하게 설명합니다.",
  "실제 로그인, 결제, 개인정보 제출이 필요하지 않다는 점을 분명하게 안내합니다.",
  "사용자가 다음부터 바로 실천할 수 있는 확인 요령을 2~3개 핵심 항목으로 정리합니다.",
] as const;

const trainingPageAiGeneralGuidance = [
  "사용자가 메일이나 메시지의 링크를 바로 누르지 말고 공식 사이트, 공식 앱, 사내 포털 등 신뢰 가능한 경로로 직접 접속해 확인하라고 안내합니다.",
  "민감정보 입력이나 파일 실행 전에는 발신자, 도메인, 요청 맥락을 다시 확인하라고 안내합니다.",
] as const;

export const buildTrainingPageAiMandatoryGuidance = () => {
  return {
    topicLabel: "피싱 대응 기본 수칙",
    lines: [...trainingPageAiBaseGuidance, ...trainingPageAiGeneralGuidance],
  };
};
