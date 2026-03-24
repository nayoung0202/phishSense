import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  trainingPageAiGenerateResponseSchema,
  type TrainingPageAiRequest,
  trainingPageAiRequestSchema,
} from "@shared/trainingPageAi";
import {
  TEMPLATE_AI_REFERENCE_ATTACHMENT_MAX_HTML_CHARS,
  resolveTemplateAiReferenceAttachmentKind,
  validateTemplateAiReferenceAttachmentMeta,
} from "@shared/templateAi";
import {
  generateTrainingPageAiCandidates,
  TrainingPageAiServiceError,
} from "@/server/services/trainingPageAi";
import {
  AiCreditGateError,
  executeWithAiCreditGate,
} from "@/server/platform/aiCredits";
import {
  markTenantAiKeyUsed,
  resolveTenantAiProviderKeys,
} from "@/server/services/tenantAiKeys";

class TrainingPageAiRequestParseError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TrainingPageAiRequestParseError";
    this.status = status;
  }
}

const parseJsonArrayField = <T>(value: FormDataEntryValue | null, fallback: T): T => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    throw new TrainingPageAiRequestParseError("AI 훈련안내페이지 생성 요청이 올바르지 않습니다.");
  }
};

const parseReferenceAttachment = async (value: FormDataEntryValue | null) => {
  if (!(value instanceof File) || value.name.trim().length === 0) {
    return undefined;
  }

  const validationMessage = validateTemplateAiReferenceAttachmentMeta({
    name: value.name,
    mimeType: value.type,
    size: value.size,
  });

  if (validationMessage) {
    throw new TrainingPageAiRequestParseError(`훈련안내페이지 첨부파일: ${validationMessage}`);
  }

  const kind = resolveTemplateAiReferenceAttachmentKind({
    name: value.name,
    mimeType: value.type,
  });

  if (!kind) {
    throw new TrainingPageAiRequestParseError(
      "훈련안내페이지 첨부파일: 이미지(PNG/JPEG/WEBP/GIF) 또는 HTML 파일만 업로드할 수 있습니다.",
    );
  }

  if (kind === "html") {
    const textContent = (await value.text()).trim();
    if (!textContent) {
      throw new TrainingPageAiRequestParseError(
        "훈련안내페이지 첨부파일: 빈 HTML 파일은 사용할 수 없습니다.",
      );
    }

    return {
      name: value.name,
      mimeType: value.type || "text/html",
      kind,
      textContent: textContent.slice(0, TEMPLATE_AI_REFERENCE_ATTACHMENT_MAX_HTML_CHARS),
    } as const;
  }

  return {
    name: value.name,
    mimeType: value.type,
    kind,
    base64Data: Buffer.from(await value.arrayBuffer()).toString("base64"),
  } as const;
};

const parseTrainingPageAiRequest = async (request: Request): Promise<TrainingPageAiRequest> => {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (!contentType.includes("multipart/form-data")) {
    const clonedRequest = request.clone();

    try {
      return trainingPageAiRequestSchema.parse(await request.json());
    } catch (error) {
      if (error instanceof ZodError) {
        throw error;
      }

      try {
        const formData = await clonedRequest.formData();
        return trainingPageAiRequestSchema.parse({
          tone: formData.get("tone"),
          prompt: formData.get("prompt"),
          generateCount: Number(formData.get("generateCount") ?? 4),
          preservedCandidates: parseJsonArrayField(formData.get("preservedCandidates"), []),
          referenceAttachment: await parseReferenceAttachment(formData.get("referenceAttachment")),
        });
      } catch {
        throw error;
      }
    }
  }

  const formData = await request.formData();
  return trainingPageAiRequestSchema.parse({
    tone: formData.get("tone"),
    prompt: formData.get("prompt"),
    generateCount: Number(formData.get("generateCount") ?? 4),
    preservedCandidates: parseJsonArrayField(formData.get("preservedCandidates"), []),
    referenceAttachment: await parseReferenceAttachment(formData.get("referenceAttachment")),
  });
};

export async function POST(request: NextRequest) {
  try {
    const payload = await parseTrainingPageAiRequest(request);
    const result = await executeWithAiCreditGate({
      request,
      kind: "training-page",
      usageContext: payload.usageContext,
      action: async ({ tenantId }) => {
        const tenantKeys = await resolveTenantAiProviderKeys(tenantId, "training-page-ai");

        if (tenantKeys.preferredKeyId) {
          await markTenantAiKeyUsed(tenantId, tenantKeys.preferredKeyId);
        }

        return generateTrainingPageAiCandidates(
          payload,
          tenantKeys.hasAny
            ? {
                providerApiKeys: {
                  anthropicApiKey: tenantKeys.anthropicApiKey,
                  openAiApiKey: tenantKeys.openAiApiKey,
                  geminiApiKey: tenantKeys.geminiApiKey,
                },
              }
            : undefined,
        );
      },
    });
    return NextResponse.json(trainingPageAiGenerateResponseSchema.parse(result));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "AI 훈련안내페이지 생성 요청이 올바르지 않습니다.", issues: error.errors },
        { status: 400 },
      );
    }

    if (error instanceof TrainingPageAiRequestParseError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    if (error instanceof TrainingPageAiServiceError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          retryable: error.retryable,
        },
        { status: error.status },
      );
    }

    if (error instanceof AiCreditGateError) {
      return NextResponse.json(
        {
          error: error.message,
        },
        { status: error.status },
      );
    }

    const message =
      error instanceof Error ? error.message : "training_page_ai_generate_failed";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
