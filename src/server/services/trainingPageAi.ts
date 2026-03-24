import { randomUUID } from "node:crypto";
import { extractBodyHtml } from "@/lib/html";
import {
  DEFAULT_TRAINING_PAGE_AI_MODEL,
  type TemplateAiReferenceAttachment,
  type TrainingPageAiCandidate,
  type TrainingPageAiRequest,
  buildTrainingPageAiMandatoryGuidance,
  buildTrainingPageAiToneText,
} from "@shared/trainingPageAi";
import { findUnsafeTemplateHtmlIssues } from "@shared/templateAi";

type GeminiUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
};

type OpenAiChatCompletionPayload = {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

type AnthropicMessagePayload = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  model?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: {
    type?: string;
    message?: string;
  };
};

type GenerateTrainingPageAiResult = {
  candidates: TrainingPageAiCandidate[];
  usage: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
    estimatedCredits: number;
    model: string;
  };
};

type TrainingPageAiProviderApiKeys = {
  anthropicApiKey?: string;
  openAiApiKey?: string;
  geminiApiKey?: string;
};

type GeminiApiErrorPayload = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

type TrainingPageAiServiceErrorArgs = {
  status: number;
  code: string;
  message: string;
  retryable?: boolean;
};

export class TrainingPageAiServiceError extends Error {
  status: number;
  code: string;
  retryable: boolean;

  constructor({
    status,
    code,
    message,
    retryable = false,
  }: TrainingPageAiServiceErrorArgs) {
    super(message);
    this.name = "TrainingPageAiServiceError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

const responseSchema = {
  type: "OBJECT",
  properties: {
    candidates: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          description: { type: "STRING" },
          content: { type: "STRING" },
          summary: { type: "STRING" },
        },
        required: ["name", "description", "content", "summary"],
      },
    },
  },
  required: ["candidates"],
};
const OPENAI_TRAINING_PAGE_AI_MODEL = "gpt-4.1-mini";
const ANTHROPIC_TRAINING_PAGE_AI_MODEL = "claude-sonnet-4-20250514";
const GEMINI_TRAINING_PAGE_AI_FALLBACK_MODELS = ["gemini-2.5-flash"] as const;

const defaultTrainingPageReferenceHtml = `
<section style="max-width:760px;margin:48px auto;padding:40px;border:1px solid #e5e7eb;border-radius:24px;background:#ffffff;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#111827;">
  <h1 style="margin:0 0 16px;font-size:28px;">보안 훈련 안내</h1>
  <p style="margin:0 0 12px;font-size:15px;line-height:1.8;color:#374151;">방금 확인한 페이지는 사내 보안 인식 향상을 위한 모의훈련 시나리오였습니다.</p>
  <p style="margin:0;font-size:15px;line-height:1.8;color:#4b5563;">실제 메일과 유사한 요소를 침착하게 확인하고, 공식 채널로 다시 검증하는 습관이 중요합니다.</p>
</section>
`.trim();

const interactiveTagPattern =
  /<(a|button|form)\b[^>]*>([\s\S]*?)<\/\1>|<input\b[^>]*\/?>/gi;
