import { NextRequest, NextResponse } from "next/server";
import {
  fetchPlatformTenantMembers,
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

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const context = await requireScopedTenantAccess({
      request,
      tenantId,
    });

    if (!context.auth.accessToken) {
      return NextResponse.json(
        { error: "플랫폼 access token을 확인하지 못했습니다." },
        { status: 400 },
      );
    }

    const members = await fetchPlatformTenantMembers({
      accessToken: context.auth.accessToken,
      tenantId,
    });

    return NextResponse.json(members);
  } catch (error) {
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof PlatformApiError) {
      return NextResponse.json(
        { error: "멤버 목록을 불러오지 못했습니다." },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "멤버 목록을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
