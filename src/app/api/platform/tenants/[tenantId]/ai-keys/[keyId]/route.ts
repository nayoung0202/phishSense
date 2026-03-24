import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  deletePlatformAiKey,
  PlatformApiError,
  updatePlatformAiKey,
} from "@/server/platform/client";
import { logPlatformAuditEvent } from "@/server/platform/audit";
import {
  requireScopedTenantAccess,
  TenantAccessError,
} from "@/server/platform/tenantAccess";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ tenantId: string; keyId: string }>;
};

const bodySchema = z.object({
  label: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
  scopes: z.array(z.string().trim().min(1)).optional(),
});

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { tenantId, keyId } = await params;
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
    const updated = await updatePlatformAiKey({
      accessToken: context.auth.accessToken,
      tenantId,
      keyId,
      input: payload,
    });

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

    if (error instanceof PlatformApiError) {
      return NextResponse.json(
        { error: "API 키를 수정하지 못했습니다." },
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

    if (!context.auth.accessToken) {
      return NextResponse.json(
        { error: "플랫폼 access token을 확인하지 못했습니다." },
        { status: 400 },
      );
    }

    await deletePlatformAiKey({
      accessToken: context.auth.accessToken,
      tenantId,
      keyId,
    });

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

    if (error instanceof PlatformApiError) {
      return NextResponse.json(
        { error: "API 키를 삭제하지 못했습니다." },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "API 키를 삭제하지 못했습니다." },
      { status: 500 },
    );
  }
}