const TRAINING_PAGE_REFERENCE_ROOT_ATTR = 'data-training-page-reference-root="true"';
const typeAttributePattern = /\btype\s*=\s*(["']?)([^"'\s>]+)\1/i;
const valueAttributePattern = /\bvalue\s*=\s*(["'])(.*?)\1/i;
const placeholderAttributePattern = /\bplaceholder\s*=\s*(["'])(.*?)\1/i;
const ariaLabelAttributePattern = /\baria-label\s*=\s*(["'])(.*?)\1/i;
const imageTagPattern = /<img\b[^>]*\bsrc=(["'])(.*?)\1[^>]*>/i;

const stripUnsafeTemplateHtml = (html: string) =>
  html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, "")
    .replace(/<embed\b[^>]*\/?>/gi, "")
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(["'])[\s\S]*?\1/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(
      /\s(src|href)\s*=\s*(["'])\s*(?:https?:)?\/\/[\s\S]*?\2/gi,
      (_match, attrName) => (String(attrName).toLowerCase() === "href" ? ' href="#"' : ""),
    )
    .replace(/\s(src|href)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, "");

const buildEmbeddedReferenceImage = (attachment: TemplateAiReferenceAttachment) =>
  `<div style="text-align:center; margin:0 0 24px;"><img src="data:${attachment.mimeType};base64,${attachment.base64Data}" alt="${attachment.name}" style="max-width:100%; height:auto; display:inline-block;" /></div>`;

const ensureEmbeddedReferenceImage = (
  html: string,
  attachment?: TemplateAiReferenceAttachment,
) => {
  if (!attachment || attachment.kind !== "image" || !attachment.base64Data) {
    return html;
  }

  const embeddedImage = buildEmbeddedReferenceImage(attachment);

  if (imageTagPattern.test(html)) {
    return html.replace(
      imageTagPattern,
      `<img src="data:${attachment.mimeType};base64,${attachment.base64Data}" alt="${attachment.name}" style="max-width:100%; height:auto; display:block; margin:0 auto;" />`,
    );
  }

  return `${embeddedImage}${html.trim().length > 0 ? "\n" : ""}${html}`;
};

const buildReferenceImageHtml = (attachment: TemplateAiReferenceAttachment) => `
<div ${TRAINING_PAGE_REFERENCE_ROOT_ATTR} style="display:flex;justify-content:center;align-items:flex-start;padding:0;margin:0;">
  <img
    src="data:${attachment.mimeType};base64,${attachment.base64Data}"
    alt="${attachment.name}"
    style="display:block;max-width:100%;height:auto;margin:0;"
  />
</div>
`.trim();

const normalizeInteractiveMatch = (
  tagName: string,
  attrs: string,
  innerContent: string,
) => {
  if (tagName === "a" || tagName === "button" || tagName === "form") {
    return innerContent;
  }

  const typeMatch = attrs.match(typeAttributePattern);
  const valueMatch = attrs.match(valueAttributePattern);
  const placeholderMatch = attrs.match(placeholderAttributePattern);
  const ariaLabelMatch = attrs.match(ariaLabelAttributePattern);
  const inputType = typeMatch?.[2]?.toLowerCase() ?? "text";
  const label =
    valueMatch?.[2]?.trim() || placeholderMatch?.[2]?.trim() || ariaLabelMatch?.[2]?.trim();

  if (inputType === "hidden") {
    return "";
  }

  if (inputType === "submit" || inputType === "button") {
    return label ?? "";
  }

  return label ? `<span>${label}</span>` : "";
};

const normalizeTrainingPageContent = (html: string) => {
  let normalizedHtml = stripUnsafeTemplateHtml(html);

  interactiveTagPattern.lastIndex = 0;

  while (interactiveTagPattern.test(normalizedHtml)) {
    interactiveTagPattern.lastIndex = 0;
    normalizedHtml = normalizedHtml.replace(interactiveTagPattern, (match, tagName, innerContent = "") => {
      if (typeof tagName === "string") {
        return normalizeInteractiveMatch(tagName.toLowerCase(), "", innerContent);
      }

      const inputMatch = match.match(/^<input\b([^>]*)\/?>$/i);

      if (!inputMatch) {
        return innerContent;
      }

      return normalizeInteractiveMatch("input", inputMatch[1] ?? "", "");
    });
    interactiveTagPattern.lastIndex = 0;
  }

  return normalizedHtml;
};

const extractDocumentStyleTags = (html: string) =>
  Array.from(html.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi))
    .map((match) => match[0])
    .join("\n");

const rewriteReferenceStyleSelectors = (styleTags: string) =>
  styleTags.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (_match, attrs: string, css: string) => {
    const rewrittenCss = css
      .replace(/\bhtml\s*,\s*body\b/gi, `[${TRAINING_PAGE_REFERENCE_ROOT_ATTR}]`)
      .replace(/\bbody\s*,\s*html\b/gi, `[${TRAINING_PAGE_REFERENCE_ROOT_ATTR}]`)
      .replace(/\b(?:html|body|:root)\b/gi, `[${TRAINING_PAGE_REFERENCE_ROOT_ATTR}]`);

    return `<style${attrs}>${rewrittenCss}</style>`;
  });

const normalizeTrainingPageReferenceHtml = (html: string) => {
  const bodyMatch = html.match(/<body\b([^>]*)>([\s\S]*?)<\/body>/i);
  const styleTags = rewriteReferenceStyleSelectors(extractDocumentStyleTags(html).trim());

  if (bodyMatch) {
    const rawBodyAttributes = (bodyMatch[1] ?? "").trim();
    const bodyInnerHtml = (bodyMatch[2] ?? "").trim();
    const normalizedBodyAttributes = rawBodyAttributes.length > 0 ? ` ${rawBodyAttributes}` : "";
    const bodyWrapper = `<div ${TRAINING_PAGE_REFERENCE_ROOT_ATTR}${normalizedBodyAttributes}>${bodyInnerHtml}</div>`;

    const combinedHtml = [styleTags, bodyWrapper].filter((part) => part.length > 0).join("\n");
    return stripUnsafeTemplateHtml(combinedHtml).trim();
  }

  const extractedHtml = extractBodyHtml(html);
  const baseHtml = extractedHtml.trim().length > 0 ? extractedHtml : html;
  const combinedHtml = [
    styleTags,
    `<div ${TRAINING_PAGE_REFERENCE_ROOT_ATTR}>${baseHtml}</div>`,
  ]
    .filter((part) => part.length > 0)
    .join("\n");

  return stripUnsafeTemplateHtml(combinedHtml).trim();
};

const resolveExactReferenceContent = (attachment?: TemplateAiReferenceAttachment) => {
  if (!attachment) {
    return null;
  }

  if (attachment.kind === "html") {
    return normalizeTrainingPageReferenceHtml(attachment.textContent ?? "");
  }

  if (attachment.kind === "image" && attachment.base64Data) {
    return buildReferenceImageHtml(attachment);
  }

  return null;
};

const trainingPageAiRetryDelaysMs = [700, 1400];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createTrainingPageAiServiceError = (args: TrainingPageAiServiceErrorArgs) =>
  new TrainingPageAiServiceError(args);

const parseGeminiErrorPayload = (rawText: string, fallbackStatus: number) => {
  const normalizedText = rawText.trim();

  if (!normalizedText) {
    return {
      status: fallbackStatus,
      message: "",
      errorStatus: "",
    };
  }

  try {
    const parsed = JSON.parse(normalizedText) as GeminiApiErrorPayload;

    return {
      status: parsed.error?.code ?? fallbackStatus,
      message: parsed.error?.message?.trim() ?? normalizedText,
      errorStatus: parsed.error?.status?.trim() ?? "",
    };
  } catch {
    return {
      status: fallbackStatus,
      message: normalizedText,
      errorStatus: "",
    };
  }
};

const createGeminiApiError = (responseStatus: number, rawText: string) => {
  const { status, message, errorStatus } = parseGeminiErrorPayload(rawText, responseStatus);
  const isHighDemand =
    status === 429 ||
    status === 503 ||
    errorStatus === "UNAVAILABLE" ||
    /high demand|try again later/i.test(message);

  if (isHighDemand) {
    return createTrainingPageAiServiceError({
      status: 503,
      code: "gemini_service_unavailable",
      message: "AI 훈련안내페이지 생성 요청이 일시적으로 많습니다. 잠시 후 다시 시도하세요.",
      retryable: true,
    });
  }

  if (status >= 500) {
    return createTrainingPageAiServiceError({
      status: 503,
      code: "gemini_service_unavailable",
      message: "AI 훈련안내페이지 생성 서비스가 일시적으로 불안정합니다. 잠시 후 다시 시도하세요.",
      retryable: true,
    });
  }

  if (status >= 400) {
    return createTrainingPageAiServiceError({
      status: 502,
      code: "gemini_api_error",
      message: "AI 훈련안내페이지 생성 요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.",
    });
  }

  return createTrainingPageAiServiceError({
    status: 500,
    code: "training_page_ai_generate_failed",
    message: "AI 훈련안내페이지 생성에 실패했습니다.",
  });
};

const createGeminiNetworkError = () =>
  createTrainingPageAiServiceError({
    status: 503,
    code: "gemini_network_error",
    message: "AI 훈련안내페이지 생성 서비스에 연결하지 못했습니다. 잠시 후 다시 시도하세요.",
    retryable: true,
  });

const createGeminiInvalidResponseError = () =>
  createTrainingPageAiServiceError({
    status: 502,
    code: "gemini_invalid_response",
    message: "AI 훈련안내페이지 생성 응답이 올바르지 않습니다. 잠시 후 다시 시도하세요.",
  });

const resolveGeminiTrainingPageAiModels = () => {
  const configuredModel = process.env.GEMINI_TRAINING_PAGE_AI_MODEL?.trim();
  const models = [
    configuredModel && configuredModel.length > 0 ? configuredModel : DEFAULT_TRAINING_PAGE_AI_MODEL,
    ...GEMINI_TRAINING_PAGE_AI_FALLBACK_MODELS,
  ];

  return Array.from(new Set(models.filter((model) => model.trim().length > 0)));
};

const createProviderApiKeyMissingError = () =>
  createTrainingPageAiServiceError({
    status: 503,
    code: "ai_api_key_missing",
    message:
      "서버에 AI API 키가 설정되지 않았습니다. .env 파일에 ANTHROPIC_API_KEY, OPENAI_API_KEY 또는 GEMINI_API_KEY를 추가한 뒤 서버를 다시 시작하세요.",
  });

const extractJsonText = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    throw new Error("invalid_ai_response");
  }

  const parts = ((payload as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  }).candidates ?? [])[0]?.content?.parts ?? [];

  const text = parts
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("empty_ai_response");
  }

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]?.trim()) {
    return fencedMatch[1].trim();
  }

  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");

  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    return text.slice(jsonStart, jsonEnd + 1).trim();
  }

  return text;
};

const extractOpenAiJsonText = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    throw new Error("invalid_ai_response");
  }

  const content = (payload as OpenAiChatCompletionPayload).choices?.[0]?.message?.content;
  const text = Array.isArray(content)
    ? content
        .map((part) => (part.type === "text" ? part.text ?? "" : ""))
        .join("")
        .trim()
    : String(content ?? "").trim();

  if (!text) {
    throw new Error("empty_ai_response");
  }

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]?.trim()) {
    return fencedMatch[1].trim();
  }

  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");

  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    return text.slice(jsonStart, jsonEnd + 1).trim();
  }

  return text;
};

