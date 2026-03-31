import { beforeEach, describe, expect, it, vi } from "vitest";

const generateTrainingPageAiCandidatesMock = vi.hoisted(() => vi.fn());
const executeWithAiCreditGateMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/services/trainingPageAi", async () => {
  const actual = await vi.importActual<typeof import("@/server/services/trainingPageAi")>(
    "@/server/services/trainingPageAi",
  );

  return {
    ...actual,
    generateTrainingPageAiCandidates: generateTrainingPageAiCandidatesMock,
  };
});

vi.mock("@/server/platform/aiCredits", async () => {
  return {
    AiCreditGateError: class AiCreditGateError extends Error {
      status: number;
      rechargeUrl: string | null;
      requiredCredits: number | null;
      remainingCredits: number | null;

      constructor(
        status: number,
        message: string,
        options?: {
          rechargeUrl?: string | null;
          requiredCredits?: number | null;
          remainingCredits?: number | null;
        },
      ) {
        super(message);
        this.status = status;
        this.rechargeUrl = options?.rechargeUrl ?? null;
        this.requiredCredits = options?.requiredCredits ?? null;
        this.remainingCredits = options?.remainingCredits ?? null;
      }
    },
    executeWithAiCreditGate: executeWithAiCreditGateMock,
  };
});

import { TrainingPageAiServiceError } from "@/server/services/trainingPageAi";
import { POST } from "./route";

