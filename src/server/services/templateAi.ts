import { randomUUID } from "node:crypto";
import { neutralizePreviewModalHtml } from "@/lib/templatePreview";
import {
  DEFAULT_TEMPLATE_AI_MODEL,
  TEMPLATE_AI_FIXED_CREDIT_COST,
  type TemplateAiCandidate,
  type TemplateAiRequest,
  type TemplateAiReferenceAttachment,
  findUnsafeTemplateHtmlIssues,
  resolveTemplateAiTopicText,
  templateAiDifficultyLabels,
  templateAiToneLabels,
} from "@shared/templateAi";
import { normalizeTrainingUrlPlaceholders } from "@shared/templateTokens";

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

type GenerateTemplateAiResult = {
  candidates: TemplateAiCandidate[];
  usage: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
    estimatedCredits: number;
    model: string;
  };
};

type TemplateAiProviderApiKeys = {
  anthropicApiKey?: string;
  openAiApiKey?: string;
  geminiApiKey?: string;
};

type ProviderRequestResult = {
  payload: unknown;
  model: string;
  provider: "anthropic" | "openai" | "gemini";
};

type GeminiApiErrorPayload = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

type TemplateAiServiceErrorArgs = {
  status: number;
  code: string;
  message: string;
  retryable?: boolean;
};

export class TemplateAiServiceError extends Error {
  status: number;
  code: string;
  retryable: boolean;

  constructor({ status, code, message, retryable = false }: TemplateAiServiceErrorArgs) {
    super(message);
    this.name = "TemplateAiServiceError";
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
          subject: { type: "STRING" },
          body: { type: "STRING" },
          maliciousPageContent: { type: "STRING" },
          summary: { type: "STRING" },
        },
        required: ["subject", "body", "maliciousPageContent", "summary"],
      },
    },
  },
  required: ["candidates"],
};
const OPENAI_TEMPLATE_AI_MODEL = "gpt-4.1-mini";
const ANTHROPIC_TEMPLATE_AI_MODEL = "claude-sonnet-4-20250514";
const GEMINI_TEMPLATE_AI_FALLBACK_MODELS = ["gemini-2.5-flash"] as const;

const defaultMailBodyReferenceHtml = `
<div style="max-width:600px;margin:0 auto;padding:32px;border:1px solid #e5e7eb;border-radius:16px;background:#ffffff;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#111827;">
  <p style="margin:0 0 16px;font-size:14px;line-height:1.7;">안녕하세요. 사내 시스템 운영팀입니다.</p>
  <p style="margin:0 0 20px;font-size:14px;line-height:1.7;">업무 확인이 필요한 항목이 접수되어 안내드립니다. 아래 버튼에서 상세 내용을 확인해 주세요.</p>
  <div style="margin:24px 0;text-align:center;">
    <a href="{{LANDING_URL}}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;">상세 내용 확인</a>
  </div>
</div>
`.trim();

const defaultMaliciousPageReferenceHtml = `
<div style="max-width:420px;margin:48px auto;padding:32px;border:1px solid #e5e7eb;border-radius:20px;background:#ffffff;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
  <h1 style="margin:0 0 12px;font-size:24px;color:#111827;">계정 확인</h1>
  <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#4b5563;">안전한 이용을 위해 정보를 다시 입력해 주세요.</p>
  <form action="{{TRAINING_URL}}" method="get" style="display:grid;gap:12px;">
    <input name="email" placeholder="이메일" style="padding:12px 14px;border:1px solid #d1d5db;border-radius:10px;" />
    <input name="password" type="password" placeholder="비밀번호" style="padding:12px 14px;border:1px solid #d1d5db;border-radius:10px;" />
    <button type="submit" style="padding:12px 14px;border:none;border-radius:10px;background:#2563eb;color:#ffffff;font-weight:700;">확인</button>
  </form>
</div>
`.trim();

const templateAiRetryDelaysMs = [700, 1400];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createTemplateAiServiceError = (args: TemplateAiServiceErrorArgs) =>
  new TemplateAiServiceError(args);

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
    return createTemplateAiServiceError({
      status: 503,
      code: "gemini_service_unavailable",
      message: "AI 템플릿 생성 요청이 일시적으로 많습니다. 잠시 후 다시 시도하세요.",
      retryable: true,
    });
  }

  if (status >= 500) {
    return createTemplateAiServiceError({
      status: 503,
      code: "gemini_service_unavailable",
      message: "AI 템플릿 생성 서비스가 일시적으로 불안정합니다. 잠시 후 다시 시도하세요.",
      retryable: true,
    });
  }

  if (status >= 400) {
    return createTemplateAiServiceError({
      status: 502,
      code: "gemini_api_error",
      message: "AI 템플릿 생성 요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.",
    });
  }

  return createTemplateAiServiceError({
    status: 500,
    code: "template_ai_generate_failed",
    message: "AI 템플릿 생성에 실패했습니다.",
  });
};