const extractAnthropicJsonText = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    throw new Error("invalid_ai_response");
  }

  const text = ((payload as AnthropicMessagePayload).content ?? [])
    .map((part) => (part.type === "text" ? part.text ?? "" : ""))
    .join("")
    .trim();

  if (!text) {
    throw new Error("empty_ai_response");
  }

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]?.trim()) {
    return fencedMatch[1].trim();
  }

  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");

  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    return text.slice(jsonStart, jsonEnd + 1).trim();
  }

  return text;
};

const sanitizeCandidate = (
  candidate: Omit<TrainingPageAiCandidate, "id">,
  request: TrainingPageAiRequest,
) => {
  const exactReferenceContent = resolveExactReferenceContent(request.referenceAttachment);
  const normalizedCandidate = {
    ...candidate,
    name: candidate.name.trim(),
    description: candidate.description.trim(),
    content: exactReferenceContent ?? normalizeTrainingPageContent(candidate.content.trim()),
    summary: candidate.summary.trim(),
  };
  const contentIssues = findUnsafeTemplateHtmlIssues(normalizedCandidate.content);

  if (contentIssues.length > 0) {
    throw new Error(contentIssues.join(" "));
  }

  return {
    id: randomUUID(),
    ...normalizedCandidate,
  };
};

const applyReferenceImageFallback = (
  candidate: TrainingPageAiCandidate,
  request: TrainingPageAiRequest,
) => ({
  ...candidate,
  content:
    resolveExactReferenceContent(request.referenceAttachment) ??
    ensureEmbeddedReferenceImage(candidate.content, request.referenceAttachment),
});

