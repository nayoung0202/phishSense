import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logPlatformAuditEvent } from "@/server/platform/audit";
import {
  requireScopedTenantAccess,
  TenantAccessError,
} from "@/server/platform/tenantAccess";
import {
  createTenantAiKey,
  createTenantAiKeyRequestSchema,
  listTenantAiKeys,
  TenantAiKeyServiceError,
} from "@/server/services/tenantAiKeys";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ tenantId: string }>;
};

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    await requireScopedTenantAccess({
      request,
      tenantId,
      allowedRoles: ["OWNER"],
    });

    const items = await listTenantAiKeys(tenantId);
    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "API 키 목록을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const context = await requireScopedTenantAccess({
      request,
      tenantId,
      allowedRoles: ["OWNER"],
    });

    const payload = createTenantAiKeyRequestSchema.parse(await request.json());
    const created = await createTenantAiKey(tenantId, payload);

    logPlatformAuditEvent({
      action: "ai_key.created",
      tenantId,
      actorUserId: context.auth.user.sub,
      targetId: created.keyId,
      metadata: {
        provider: created.provider,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "API 키 등록 요청 값이 올바르지 않습니다.", issues: error.issues },
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
      { error: "API 키를 등록하지 못했습니다." },
      { status: 500 },
    );
  }
}