const createGeminiNetworkError = () =>
  createTemplateAiServiceError({
    status: 503,
    code: "gemini_network_error",
    message: "AI 템플릿 생성 서비스에 연결하지 못했습니다. 잠시 후 다시 시도하세요.",
    retryable: true,
  });

const createGeminiInvalidResponseError = () =>
  createTemplateAiServiceError({
    status: 502,
    code: "gemini_invalid_response",
    message: "AI 템플릿 생성 응답이 올바르지 않습니다. 잠시 후 다시 시도하세요.",
    retryable: true,
  });

const resolveGeminiTemplateAiModels = () => {
  const configuredModel = process.env.GEMINI_TEMPLATE_AI_MODEL?.trim();
  const models = [
    configuredModel && configuredModel.length > 0 ? configuredModel : DEFAULT_TEMPLATE_AI_MODEL,
    ...GEMINI_TEMPLATE_AI_FALLBACK_MODELS,
  ];

  return Array.from(new Set(models.filter((model) => model.trim().length > 0)));
};

const buildInvalidAiPayloadDebugSnippet = (payload: unknown) => {
  try {
    const serialized = JSON.stringify(payload);
    return serialized.length > 1200 ? `${serialized.slice(0, 1200)}...` : serialized;
  } catch {
    return String(payload);
  }
};