const applyReferenceHtmlOverride = (
  candidate: Omit<TrainingPageAiCandidate, "id">,
  request: TrainingPageAiRequest,
) => ({
  ...candidate,
  content: resolveExactReferenceContent(request.referenceAttachment) ?? candidate.content,
});

const normalizeRawTrainingPageAiCandidate = (
  candidate: Partial<Omit<TrainingPageAiCandidate, "id">>,
): Omit<TrainingPageAiCandidate, "id"> => ({
  name: candidate.name ?? "",
  description: candidate.description ?? "",
  content: candidate.content ?? "",
  summary: candidate.summary ?? "",
});

const buildReferenceAttachmentPrompt = (attachment?: TemplateAiReferenceAttachment) => {
  if (!attachment) {
    return `- training page reference attachment: none
- training page generation mode: internal reference-guided generation
- When no uploaded attachment exists, use the following internal reference as the primary structural baseline and adapt its copy, scenario wording, and emphasis to the user's requested tone and extra requirements.
Reference training-page HTML shape:
${defaultTrainingPageReferenceHtml}`;
  }

  if (attachment.kind === "html") {
    return `
- training page reference attachment: ${attachment.name} (${attachment.mimeType})
- training page generation mode: attachment-locked reproduction
- The content field must stay as close as possible to the uploaded HTML's exact wording, sentence order, background colors, text colors, borders, spacing, sizing, and overall structure.
- Prefer preserving the uploaded HTML almost verbatim. Only change the minimum necessary for hard safety constraints.
- Do not rewrite Korean copy, simplify layouts, swap colors, or restyle the page unless required by hard constraints.
- Keep differences to the minimum required for safety restrictions and product constraints.
- If the user's prompt conflicts with the uploaded file, prioritize the uploaded file.
- Do not paraphrase or redesign unless necessary to satisfy hard constraints.

${attachment.textContent}
    `.trim();
  }

  return `
- training page reference attachment: ${attachment.name} (${attachment.mimeType})
- training page generation mode: attachment-locked reproduction
- A reference image for the training page will be attached after this prompt.
- You are the world's best frontend engineer.
- Recreate the uploaded image as a complete single HTML document as close to 100% pixel-perfect as possible.
- Treat the uploaded image as the primary source of truth. Do not drift into unrelated scenarios or generic candidate variations.
- Rebuild the screen with real HTML structure rather than returning the raw image itself.
- Recreate all visible text, buttons, icons, spacing, shadows, colors, and responsive layout as accurately as possible.
- Use Tailwind-style utility composition when helpful, but if script tags or external resources would violate hard constraints, reproduce the same visual result with inline CSS only.
- The result should be ready to paste into a browser and look as close as possible to the uploaded image while still respecting product safety constraints.
- Recreate the uploaded file as closely as possible for layout, spacing, hierarchy, emphasis, and overall appearance.
- Keep differences to the minimum required for safety restrictions and product constraints.
- If the user's prompt conflicts with the uploaded file, prioritize the uploaded file.
- Do not redesign unless necessary to satisfy hard constraints.
  `.trim();
};

