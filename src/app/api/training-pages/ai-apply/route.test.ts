import { beforeEach, describe, expect, it, vi } from "vitest";

const consumeAiApplyCreditsMock = vi.hoisted(() => vi.fn());

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
    consumeAiApplyCredits: consumeAiApplyCreditsMock,
  };
});

import { POST } from "./route";

describe("POST /api/training-pages/ai-apply", () => {
  beforeEach(() => {
    consumeAiApplyCreditsMock.mockReset();
  });

  it("반영 전 차감에 성공하면 ok 응답을 반환한다", async () => {
    consumeAiApplyCreditsMock.mockResolvedValue({
      tenantId: "tenant-a",
      charged: true,
      cost: 1,
      remainingCredits: 4,
    });

    const response = await POST(
      new Request("http://localhost/api/training-pages/ai-apply", {
        method: "POST",
        body: JSON.stringify({
          usageContext: "standard",
          candidateId: "candidate-1",
        }),
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      tenantId: "tenant-a",
      charged: true,
      chargedCredits: 1,
      remainingCredits: 4,
    });
  });

  it("요청 payload가 잘못되면 400을 반환한다", async () => {
    const response = await POST(
      new Request("http://localhost/api/training-pages/ai-apply", {
        method: "POST",
        body: JSON.stringify({
          usageContext: "",
        }),
      }) as never,
    );

    expect(response.status).toBe(400);
  });

  it("크레딧 부족이면 402와 recharge 정보를 반환한다", async () => {
    consumeAiApplyCreditsMock.mockRejectedValue(
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
      new Request("http://localhost/api/training-pages/ai-apply", {
        method: "POST",
        body: JSON.stringify({
          usageContext: "standard",
          candidateId: "candidate-1",
        }),
      }) as never,
    );

    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({
      error: "크레딧이 부족합니다.",
      rechargeUrl: "mailto:sales@evriz.co.kr",
      requiredCredits: 1,
      remainingCredits: 0,
    });
  });
});