const createProviderApiKeyMissingError = () =>
  createTemplateAiServiceError({
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

const trainingSubmitTargetPattern =
  /<form\b[^>]*\baction=["']?\s*\{\{\s*TRAINING_URL\s*\}\}\s*["']?[^>]*>|<(?:button|input)\b[^>]*\bformaction=["']?\s*\{\{\s*TRAINING_URL\s*\}\}\s*["']?[^>]*>/i;
const landingTokenPattern = /\{\{\s*LANDING_URL\s*\}\}/i;
const anchorHrefMatcher = /<a\b([^>]*?)\bhref=(["'])(.*?)\2([^>]*)>/i;
const formOpenTagMatcher = /<form\b([^>]*)>/i;
const formActionMatcher = /\baction\s*=\s*(["'])(.*?)\1/i;
const formCloseTagMatcher = /<\/form>/i;
const submitButtonPattern =
  /<button[\s\S]*?type=["']?submit["']?[\s\S]*?>|<input[\s\S]*?type=["']?submit["']?[\s\S]*?>/i;

const buildFallbackTrainingSubmitForm = () =>
  '<form action="{{TRAINING_URL}}" method="get" style="margin:16px 0;"><button type="submit" style="padding:10px 16px; border-radius:999px; background:#2563eb; color:#ffffff; border:none; font-weight:600;">확인</button></form>';
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
      (_match, attrName) => {
        if (String(attrName).toLowerCase() === "href") {
          return ' href="#"';
        }

        return "";
      },
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

const ensureLandingTokenInBody = (html: string) => {
  const safeHtml = stripUnsafeTemplateHtml(html);

  if (landingTokenPattern.test(safeHtml)) {
    return safeHtml;
  }

  if (anchorHrefMatcher.test(safeHtml)) {
    return safeHtml.replace(
      anchorHrefMatcher,
      (_match, leading, quote, _href, trailing) =>
        `<a${leading}href=${quote}{{LANDING_URL}}${quote}${trailing}>`,
    );
  }

  return `${safeHtml}${safeHtml.trim().length > 0 ? "\n\n" : ""}<p><a href="{{LANDING_URL}}">문서 확인</a></p>`;
};

const ensureTrainingSubmitPath = (html: string) => {
  const normalizedHtml = stripUnsafeTemplateHtml(normalizeTrainingUrlPlaceholders(html));

  if (trainingSubmitTargetPattern.test(normalizedHtml)) {
    if (submitButtonPattern.test(normalizedHtml) && formOpenTagMatcher.test(normalizedHtml)) {
      return normalizedHtml;
    }
  }

  if (formOpenTagMatcher.test(normalizedHtml)) {
    const withAction = normalizedHtml.replace(formOpenTagMatcher, (match, attrs) => {
      const rawAttrs = (attrs ?? "").trim();
      if (formActionMatcher.test(rawAttrs)) {
        return match.replace(formActionMatcher, 'action="{{TRAINING_URL}}"');
      }
      const normalizedAttrs = rawAttrs.length > 0 ? ` ${rawAttrs}` : "";
      return `<form${normalizedAttrs} action="{{TRAINING_URL}}">`;
    });

    if (submitButtonPattern.test(withAction)) {
      return withAction;
    }

    if (formCloseTagMatcher.test(withAction)) {
      return withAction.replace(
        formCloseTagMatcher,
        '<button type="submit">확인</button></form>',
      );
    }

    return `${withAction}<button type="submit">확인</button></form>`;
  }

  return `${normalizedHtml}${normalizedHtml.trim().length > 0 ? "\n\n" : ""}${buildFallbackTrainingSubmitForm()}`;
};

const sanitizeCandidate = (candidate: Omit<TemplateAiCandidate, "id">) => {
  const normalizedCandidate = {
    ...candidate,
    subject: candidate.subject.trim(),
    body: ensureLandingTokenInBody(candidate.body.trim()),
    maliciousPageContent: ensureTrainingSubmitPath(
      neutralizePreviewModalHtml(candidate.maliciousPageContent).trim(),
    ),
    summary: candidate.summary.trim(),
  };
  const mailIssues = findUnsafeTemplateHtmlIssues(normalizedCandidate.body);
  const maliciousIssues = findUnsafeTemplateHtmlIssues(normalizedCandidate.maliciousPageContent);

  if (mailIssues.length > 0 || maliciousIssues.length > 0) {
    throw new Error([...mailIssues, ...maliciousIssues].join(" "));
  }

  if (!/\{\{\s*LANDING_URL\s*\}\}/i.test(normalizedCandidate.body)) {
    throw new Error("메일본문에는 {{LANDING_URL}}가 포함되어야 합니다.");
  }

  if (!/\{\{\s*TRAINING_URL\s*\}\}/i.test(normalizedCandidate.maliciousPageContent)) {
    throw new Error("악성메일본문에는 {{TRAINING_URL}}가 포함되어야 합니다.");
  }

  if (!/<form[\s\S]*?>/i.test(normalizedCandidate.maliciousPageContent)) {
    throw new Error("악성메일본문에는 입력 폼이 포함되어야 합니다.");
  }

  if (
    !/<button[\s\S]*?type=["']?submit["']?[\s\S]*?>|<input[\s\S]*?type=["']?submit["']?[\s\S]*?>/i.test(
      normalizedCandidate.maliciousPageContent,
    )
  ) {
    throw new Error("악성메일본문에는 제출 버튼이 포함되어야 합니다.");
  }

  if (!trainingSubmitTargetPattern.test(normalizedCandidate.maliciousPageContent)) {
    throw new Error(
      "악성메일본문에는 {{TRAINING_URL}}이 제출 동선(폼 action 또는 submit formaction)에 포함되어야 합니다.",
    );
  }

  return {
    id: randomUUID(),
    ...normalizedCandidate,
  };
};

const applyReferenceImageFallback = (
  candidate: TemplateAiCandidate,
  request: TemplateAiRequest,
) => ({
  ...candidate,
  body: ensureEmbeddedReferenceImage(candidate.body, request.mailBodyReferenceAttachment),
  maliciousPageContent: ensureEmbeddedReferenceImage(
    candidate.maliciousPageContent,
    request.maliciousPageReferenceAttachment,
  ),
});

const applyReferenceHtmlOverride = (
  candidate: Omit<TemplateAiCandidate, "id">,
  request: TemplateAiRequest,
) => ({
  ...candidate,
  body:
    request.mailBodyReferenceAttachment?.kind === "html"
      ? (request.mailBodyReferenceAttachment.textContent ?? "")
      : candidate.body,
  maliciousPageContent:
    request.maliciousPageReferenceAttachment?.kind === "html"
      ? (request.maliciousPageReferenceAttachment.textContent ?? "")
      : candidate.maliciousPageContent,
});

const normalizeRawTemplateAiCandidate = (
  candidate: Partial<Omit<TemplateAiCandidate, "id">>,
): Omit<TemplateAiCandidate, "id"> => ({
  subject: candidate.subject ?? "",
  body: candidate.body ?? "",
  maliciousPageContent: candidate.maliciousPageContent ?? "",
  summary: candidate.summary ?? "",
});

const buildFallbackTemplateCandidate = (
  request: TemplateAiRequest,
): Omit<TemplateAiCandidate, "id"> => {
  const topicText = resolveTemplateAiTopicText(request) || "보안 확인";
  const toneText = templateAiToneLabels[request.tone];
  const difficultyText = templateAiDifficultyLabels[request.difficulty];

  return {
    subject: `${topicText} 확인 안내`,
    body:
      request.mailBodyReferenceAttachment?.kind === "html"
        ? request.mailBodyReferenceAttachment.textContent ?? ""
        : defaultMailBodyReferenceHtml,
    maliciousPageContent:
      request.maliciousPageReferenceAttachment?.kind === "html"
        ? request.maliciousPageReferenceAttachment.textContent ?? ""
        : defaultMaliciousPageReferenceHtml,
    summary: `${toneText} / ${difficultyText} 기본 후보`,
  };
};

const applyTemplateTextFallbacks = (
  candidate: Omit<TemplateAiCandidate, "id">,
  request: TemplateAiRequest,
): Omit<TemplateAiCandidate, "id"> => {
  const fallbackCandidate = buildFallbackTemplateCandidate(request);

  return {
    subject: candidate.subject.trim() || fallbackCandidate.subject,
    body: candidate.body,
    maliciousPageContent: candidate.maliciousPageContent,
    summary: candidate.summary.trim() || fallbackCandidate.summary,
  };
};

const buildReferenceAttachmentPrompt = (
  label: string,
  attachment?: TemplateAiReferenceAttachment,
) => {
  if (!attachment) {
    const referenceHtml =
      label === "mail body" ? defaultMailBodyReferenceHtml : defaultMaliciousPageReferenceHtml;

    return `- ${label} reference attachment: none
- ${label} generation mode: internal reference-guided generation
- When no uploaded attachment exists for this section, use the following internal reference as the primary structural baseline and adapt its copy, scenario details, and emphasis to the user's requested topic, tone, difficulty, and extra requirements.
Reference ${label === "mail body" ? "mail-body" : "malicious-page"} HTML shape:
${referenceHtml}`;
  }

  if (attachment.kind === "html") {
    return `
- ${label} reference attachment: ${attachment.name} (${attachment.mimeType})
- ${label} generation mode: attachment-locked reproduction
- Recreate this ${label} as closely as possible to the uploaded file's wording, structure, block order, hierarchy, spacing intent, and visible content.
- Keep differences to the minimum required for product constraints such as {{LANDING_URL}}, {{TRAINING_URL}}, token replacement, and safety restrictions.
- If the user's prompt conflicts with the uploaded file, prioritize the uploaded file for this section.
- Do not paraphrase or redesign unless necessary to satisfy hard constraints.

${attachment.textContent}
    `.trim();
  }

  return `
- ${label} reference attachment: ${attachment.name} (${attachment.mimeType})
- ${label} generation mode: attachment-locked reproduction
- A reference image for ${label} will be attached after this prompt.
- You are the world's best frontend engineer.
- Recreate the uploaded image as a complete single HTML document as close to 100% pixel-perfect as possible.
- Treat the uploaded image as the primary source of truth. Do not drift into unrelated scenarios or generic candidate variations.
- Rebuild the screen with real HTML structure rather than returning the raw image itself.
- Recreate all visible text, buttons, icons, input fields, spacing, shadows, colors, and responsive layout as accurately as possible.
- Use Tailwind-style utility composition when helpful, but if script tags or external resources would violate hard constraints, reproduce the same visual result with inline CSS only.
- The result should be ready to paste into a browser and look as close as possible to the uploaded image while still respecting product safety constraints.
- Recreate the uploaded file as closely as possible for layout, spacing, hierarchy, component placement, emphasis, and overall appearance.
- Keep differences to the minimum required for product constraints such as {{LANDING_URL}}, {{TRAINING_URL}}, token replacement, and safety restrictions.
- If the user's prompt conflicts with the uploaded file, prioritize the uploaded file for this section.
- Do not redesign unless necessary to satisfy hard constraints.
  `.trim();
};

const buildCurrentDatePromptContext = (now = new Date()) => {
  const currentDate = now.toISOString().slice(0, 10);
  const currentYear = currentDate.slice(0, 4);

  return `
Current date context:
- today: ${currentDate}
- current year: ${currentYear}
- If you mention a specific date or year, align it with this current date context unless the user explicitly requests another period.
- Avoid inserting a year unless it materially helps the scenario.
- Do not mention past years such as 2023 unless the user explicitly asks for historical or legacy content.
- Any deadline, notice window, or dated announcement should feel current for ${currentYear}.
  `.trim();
};

const buildGeminiRequestParts = (request: TemplateAiRequest) => {
  const parts: Array<
    | { text: string }
    | {
        inlineData: {
          mimeType: string;
          data: string;
        };
      }
  > = [{ text: buildTemplateAiPrompt(request) }];

  if (request.mailBodyReferenceAttachment?.kind === "image") {
    const data = request.mailBodyReferenceAttachment.base64Data;
    if (data) {
      parts.push({
        text: "Mail body reference image attachment. Use it only for the mail body output.",
      });
      parts.push({
        inlineData: {
          mimeType: request.mailBodyReferenceAttachment.mimeType,
          data,
        },
      });
    }
  }

  if (request.maliciousPageReferenceAttachment?.kind === "image") {
    const data = request.maliciousPageReferenceAttachment.base64Data;
    if (data) {
      parts.push({
        text: "Malicious page reference image attachment. Use it only for the maliciousPageContent output.",
      });
      parts.push({
        inlineData: {
          mimeType: request.maliciousPageReferenceAttachment.mimeType,
          data,
        },
      });
    }
  }

  return parts;
};

const buildOpenAiUserContent = (request: TemplateAiRequest) => {
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "auto" } }
  > = [{ type: "text", text: buildTemplateAiPrompt(request) }];

  if (
    request.mailBodyReferenceAttachment?.kind === "image" &&
    request.mailBodyReferenceAttachment.base64Data
  ) {
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${request.mailBodyReferenceAttachment.mimeType};base64,${request.mailBodyReferenceAttachment.base64Data}`,
        detail: "auto",
      },
    });
  }

  if (
    request.maliciousPageReferenceAttachment?.kind === "image" &&
    request.maliciousPageReferenceAttachment.base64Data
  ) {
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${request.maliciousPageReferenceAttachment.mimeType};base64,${request.maliciousPageReferenceAttachment.base64Data}`,
        detail: "auto",
      },
    });
  }

  return content;
};

const buildAnthropicUserContent = (request: TemplateAiRequest) => {
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
  > = [{ type: "text", text: buildTemplateAiPrompt(request) }];

  if (
    request.mailBodyReferenceAttachment?.kind === "image" &&
    request.mailBodyReferenceAttachment.base64Data
  ) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: request.mailBodyReferenceAttachment.mimeType,
        data: request.mailBodyReferenceAttachment.base64Data,
      },
    });
  }

  if (
    request.maliciousPageReferenceAttachment?.kind === "image" &&
    request.maliciousPageReferenceAttachment.base64Data
  ) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: request.maliciousPageReferenceAttachment.mimeType,
        data: request.maliciousPageReferenceAttachment.base64Data,
      },
    });
  }

  return content;
};

