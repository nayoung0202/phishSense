import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  templateAiGenerateResponseSchema,
  type TemplateAiRequest,
  templateAiRequestSchema,
  resolveTemplateAiReferenceAttachmentKind,
  validateTemplateAiReferenceAttachmentMeta,
} from "@shared/templateAi";
import {
  generateTemplateAiCandidates,
  TemplateAiServiceError,
} from "@/server/services/templateAi";
import {
  AiCreditGateError,
  executeWithAiCreditGate,
} from "@/server/platform/aiCredits";
import {
  markTenantAiKeyUsed,
  resolveTenantAiProviderKeys,
} from "@/server/services/tenantAiKeys";

class TemplateAiRequestParseError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TemplateAiRequestParseError";
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
    throw new TemplateAiRequestParseError("AI 템플릿 생성 요청이 올바르지 않습니다.");
  }
};

const parseReferenceAttachment = async (
  value: FormDataEntryValue | null,
  label: string,
) => {
  if (!(value instanceof File) || value.name.trim().length === 0) {
    return undefined;
  }

  const validationMessage = validateTemplateAiReferenceAttachmentMeta({
    name: value.name,
    mimeType: value.type,
    size: value.size,
  });

  if (validationMessage) {
    throw new TemplateAiRequestParseError(`${label}: ${validationMessage}`);
  }

  const kind = resolveTemplateAiReferenceAttachmentKind({
    name: value.name,
    mimeType: value.type,
  });

  if (!kind) {
    throw new TemplateAiRequestParseError(
      `${label}: 이미지(PNG/JPEG/WEBP/GIF) 또는 HTML 파일만 업로드할 수 있습니다.`,
    );
  }

  if (kind === "html") {
    const textContent = (await value.text()).trim();
    if (!textContent) {
      throw new TemplateAiRequestParseError(`${label}: 빈 HTML 파일은 사용할 수 없습니다.`);
    }

    return {
      name: value.name,
      mimeType: value.type || "text/html",
      kind,
      textContent: textContent.slice(0, 20_000),
    } as const;
  }

  return {
    name: value.name,
    mimeType: value.type,
    kind,
    base64Data: Buffer.from(await value.arrayBuffer()).toString("base64"),
  } as const;
};

const parseTemplateAiRequest = async (request: Request): Promise<TemplateAiRequest> => {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (!contentType.includes("multipart/form-data")) {
    return templateAiRequestSchema.parse(await request.json());
  }

  const formData = await request.formData();
  return templateAiRequestSchema.parse({
    topic: formData.get("topic"),
    customTopic: formData.get("customTopic"),
    tone: formData.get("tone"),
    difficulty: formData.get("difficulty"),
    prompt: formData.get("prompt"),
    generateCount: Number(formData.get("generateCount") ?? 4),
    preservedCandidates: parseJsonArrayField(formData.get("preservedCandidates"), []),
    mailBodyReferenceAttachment: await parseReferenceAttachment(
      formData.get("mailBodyReferenceAttachment"),
      "메일본문 첨부파일",
    ),
    maliciousPageReferenceAttachment: await parseReferenceAttachment(
      formData.get("maliciousPageReferenceAttachment"),
      "악성메일본문 첨부파일",
    ),
  });
};

export async function POST(request: NextRequest) {
  try {
    const payload = await parseTemplateAiRequest(request);
    const result = await executeWithAiCreditGate({
      request,
      kind: "template",
      usageContext: payload.usageContext,
      action: async ({ tenantId }) => {
        const tenantKeys = await resolveTenantAiProviderKeys(tenantId, "template-ai");

        if (tenantKeys.preferredKeyId) {
          await markTenantAiKeyUsed(tenantId, tenantKeys.preferredKeyId);
        }

        return generateTemplateAiCandidates(
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
    return NextResponse.json(templateAiGenerateResponseSchema.parse(result));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "AI 템플릿 생성 요청이 올바르지 않습니다.", issues: error.errors },
        { status: 400 },
      );
    }

    if (error instanceof TemplateAiRequestParseError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    if (error instanceof TemplateAiServiceError) {
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

    const message = error instanceof Error ? error.message : "template_ai_generate_failed";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
