import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logPlatformAuditEvent } from "@/server/platform/audit";
import {
  requireScopedTenantAccess,
  TenantAccessError,
} from "@/server/platform/tenantAccess";
import {
  deleteTenantAiKey,
  TenantAiKeyServiceError,
  updateTenantAiKey,
  updateTenantAiKeyRequestSchema,
} from "@/server/services/tenantAiKeys";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ tenantId: string; keyId: string }>;
};

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { tenantId, keyId } = await params;
    const context = await requireScopedTenantAccess({
      request,
      tenantId,
      allowedRoles: ["OWNER"],
    });

    const payload = updateTenantAiKeyRequestSchema.parse(await request.json());
    const updated = await updateTenantAiKey(tenantId, keyId, payload);

    logPlatformAuditEvent({
      action: "ai_key.updated",
      tenantId,
      actorUserId: context.auth.user.sub,
      targetId: updated.keyId,
      metadata: payload,
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "API 키 수정 요청 값이 올바르지 않습니다.", issues: error.issues },
        { status: 422 },
      );
    }

    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof TenantAiKeyServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "API 키를 수정하지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { tenantId, keyId } = await params;
    const context = await requireScopedTenantAccess({
      request,
      tenantId,
      allowedRoles: ["OWNER"],
    });

    const deleted = await deleteTenantAiKey(tenantId, keyId);
    if (!deleted) {
      return NextResponse.json({ error: "API 키를 찾지 못했습니다." }, { status: 404 });
    }

    logPlatformAuditEvent({
      action: "ai_key.deleted",
      tenantId,
      actorUserId: context.auth.user.sub,
      targetId: keyId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof TenantAiKeyServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "API 키를 삭제하지 못했습니다." },
      { status: 500 },
    );
  }
}
