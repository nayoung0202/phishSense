import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  PLATFORM_BILLING_APP_KEY,
  PLATFORM_BILLING_PRODUCT_ID,
  PLATFORM_BILLING_ROUTE_KEYS,
} from "@/lib/platformBilling";
import {
  createPlatformPortalSession,
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
  flowType: z.enum(["payment_method_update", "subscription_cancel"]),
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

    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
    if (!idempotencyKey) {
      return NextResponse.json(
        { error: "Idempotency-Key 헤더가 필요합니다." },
        { status: 400 },
      );
    }

    const payload = bodySchema.parse(await request.json());
    const session = await createPlatformPortalSession({
      accessToken: context.auth.accessToken,
      tenantId,
      idempotencyKey,
      input: {
        productId: PLATFORM_BILLING_PRODUCT_ID,
        flowType: payload.flowType,
        appKey: PLATFORM_BILLING_APP_KEY,
        returnRouteKey: PLATFORM_BILLING_ROUTE_KEYS.portalReturn,
        afterCompletionRouteKey: PLATFORM_BILLING_ROUTE_KEYS.portalDone,
      },
    });

    logPlatformAuditEvent({
      action: "billing.portal_session.created",
      tenantId,
      actorUserId: context.auth.user.sub,
      targetId: session.sessionId,
      metadata: {
        productId: PLATFORM_BILLING_PRODUCT_ID,
        flowType: payload.flowType,
      },
    });

    return NextResponse.json(session);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "결제 포털 요청 값이 올바르지 않습니다.", issues: error.issues },
        { status: 422 },
      );
    }

    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof PlatformApiError) {
      return NextResponse.json(
        { error: "결제 포털 세션을 생성하지 못했습니다." },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "결제 포털 세션을 생성하지 못했습니다." },
      { status: 500 },
    );
  }
}
