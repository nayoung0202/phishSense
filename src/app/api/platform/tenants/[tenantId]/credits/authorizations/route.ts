import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  authorizePlatformCredits,
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
  featureKey: z.string().trim().min(1),
  usageContext: z.string().trim().min(1),
  quantity: z.number().int().positive().default(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
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

    const payload = bodySchema.parse(await request.json());
    const authorization = await authorizePlatformCredits({
      accessToken: context.auth.accessToken,
      tenantId,
      input: payload,
    });

    return NextResponse.json(authorization);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "크래딧 승인 요청이 올바르지 않습니다.", issues: error.issues },
        { status: 422 },
      );
    }

    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof PlatformApiError) {
      return NextResponse.json(
        { error: "크래딧 사용 가능 여부를 확인하지 못했습니다." },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "크래딧 사용 가능 여부를 확인하지 못했습니다." },
      { status: 500 },
    );
  }
}