const requestGeminiCandidates = async (
  request: TemplateAiRequest,
  apiKey: string,
): Promise<{ payload: unknown; model: string }> => {
  let lastError: TemplateAiServiceError | null = null;
  const models = resolveGeminiTemplateAiModels();

  for (const model of models) {
    for (let attempt = 0; attempt <= templateAiRetryDelaysMs.length; attempt += 1) {
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
          const payload = await response.json();
          const text = extractJsonText(payload);

          JSON.parse(text);

          return {
            payload,
            model,
          };
        }
      } catch (error) {
        if (error instanceof TemplateAiServiceError) {
          lastError = error;
        } else if (error instanceof Error && /invalid_ai_response|empty_ai_response|JSON/i.test(error.message)) {
          lastError = createGeminiInvalidResponseError();
        } else {
          lastError = createGeminiNetworkError();
        }
      }

      if (!lastError.retryable) {
        throw lastError;
      }

      if (attempt < templateAiRetryDelaysMs.length) {
        try {
          await sleep(templateAiRetryDelaysMs[attempt]);
        } catch {
          break;
        }
      }
    }

    console.warn("[template-ai] gemini model retry exhausted", {
      model,
      code: lastError?.code ?? null,
      status: lastError?.status ?? null,
    });
  }

  throw lastError ?? createGeminiNetworkError();
};

