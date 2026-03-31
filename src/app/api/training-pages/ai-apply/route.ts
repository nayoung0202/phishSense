import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import {
  AiCreditGateError,
  consumeAiApplyCredits,
} from "@/server/platform/aiCredits";

const trainingPageAiApplyRequestSchema = z.object({
  usageContext: z.string().trim().min(1).default("standard"),
  candidateId: z.string().trim().min(1).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const payload = trainingPageAiApplyRequestSchema.parse(await request.json());
    const result = await consumeAiApplyCredits({
      request,
      kind: "training-page",
      usageContext: payload.usageContext,
      metadata: {
        candidateId: payload.candidateId ?? null,
      },
    });

    return NextResponse.json({
      ok: true,
      tenantId: result.tenantId,
      charged: result.charged,
      chargedCredits: result.cost,
      remainingCredits: result.remainingCredits,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "AI 훈련안내페이지 반영 요청이 올바르지 않습니다.", issues: error.errors },
        { status: 400 },
      );
    }

    if (error instanceof AiCreditGateError) {
      return NextResponse.json(
        {
          error: error.message,
          rechargeUrl: error.rechargeUrl,
          requiredCredits: error.requiredCredits,
          remainingCredits: error.remainingCredits,
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "AI 훈련안내페이지 반영 전 크레딧을 차감하지 못했습니다." },
      { status: 500 },
    );
  }
}
