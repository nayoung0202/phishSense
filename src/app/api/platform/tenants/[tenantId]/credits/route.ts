import { NextRequest, NextResponse } from "next/server";
import { fetchPlatformCredits, PlatformApiError } from "@/server/platform/client";
import { getFallbackCreditsSummary } from "@/server/platform/fallback";
import {
  requireScopedTenantAccess,
  TenantAccessError,
} from "@/server/platform/tenantAccess";
import { listTenantAiKeys } from "@/server/services/tenantAiKeys";

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

    const localAiKeys = await listTenantAiKeys(tenantId);
    const activeLocalAiKeys = localAiKeys.filter((item) => item.status === "ACTIVE");

    try {
      const credits = await fetchPlatformCredits({
        accessToken: context.auth.accessToken,
        tenantId,
      });
      return NextResponse.json({
        ...credits,
        byokAvailable: credits.byokAvailable || activeLocalAiKeys.length > 0,
        activeAiKeys: Math.max(credits.activeAiKeys, activeLocalAiKeys.length),
      });
    } catch (error) {
      if (error instanceof PlatformApiError && error.status === 401) {
        return NextResponse.json(
          { error: "로그인 정보를 다시 확인해 주세요." },
          { status: 401 },
        );
      }

      const fallback = getFallbackCreditsSummary(tenantId);
      return NextResponse.json(
        {
          ...fallback,
          byokAvailable: fallback.byokAvailable || activeLocalAiKeys.length > 0,
          activeAiKeys: Math.max(fallback.activeAiKeys, activeLocalAiKeys.length),
        },
        {
        headers: {
          "X-PhishSense-Fallback": "credits",
        },
        },
      );
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