const requestOpenAiCandidates = async (request: TemplateAiRequest, apiKey: string) => {
  let lastError: TemplateAiServiceError | null = null;

  for (let attempt = 0; attempt <= templateAiRetryDelaysMs.length; attempt += 1) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_TEMPLATE_AI_MODEL?.trim() || OPENAI_TEMPLATE_AI_MODEL,
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
      if (error instanceof TemplateAiServiceError) {
        lastError = error;
      } else {
        lastError = createGeminiNetworkError();
      }
    }

    if (!lastError.retryable || attempt === templateAiRetryDelaysMs.length) {
      throw lastError;
    }

    await sleep(templateAiRetryDelaysMs[attempt]);
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
    return createTemplateAiServiceError({
      status: 503,
      code: "anthropic_service_unavailable",
      message: "AI 템플릿 생성 요청이 일시적으로 많습니다. 잠시 후 다시 시도하세요.",
      retryable: true,
    });
  }

  if (responseStatus >= 500) {
    return createTemplateAiServiceError({
      status: 503,
      code: "anthropic_service_unavailable",
      message: "AI 템플릿 생성 서비스가 일시적으로 불안정합니다. 잠시 후 다시 시도하세요.",
      retryable: true,
    });
  }

  if (responseStatus >= 400) {
    return createTemplateAiServiceError({
      status: 502,
      code: "anthropic_api_error",
      message: "AI 템플릿 생성 요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.",
    });
  }

  return createTemplateAiServiceError({
    status: 500,
    code: "template_ai_generate_failed",
    message: "AI 템플릿 생성에 실패했습니다.",
  });
};

