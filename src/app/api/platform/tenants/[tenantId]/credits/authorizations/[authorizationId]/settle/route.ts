import { NextRequest, NextResponse } from "next/server";
import {
  settlePlatformCreditAuthorization,
  PlatformApiError,
} from "@/server/platform/client";
import { logPlatformAuditEvent } from "@/server/platform/audit";
import {
  requireScopedTenantAccess,
  TenantAccessError,
} from "@/server/platform/tenantAccess";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ tenantId: string; authorizationId: string }>;
};

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { tenantId, authorizationId } = await params;
    const context = await requireScopedTenantAccess({
      request,
      tenantId,
      allowedRoles: ["OWNER", "ADMIN"],
    });

    if (!context.auth.accessToken) {
      return NextResponse.json(
        { error: "플랫폼 access token을 확인하지 못했습니다." },
        { status: 400 },
      );
    }

    const payload = await request.json().catch(() => ({}));
    await settlePlatformCreditAuthorization({
      accessToken: context.auth.accessToken,
      tenantId,
      authorizationId,
      input: payload,
    });

    logPlatformAuditEvent({
      action: "credits.authorization.settle",
      tenantId,
      actorUserId: context.auth.user.sub,
      targetId: authorizationId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof PlatformApiError) {
      return NextResponse.json(
        { error: "크래딧 차감을 확정하지 못했습니다." },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "크래딧 차감을 확정하지 못했습니다." },
      { status: 500 },
    );
  }
}
