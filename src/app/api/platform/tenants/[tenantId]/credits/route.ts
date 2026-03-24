import { NextRequest, NextResponse } from "next/server";
import { fetchPlatformCredits, PlatformApiError } from "@/server/platform/client";
import { getFallbackCreditsSummary } from "@/server/platform/fallback";
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
      allowedRoles: ["OWNER", "ADMIN"],
    });

    if (!context.auth.accessToken) {
      return NextResponse.json(
        { error: "플랫폼 access token을 확인하지 못했습니다." },
        { status: 400 },
      );
    }

    try {
      const credits = await fetchPlatformCredits({
        accessToken: context.auth.accessToken,
        tenantId,
      });
      return NextResponse.json(credits);
    } catch (error) {
      if (error instanceof PlatformApiError && error.status === 401) {
        return NextResponse.json(
          { error: "로그인 정보를 다시 확인해 주세요." },
          { status: 401 },
        );
      }

      return NextResponse.json(getFallbackCreditsSummary(tenantId), {
        headers: {
          "X-PhishSense-Fallback": "credits",
        },
      });
    }
  } catch (error) {
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "크래딧 정보를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