const createAnthropicNetworkError = () =>
  createTemplateAiServiceError({
    status: 503,
    code: "anthropic_network_error",
    message: "AI 템플릿 생성 서비스에 연결하지 못했습니다. 잠시 후 다시 시도하세요.",
    retryable: true,
  });

const createAnthropicInvalidResponseError = () =>
  createTemplateAiServiceError({
    status: 502,
    code: "anthropic_invalid_response",
    message: "AI 템플릿 생성 응답이 올바르지 않습니다. 잠시 후 다시 시도하세요.",
    retryable: true,
  });

const requestAnthropicCandidates = async (request: TemplateAiRequest, apiKey: string) => {
  let lastError: TemplateAiServiceError | null = null;

  for (let attempt = 0; attempt <= templateAiRetryDelaysMs.length; attempt += 1) {
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
            process.env.ANTHROPIC_TEMPLATE_AI_MODEL?.trim() || ANTHROPIC_TEMPLATE_AI_MODEL,
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
        const payload = await response.json();
        const text = extractAnthropicJsonText(payload);

        JSON.parse(text);

        return payload;
      }
    } catch (error) {
      if (error instanceof TemplateAiServiceError) {
        lastError = error;
      } else if (error instanceof Error && /invalid_ai_response|empty_ai_response|JSON/i.test(error.message)) {
        lastError = createAnthropicInvalidResponseError();
      } else {
        lastError = createAnthropicNetworkError();
      }
    }

    if (!lastError.retryable || attempt === templateAiRetryDelaysMs.length) {
      throw lastError;
    }

    await sleep(templateAiRetryDelaysMs[attempt]);
  }

  throw lastError ?? createAnthropicNetworkError();
};