const buildGeminiRequestParts = (request: TrainingPageAiRequest) => {
  const parts: Array<
    | { text: string }
    | {
        inlineData: {
          mimeType: string;
          data: string;
        };
      }
  > = [{ text: buildTrainingPageAiPrompt(request) }];

  if (request.referenceAttachment?.kind === "image") {
    const data = request.referenceAttachment.base64Data;
    if (data) {
      parts.push({
        text: "Training page reference image attachment. Use it only for the training page output.",
      });
      parts.push({
        inlineData: {
          mimeType: request.referenceAttachment.mimeType,
          data,
        },
      });
    }
  }

  return parts;
};

const buildOpenAiUserContent = (request: TrainingPageAiRequest) => {
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "auto" } }
  > = [{ type: "text", text: buildTrainingPageAiPrompt(request) }];

  if (request.referenceAttachment?.kind === "image" && request.referenceAttachment.base64Data) {
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${request.referenceAttachment.mimeType};base64,${request.referenceAttachment.base64Data}`,
        detail: "auto",
      },
    });
  }

  return content;
};

const buildAnthropicUserContent = (request: TrainingPageAiRequest) => {
  const content: Array<
    | { type: "text"; text: string }
    | {
        type: "image";
        source: {
          type: "base64";
          media_type: string;
          data: string;
        };
      }
  > = [{ type: "text", text: buildTrainingPageAiPrompt(request) }];

  if (request.referenceAttachment?.kind === "image" && request.referenceAttachment.base64Data) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: request.referenceAttachment.mimeType,
        data: request.referenceAttachment.base64Data,
      },
    });
  }

  return content;
};

const requestGeminiCandidates = async (
  request: TrainingPageAiRequest,
  apiKey: string,
): Promise<{ payload: unknown; model: string }> => {
  let lastError: TrainingPageAiServiceError | null = null;
  const models = resolveGeminiTrainingPageAiModels();

  for (const model of models) {
    for (let attempt = 0; attempt <= trainingPageAiRetryDelaysMs.length; attempt += 1) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: buildGeminiRequestParts(request),
                },
              ],
              generationConfig: {
                temperature: 1,
                topP: 0.95,
                responseMimeType: "application/json",
                responseSchema,
              },
            }),
          },
        );

        if (!response.ok) {
          lastError = createGeminiApiError(response.status, await response.text());
        } else {
          try {
            return {
              payload: await response.json(),
              model,
            };
          } catch {
            throw createGeminiInvalidResponseError();
          }
        }
      } catch (error) {
        if (error instanceof TrainingPageAiServiceError) {
          lastError = error;
        } else {
          lastError = createGeminiNetworkError();
        }
      }

      if (!lastError.retryable) {
        throw lastError;
      }

      if (attempt < trainingPageAiRetryDelaysMs.length) {
        await sleep(trainingPageAiRetryDelaysMs[attempt]);
      }
    }

    console.warn("[training-page-ai] gemini model retry exhausted", {
      model,
      code: lastError?.code ?? null,
      status: lastError?.status ?? null,
    });
  }

  throw lastError ?? createGeminiNetworkError();
};

const requestOpenAiCandidates = async (request: TrainingPageAiRequest, apiKey: string) => {
  let lastError: TrainingPageAiServiceError | null = null;

  for (let attempt = 0; attempt <= trainingPageAiRetryDelaysMs.length; attempt += 1) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model:
            process.env.OPENAI_TRAINING_PAGE_AI_MODEL?.trim() || OPENAI_TRAINING_PAGE_AI_MODEL,
          messages: [
            {
              role: "user",
              content: buildOpenAiUserContent(request),
            },
          ],
          response_format: {
            type: "json_object",
          },
          temperature: 1,
        }),
      });

      if (!response.ok) {
        lastError = createGeminiApiError(response.status, await response.text());
      } else {
        try {
          return await response.json();
        } catch {
          throw createGeminiInvalidResponseError();
        }
      }
    } catch (error) {
      if (error instanceof TrainingPageAiServiceError) {
        lastError = error;
      } else {
        lastError = createGeminiNetworkError();
      }
    }

    if (!lastError.retryable || attempt === trainingPageAiRetryDelaysMs.length) {
      throw lastError;
    }

    await sleep(trainingPageAiRetryDelaysMs[attempt]);
  }

  throw lastError ?? createGeminiNetworkError();
};

const createAnthropicApiError = (responseStatus: number, rawText: string) => {
  const normalizedText = rawText.trim();
  let message = normalizedText;
  let errorType = "";

  if (normalizedText) {
    try {
      const parsed = JSON.parse(normalizedText) as AnthropicMessagePayload;
      message = parsed.error?.message?.trim() ?? normalizedText;
      errorType = parsed.error?.type?.trim() ?? "";
    } catch {
      // Ignore parsing failure and fall back to the raw body.
    }
  }

  const isHighDemand =
    responseStatus === 429 ||
    responseStatus === 503 ||
    responseStatus === 529 ||
    errorType === "overloaded_error" ||
    /overloaded|high demand|try again later/i.test(message);

  if (isHighDemand) {
    return createTrainingPageAiServiceError({
      status: 503,
      code: "anthropic_service_unavailable",
      message: "AI 훈련안내페이지 생성 요청이 일시적으로 많습니다. 잠시 후 다시 시도하세요.",
      retryable: true,
    });
  }

  if (responseStatus >= 500) {
    return createTrainingPageAiServiceError({
      status: 503,
      code: "anthropic_service_unavailable",
      message: "AI 훈련안내페이지 생성 서비스가 일시적으로 불안정합니다. 잠시 후 다시 시도하세요.",
      retryable: true,
    });
  }

  if (responseStatus >= 400) {
    return createTrainingPageAiServiceError({
      status: 502,
      code: "anthropic_api_error",
      message: "AI 훈련안내페이지 생성 요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.",
    });
  }

  return createTrainingPageAiServiceError({
    status: 500,
    code: "training_page_ai_generate_failed",
    message: "AI 훈련안내페이지 생성에 실패했습니다.",
  });
};

const createAnthropicNetworkError = () =>
  createTrainingPageAiServiceError({
    status: 503,
    code: "anthropic_network_error",
    message: "AI 훈련안내페이지 생성 서비스에 연결하지 못했습니다. 잠시 후 다시 시도하세요.",
    retryable: true,
  });

const createAnthropicInvalidResponseError = () =>
  createTrainingPageAiServiceError({
    status: 502,
    code: "anthropic_invalid_response",
    message: "AI 훈련안내페이지 생성 응답이 올바르지 않습니다. 잠시 후 다시 시도하세요.",
    retryable: true,
  });

const requestAnthropicCandidates = async (request: TrainingPageAiRequest, apiKey: string) => {
  let lastError: TrainingPageAiServiceError | null = null;

  for (let attempt = 0; attempt <= trainingPageAiRetryDelaysMs.length; attempt += 1) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model:
            process.env.ANTHROPIC_TRAINING_PAGE_AI_MODEL?.trim() ||
            ANTHROPIC_TRAINING_PAGE_AI_MODEL,
          max_tokens: 8192,
          messages: [
            {
              role: "user",
              content: buildAnthropicUserContent(request),
            },
          ],
        }),
      });

      if (!response.ok) {
        lastError = createAnthropicApiError(response.status, await response.text());
      } else {
        try {
          const payload = await response.json();
          const text = extractAnthropicJsonText(payload);

          JSON.parse(text);

          return payload;
        } catch (error) {
          if (error instanceof TrainingPageAiServiceError) {
            throw error;
          }
          throw createAnthropicInvalidResponseError();
        }
      }
    } catch (error) {
      if (error instanceof TrainingPageAiServiceError) {
        lastError = error;
      } else {
        lastError = createAnthropicNetworkError();
      }
    }

    if (!lastError.retryable || attempt === trainingPageAiRetryDelaysMs.length) {
      throw lastError;
    }

    await sleep(trainingPageAiRetryDelaysMs[attempt]);
  }

  throw lastError ?? createAnthropicNetworkError();
};

export const buildTrainingPageAiPrompt = (request: TrainingPageAiRequest) => {
  const toneText = buildTrainingPageAiToneText(request);
  const mandatoryGuidance = buildTrainingPageAiMandatoryGuidance();
  const hasReferenceAttachment = Boolean(request.referenceAttachment);
  const attachmentText = buildReferenceAttachmentPrompt(request.referenceAttachment);
  const preservedText =
    request.preservedCandidates.length > 0
      ? `Preserved candidates:\n${request.preservedCandidates
          .map((item, index) => `${index + 1}. name: ${item.name}`)
          .join("\n")}\nAvoid generating results that are too similar to these preserved candidates.`
      : "There are no preserved candidates.";

  return `
You are generating phishing training landing page drafts for a security awareness product.
Write the contents in Korean, but return JSON only.

Rules:
- Generate exactly ${request.generateCount} candidate pages.
- Each candidate must contain name, description, content, and summary.
- name should be a concise Korean page title that can be used directly as the training page name.
- content must be a complete training-page HTML string for this product and may include inline CSS or style tags.
- The page must clearly explain that the user has reached a phishing simulation or security training notice page.
- If no attachment is provided, build the output from the internal reference baseline while adapting it to the user's requested tone and extra requirements.
- If an attachment is provided, reproduce the uploaded file as closely as possible and use the user's inputs only as secondary guidance where they do not conflict with the uploaded file.
- If the attachment is HTML, preserve the uploaded HTML's wording, sentence order, background colors, text colors, borders, spacing, block order, and visible structure as closely as possible.
- Do not use JavaScript, external CSS, external scripts, or external images/resources.
- Inline CSS and style tags are allowed.
- Do not render the page as a fixed-position modal, dialog, or overlay.
- Do not include links, anchor tags, buttons, or any click-inducing CTA element.
- summary should be a one-line differentiator shown under the page name.
- Make the result feel plausible and realistic enough to resemble an actual internal training or notice page.
- The page should feel like a calm post-training explanation screen with clear guidance and scenario-specific wording.
- Follow the requested tone for headings and body copy while keeping the page educational and reassuring.
- {{SUBMIT_URL}} is not required for training-page output.
- When attachment-locked reproduction applies, preserve the uploaded file's design and copy as much as possible.
- Only change wording, structure, or styling when required by hard constraints.

Generation inputs:
- tone: ${toneText}
- extra requirements: ${request.prompt || "none"}

Global generation mode:
- ${hasReferenceAttachment ? "attachment-assisted generation with attachment-locked reproduction" : "internal-reference-guided generation without uploaded reference attachment"}

Mandatory safety guidance:
- scenario label: ${mandatoryGuidance.topicLabel}
${mandatoryGuidance.lines.map((line) => `- ${line}`).join("\n")}

Reference attachment:
${attachmentText}

Variation instructions:
${preservedText}

JSON format:
{
  "candidates": [
    {
      "name": "string",
      "description": "string",
      "content": "string",
      "summary": "string"
    }
  ]
}
  `.trim();
};

const estimateCreditsFromUsage = (usage: GeminiUsageMetadata) => {
  const promptTokenCount = usage.promptTokenCount ?? 0;
  const candidatesTokenCount = usage.candidatesTokenCount ?? 0;
  const totalTokenCount = usage.totalTokenCount ?? promptTokenCount + candidatesTokenCount;
  const estimatedCostUsd =
    promptTokenCount * (0.1 / 1_000_000) + candidatesTokenCount * (0.4 / 1_000_000);

  return {
    promptTokenCount,
    candidatesTokenCount,
    totalTokenCount,
    estimatedCredits: Math.max(1, Math.ceil(estimatedCostUsd / 0.001)),
  };
};

export async function generateTrainingPageAiCandidates(
  request: TrainingPageAiRequest,
  options?: {
    providerApiKeys?: TrainingPageAiProviderApiKeys;
  },
): Promise<GenerateTrainingPageAiResult> {
  const providerApiKeys = options?.providerApiKeys;
  const anthropicApiKey = providerApiKeys
    ? providerApiKeys.anthropicApiKey?.trim()
    : process.env.ANTHROPIC_API_KEY?.trim() || process.env.CLAUDE_API_KEY?.trim();
  const openAiApiKey = providerApiKeys
    ? providerApiKeys.openAiApiKey?.trim()
    : process.env.OPENAI_API_KEY?.trim();
  const geminiApiKey = providerApiKeys
    ? providerApiKeys.geminiApiKey?.trim()
    : process.env.GEMINI_API_KEY?.trim();

  if (!anthropicApiKey && !openAiApiKey && !geminiApiKey) {
    throw createProviderApiKeyMissingError();
  }

  const provider = anthropicApiKey ? "anthropic" : openAiApiKey ? "openai" : "gemini";
  const geminiResult =
    provider === "gemini" ? await requestGeminiCandidates(request, geminiApiKey as string) : null;
  const payload =
    provider === "anthropic"
      ? await requestAnthropicCandidates(request, anthropicApiKey as string)
      : provider === "openai"
        ? await requestOpenAiCandidates(request, openAiApiKey as string)
        : geminiResult?.payload;
  const responseModel =
    provider === "anthropic"
      ? process.env.ANTHROPIC_TRAINING_PAGE_AI_MODEL?.trim() ||
        ANTHROPIC_TRAINING_PAGE_AI_MODEL
      : provider === "openai"
        ? process.env.OPENAI_TRAINING_PAGE_AI_MODEL?.trim() || OPENAI_TRAINING_PAGE_AI_MODEL
        : geminiResult?.model ?? DEFAULT_TRAINING_PAGE_AI_MODEL;

  try {
    const text =
      provider === "anthropic"
        ? extractAnthropicJsonText(payload)
        : provider === "openai"
          ? extractOpenAiJsonText(payload)
          : extractJsonText(payload);
    const parsed = JSON.parse(text) as {
      candidates?: Array<Partial<Omit<TrainingPageAiCandidate, "id">>>;
    };
    const rawCandidates = parsed.candidates ?? [];
    const candidates = rawCandidates.slice(0, request.generateCount).flatMap((candidate) => {
      try {
        const candidateWithHtmlOverride = applyReferenceHtmlOverride(
          normalizeRawTrainingPageAiCandidate(candidate),
          request,
        );
        return [
          applyReferenceImageFallback(sanitizeCandidate(candidateWithHtmlOverride, request), request),
        ];
      } catch {
        return [];
      }
    });

    if (candidates.length === 0) {
      throw new Error("candidate_count_missing");
    }

    const usage = estimateCreditsFromUsage(
      provider === "anthropic"
        ? {
            promptTokenCount: (payload as AnthropicMessagePayload).usage?.input_tokens ?? 0,
            candidatesTokenCount: (payload as AnthropicMessagePayload).usage?.output_tokens ?? 0,
            totalTokenCount:
              ((payload as AnthropicMessagePayload).usage?.input_tokens ?? 0) +
              ((payload as AnthropicMessagePayload).usage?.output_tokens ?? 0),
          }
        : provider === "openai"
        ? {
            promptTokenCount: (payload as OpenAiChatCompletionPayload).usage?.prompt_tokens ?? 0,
            candidatesTokenCount:
              (payload as OpenAiChatCompletionPayload).usage?.completion_tokens ?? 0,
            totalTokenCount: (payload as OpenAiChatCompletionPayload).usage?.total_tokens ?? 0,
          }
        : (payload as { usageMetadata?: GeminiUsageMetadata }).usageMetadata ?? {},
    );

    return {
      candidates,
      usage: {
        ...usage,
        model: responseModel,
      },
    };
  } catch (error) {
    if (error instanceof TrainingPageAiServiceError) {
      throw error;
    }

    throw provider === "anthropic"
      ? createAnthropicInvalidResponseError()
      : createGeminiInvalidResponseError();
  }
}