describe("POST /api/training-pages/ai-generate", () => {
  beforeEach(() => {
    generateTrainingPageAiCandidatesMock.mockReset();
    executeWithAiCreditGateMock.mockReset();
    executeWithAiCreditGateMock.mockImplementation(async ({ action }) =>
      action({ tenantId: "tenant-local-001" }),
    );
  });

  it("훈련안내페이지 후보를 반환한다", async () => {
    generateTrainingPageAiCandidatesMock.mockResolvedValue({
      candidates: [
        {
          id: "candidate-1",
          name: "보안 학습 안내",
          description: "학습용 페이지 설명",
          content: '<div><button type="button">내용 확인</button></div>',
          summary: "기본 학습 후보",
        },
      ],
      usage: {
        promptTokenCount: 100,
        candidatesTokenCount: 200,
        totalTokenCount: 300,
        estimatedCredits: 1,
        model: "gemini-2.5-flash-lite",
      },
    });

    const response = await POST(
      new Request("http://localhost/api/training-pages/ai-generate", {
        method: "POST",
        body: JSON.stringify({
          tone: "informational",
          prompt: "핵심 주의 문구를 짧게 넣어 주세요.",
          generateCount: 1,
          preservedCandidates: [{ id: "keep-1", name: "기존 후보" }],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.candidates).toHaveLength(1);
    expect(generateTrainingPageAiCandidatesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: "informational",
        prompt: "핵심 주의 문구를 짧게 넣어 주세요.",
        preservedCandidates: [{ id: "keep-1", name: "기존 후보" }],
        usageContext: "standard",
      }),
    );
  });

  it("training page AI는 standard usageContext를 유지한다", async () => {
    generateTrainingPageAiCandidatesMock.mockResolvedValue({
      candidates: [
        {
          id: "candidate-1",
          name: "표준 훈련 안내",
          description: "표준 생성",
          content: "<section>내용</section>",
          summary: "표준 요약",
        },
      ],
    });

    await POST(
      new Request("http://localhost/api/training-pages/ai-generate", {
        method: "POST",
        body: JSON.stringify({
          tone: "informational",
          prompt: "",
        }),
      }) as never,
    );

    expect(executeWithAiCreditGateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "training-page",
        usageContext: "standard",
      }),
    );
  });

  it("참고 첨부 payload를 파싱해 서비스로 전달한다", async () => {
    generateTrainingPageAiCandidatesMock.mockResolvedValue({
      candidates: [
        {
          id: "candidate-1",
          name: "첨부 참고 후보",
          description: "첨부 참고 설명",
          content: "<section><p>첨부를 참고한 훈련안내페이지입니다.</p></section>",
          summary: "첨부 참고 요약",
        },
      ],
      usage: {
        promptTokenCount: 100,
        candidatesTokenCount: 200,
        totalTokenCount: 300,
        estimatedCredits: 1,
        model: "gemini-2.5-flash-lite",
      },
    });

    const response = await POST(
      new Request("http://localhost/api/training-pages/ai-generate", {
        method: "POST",
        body: JSON.stringify({
          tone: "formal",
          prompt: "",
          generateCount: 1,
          preservedCandidates: [],
          referenceAttachment: {
            name: "training-reference.html",
            mimeType: "text/html",
            kind: "html",
            textContent: "<div>훈련 페이지 참고</div>",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(generateTrainingPageAiCandidatesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceAttachment: expect.objectContaining({
          name: "training-reference.html",
          kind: "html",
          textContent: "<div>훈련 페이지 참고</div>",
        }),
      }),
    );
  });

  it("HTML 첨부 원문이 길어도 잘리지 않고 서비스로 전달한다", async () => {
    generateTrainingPageAiCandidatesMock.mockResolvedValue({
      candidates: [
        {
          id: "candidate-1",
          name: "첨부 참고 후보",
          description: "첨부 참고 설명",
          content: "<section><p>첨부를 참고한 훈련안내페이지입니다.</p></section>",
          summary: "첨부 참고 요약",
        },
      ],
      usage: {
        promptTokenCount: 100,
        candidatesTokenCount: 200,
        totalTokenCount: 300,
        estimatedCredits: 1,
        model: "gemini-2.5-flash-lite",
      },
    });

    const longHtml = `<html><body>${"훈련 안내 ".repeat(5000)}</body></html>`;
    const response = await POST(
      new Request("http://localhost/api/training-pages/ai-generate", {
        method: "POST",
        body: JSON.stringify({
          tone: "formal",
          prompt: "",
          generateCount: 1,
          preservedCandidates: [],
          referenceAttachment: {
            name: "training-reference.html",
            mimeType: "text/html",
            kind: "html",
            textContent: longHtml,
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(generateTrainingPageAiCandidatesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceAttachment: expect.objectContaining({
          textContent: longHtml,
        }),
      }),
    );
  });

  it("크레딧 부족 응답이면 충전 URL을 함께 반환한다", async () => {
    executeWithAiCreditGateMock.mockRejectedValue(
      new (await import("@/server/platform/aiCredits")).AiCreditGateError(
        402,
        "크레딧이 부족합니다.",
        {
          rechargeUrl: "mailto:sales@evriz.co.kr",
          requiredCredits: 1,
          remainingCredits: 0,
        },
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/training-pages/ai-generate", {
        method: "POST",
        body: JSON.stringify({
          tone: "formal",
          prompt: "",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body).toEqual({
      error: "크레딧이 부족합니다.",
      rechargeUrl: "mailto:sales@evriz.co.kr",
      requiredCredits: 1,
      remainingCredits: 0,
    });
  });

  it("문체 값이 없으면 400을 반환한다", async () => {
    const response = await POST(
      new Request("http://localhost/api/training-pages/ai-generate", {
        method: "POST",
        body: JSON.stringify({
          prompt: "",
          generateCount: 4,
          preservedCandidates: [],
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(generateTrainingPageAiCandidatesMock).not.toHaveBeenCalled();
  });

  it("Gemini 일시 장애면 503 안내 문구를 반환한다", async () => {
    generateTrainingPageAiCandidatesMock.mockRejectedValue(
      new TrainingPageAiServiceError({
        status: 503,
        code: "gemini_service_unavailable",
        message: "AI 훈련안내페이지 생성 요청이 일시적으로 많습니다. 잠시 후 다시 시도하세요.",
        retryable: true,
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/training-pages/ai-generate", {
        method: "POST",
        body: JSON.stringify({
          tone: "internal-notice",
          prompt: "",
          generateCount: 4,
          preservedCandidates: [],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: "AI 훈련안내페이지 생성 요청이 일시적으로 많습니다. 잠시 후 다시 시도하세요.",
      code: "gemini_service_unavailable",
      retryable: true,
    });
  });
});
