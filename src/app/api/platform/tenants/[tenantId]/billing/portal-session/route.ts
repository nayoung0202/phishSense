import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createPlatformPortalSession,
  PlatformApiError,
} from "@/server/platform/client";
import {
  requireScopedTenantAccess,
  TenantAccessError,
} from "@/server/platform/tenantAccess";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ tenantId: string }>;
};

const bodySchema = z.object({
  returnUrl: z.string().trim().url(),
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
    const session = await createPlatformPortalSession({
      accessToken: context.auth.accessToken,
      tenantId,
      input: payload,
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