export const buildTemplateAiPrompt = (request: TemplateAiRequest) => {
  const topicText = resolveTemplateAiTopicText(request);
  const toneText = templateAiToneLabels[request.tone];
  const difficultyText = templateAiDifficultyLabels[request.difficulty];
  const currentDateContext = buildCurrentDatePromptContext();
  const hasAnyReferenceAttachment = Boolean(
    request.mailBodyReferenceAttachment || request.maliciousPageReferenceAttachment,
  );
  const attachmentText = [
    buildReferenceAttachmentPrompt("mail body", request.mailBodyReferenceAttachment),
    buildReferenceAttachmentPrompt(
      "malicious page",
      request.maliciousPageReferenceAttachment,
    ),
  ].join("\n");
  const preservedText =
    request.preservedCandidates.length > 0
      ? `Preserved candidates:\n${request.preservedCandidates
          .map((item, index) => `${index + 1}. subject: ${item.subject}`)
          .join("\n")}\nAvoid generating results that are too similar to these preserved candidates.`
      : "There are no preserved candidates.";

  return `
You are generating phishing simulation template drafts for a security training product.
Write the contents in Korean, but return JSON only.

Rules:
- Generate exactly ${request.generateCount} candidate sets.
- Each candidate set must contain both a mail body and a malicious landing page that share the same topic and tone.
- The mail body must include a subject, content, and a CTA link or button.
- Every clickable CTA in the mail body must point to {{LANDING_URL}}.
- The malicious page must be a static landing page with a form and a submit button.
- The malicious page must redirect or submit to {{TRAINING_URL}} after submission.
- The main submit CTA in the malicious page must route to {{TRAINING_URL}} via form action or submit formaction.
- Do not add a separate standalone training guide link unless the user explicitly asks for it.
- If no attachment is provided for a section, build that section from the internal reference baseline while adapting it to the user's requested topic, tone, difficulty, and extra requirements.
- If an attachment is provided for a section, reproduce that section as closely as possible to the uploaded file and use the user's inputs only as secondary guidance where they do not conflict with the uploaded file.
- Do not use JavaScript, external CSS, external scripts, or external images/resources.
- Do not render the malicious page as a fixed-position modal, dialog, or overlay.
- Inline CSS and style tags are allowed.
- body must be a complete mail-body HTML string for this product and may include inline CSS or style tags.
- maliciousPageContent must be a complete malicious-page HTML string for this product and may include inline CSS or style tags.
- summary should be a one-line differentiator shown under the subject.
- Make the result feel plausible and realistic enough to resemble an actual phishing scenario inside a company context.
- body should feel like a realistic operational notice email with a clear scenario, concise urgency, and one convincing CTA.
- maliciousPageContent should feel like a realistic destination page for that scenario, with inputs and submit flow that match the requested topic and difficulty.
- For maliciousPageContent, prefer a form action that points to {{TRAINING_URL}}.
- When attachment-locked reproduction applies, preserve the uploaded file's design and copy as much as possible.
- Only change wording, structure, or styling when required by hard constraints or missing token integration.

Generation inputs:
- topic: ${topicText}
- tone: ${toneText}
- difficulty: ${difficultyText}
- extra requirements: ${request.prompt || "none"}

Global generation mode:
- ${hasAnyReferenceAttachment ? "attachment-assisted generation with attachment-locked reproduction for uploaded sections" : "internal-reference-guided generation without uploaded section references"}

Reference attachments:
${attachmentText}

Variation instructions:
${preservedText}

${currentDateContext}

JSON format:
{
  "candidates": [
    {
      "subject": "string",
      "body": "string",
      "maliciousPageContent": "string",
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

  return {
    promptTokenCount,
    candidatesTokenCount,
    totalTokenCount,
    estimatedCredits: TEMPLATE_AI_FIXED_CREDIT_COST,
  };
};

const extractUsageFromPayload = (
  payload: unknown,
  provider: "anthropic" | "openai" | "gemini",
): GeminiUsageMetadata => {
  if (provider === "openai") {
    return {
      promptTokenCount: (payload as OpenAiChatCompletionPayload).usage?.prompt_tokens ?? 0,
      candidatesTokenCount: (payload as OpenAiChatCompletionPayload).usage?.completion_tokens ?? 0,
      totalTokenCount: (payload as OpenAiChatCompletionPayload).usage?.total_tokens ?? 0,
    };
  }

  if (provider === "anthropic") {
    const anthropicUsage = (payload as AnthropicMessagePayload).usage;
    const promptTokenCount = anthropicUsage?.input_tokens ?? 0;
    const candidatesTokenCount = anthropicUsage?.output_tokens ?? 0;

    return {
      promptTokenCount,
      candidatesTokenCount,
      totalTokenCount: promptTokenCount + candidatesTokenCount,
    };
  }

  return (payload as { usageMetadata?: GeminiUsageMetadata }).usageMetadata ?? {};
};

const mergeUsageMetadata = (
  accumulated: GeminiUsageMetadata,
  current: GeminiUsageMetadata,
): GeminiUsageMetadata => ({
  promptTokenCount: (accumulated.promptTokenCount ?? 0) + (current.promptTokenCount ?? 0),
  candidatesTokenCount:
    (accumulated.candidatesTokenCount ?? 0) + (current.candidatesTokenCount ?? 0),
  totalTokenCount: (accumulated.totalTokenCount ?? 0) + (current.totalTokenCount ?? 0),
});

const parseTemplateCandidatesFromPayload = (
  payload: unknown,
  request: TemplateAiRequest,
  provider: "anthropic" | "openai" | "gemini",
) => {
  const text =
    provider === "openai"
      ? extractOpenAiJsonText(payload)
      : provider === "anthropic"
        ? extractAnthropicJsonText(payload)
        : extractJsonText(payload);
  const parsed = JSON.parse(text) as {
    candidates?: Array<Partial<Omit<TemplateAiCandidate, "id">>>;
  };
  const rawCandidates = parsed.candidates ?? [];

  return rawCandidates.slice(0, request.generateCount).flatMap((candidate) => {
    try {
      const candidateWithHtmlOverride = applyReferenceHtmlOverride(
        normalizeRawTemplateAiCandidate(candidate),
        request,
      );
      const candidateWithTextFallbacks = applyTemplateTextFallbacks(
        candidateWithHtmlOverride,
        request,
      );
      return [applyReferenceImageFallback(sanitizeCandidate(candidateWithTextFallbacks), request)];
    } catch {
      return [];
    }
  });
};

const requestTemplateAiPayload = async (
  request: TemplateAiRequest,
  anthropicApiKey: string | undefined,
  openAiApiKey: string | undefined,
  geminiApiKey: string | undefined,
): Promise<ProviderRequestResult> => {
  if (anthropicApiKey) {
    return {
      payload: await requestAnthropicCandidates(request, anthropicApiKey),
      model:
        process.env.ANTHROPIC_TEMPLATE_AI_MODEL?.trim() || ANTHROPIC_TEMPLATE_AI_MODEL,
      provider: "anthropic",
    };
  }

  if (openAiApiKey) {
    return {
      payload: await requestOpenAiCandidates(request, openAiApiKey),
      model: process.env.OPENAI_TEMPLATE_AI_MODEL?.trim() || OPENAI_TEMPLATE_AI_MODEL,
      provider: "openai",
    };
  }

  const result = await requestGeminiCandidates(request, geminiApiKey as string);
  return {
    ...result,
    provider: "gemini",
  };
};

export async function generateTemplateAiCandidates(
  request: TemplateAiRequest,
  options?: {
    providerApiKeys?: TemplateAiProviderApiKeys;
  },
): Promise<GenerateTemplateAiResult> {
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

  let candidates: TemplateAiCandidate[] = [];
  let usageMetadata: GeminiUsageMetadata = {};
  let lastPayload: unknown = null;
  let responseModel =
    process.env.ANTHROPIC_TEMPLATE_AI_MODEL?.trim() ||
    process.env.OPENAI_TEMPLATE_AI_MODEL?.trim() ||
    DEFAULT_TEMPLATE_AI_MODEL;
  let responseProvider: "anthropic" | "openai" | "gemini" = anthropicApiKey
    ? "anthropic"
    : openAiApiKey
      ? "openai"
      : "gemini";
  const maxSupplementalRounds = 1;

  try {
    for (let round = 0; round <= maxSupplementalRounds; round += 1) {
      const remainingCount = request.generateCount - candidates.length;
      if (remainingCount <= 0) {
        break;
      }

      const roundRequest: TemplateAiRequest =
        round === 0
          ? request
          : {
              ...request,
              generateCount: remainingCount,
              preservedCandidates: [
                ...request.preservedCandidates,
                ...candidates.map((candidate) => ({
                  id: candidate.id,
                  subject: candidate.subject,
                })),
              ].slice(0, 3),
            };

      const { payload, model, provider } = await requestTemplateAiPayload(
        roundRequest,
        anthropicApiKey,
        openAiApiKey,
        geminiApiKey,
      );
      lastPayload = payload;
      responseModel = model;
      responseProvider = provider;
      usageMetadata = mergeUsageMetadata(
        usageMetadata,
        extractUsageFromPayload(payload, provider),
      );
      const nextCandidates = parseTemplateCandidatesFromPayload(
        payload,
        roundRequest,
        provider,
      );

      for (const candidate of nextCandidates) {
        if (
          candidates.some(
            (existing) =>
              existing.subject === candidate.subject &&
              existing.summary === candidate.summary,
          )
        ) {
          continue;
        }
        candidates.push(candidate);
        if (candidates.length >= request.generateCount) {
          break;
        }
      }
    }

    if (candidates.length === 0) {
      try {
        candidates = [
          applyReferenceImageFallback(
            sanitizeCandidate(buildFallbackTemplateCandidate(request)),
            request,
          ),
        ];
      } catch {
        throw new Error("candidate_count_missing");
      }
    }

    const usage = estimateCreditsFromUsage(usageMetadata);

    return {
      candidates,
      usage: {
        ...usage,
        model: responseModel,
      },
    };
  } catch (error) {
    if (error instanceof TemplateAiServiceError) {
      throw error;
    }

    console.error("[template-ai] invalid provider response", {
      provider: responseProvider,
      model: responseModel,
      reason: error instanceof Error ? error.message : "unknown_error",
      payload: buildInvalidAiPayloadDebugSnippet(lastPayload),
    });

    throw createGeminiInvalidResponseError();
  }
}
