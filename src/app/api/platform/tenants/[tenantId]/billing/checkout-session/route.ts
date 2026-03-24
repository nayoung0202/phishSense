import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createPlatformCheckoutSession,
  PlatformApiError,
} from "@/server/platform/client";
import { logPlatformAuditEvent } from "@/server/platform/audit";
import {
  requireScopedTenantAccess,
  TenantAccessError,
} from "@/server/platform/tenantAccess";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ tenantId: string }>;
};

const bodySchema = z.object({
  planCode: z.string().trim().min(1),
  seatCount: z.number().int().positive().nullable().optional(),
  successUrl: z.string().trim().url(),
  cancelUrl: z.string().trim().url(),
});

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const context = await requireScopedTenantAccess({
      request,
      tenantId,
      allowedRoles: ["OWNER"],
    });

    if (!context.auth.accessToken) {
      return NextResponse.json(
        { error: "플랫폼 access token을 확인하지 못했습니다." },
        { status: 400 },
      );
    }

    const payload = bodySchema.parse(await request.json());
    const session = await createPlatformCheckoutSession({
      accessToken: context.auth.accessToken,
      tenantId,
      input: payload,
    });

    logPlatformAuditEvent({
      action: "billing.checkout_session.created",
      tenantId,
      actorUserId: context.auth.user.sub,
      targetId: session.sessionId ?? null,
      metadata: {
        planCode: payload.planCode,
        seatCount: payload.seatCount ?? null,
      },
    });

    return NextResponse.json(session);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "결제 요청 값이 올바르지 않습니다.", issues: error.issues },
        { status: 422 },
      );
    }

    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof PlatformApiError) {
      return NextResponse.json(
        { error: "Stripe Checkout 세션을 생성하지 못했습니다." },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "Stripe Checkout 세션을 생성하지 못했습니다." },
      { status: 500 },
    );
  }
}
