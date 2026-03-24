import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createPlatformAiKey,
  fetchPlatformAiKeys,
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
  provider: z.string().trim().min(1),
  label: z.string().trim().min(1),
  apiKey: z.string().trim().min(1),
  scopes: z.array(z.string().trim().min(1)).default([]),
});

export async function GET(request: NextRequest, { params }: RouteContext) {
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

    const keys = await fetchPlatformAiKeys({
      accessToken: context.auth.accessToken,
      tenantId,
    });

    return NextResponse.json(keys);
  } catch (error) {
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof PlatformApiError) {
      return NextResponse.json(
        { error: "API 키 목록을 불러오지 못했습니다." },
        { status: error.status },
      );
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

    if (!context.auth.accessToken) {
      return NextResponse.json(
        { error: "플랫폼 access token을 확인하지 못했습니다." },
        { status: 400 },
      );
    }

    const payload = bodySchema.parse(await request.json());
    const created = await createPlatformAiKey({
      accessToken: context.auth.accessToken,
      tenantId,
      input: payload,
    });

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

    if (error instanceof PlatformApiError) {
      return NextResponse.json(
        { error: "API 키를 등록하지 못했습니다." },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "API 키를 등록하지 못했습니다." },
      { status: 500 },
    );
  }
}
