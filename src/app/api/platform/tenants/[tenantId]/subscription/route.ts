import { NextRequest, NextResponse } from "next/server";
import {
  fetchPlatformTenantSubscription,
  PlatformApiError,
} from "@/server/platform/client";
import { getFallbackTenantSubscription } from "@/server/platform/fallback";
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
      allowedRoles: ["OWNER"],
    });

    if (!context.auth.accessToken) {
      return NextResponse.json(
        { error: "플랫폼 access token을 확인하지 못했습니다." },
        { status: 400 },
      );
    }

    try {
      const subscription = await fetchPlatformTenantSubscription({
        accessToken: context.auth.accessToken,
        tenantId,
      });
      return NextResponse.json(subscription);
    } catch (error) {
      if (error instanceof PlatformApiError && error.status === 401) {
        return NextResponse.json(
          { error: "로그인 정보를 다시 확인해 주세요." },
          { status: 401 },
        );
      }

      return NextResponse.json(
        getFallbackTenantSubscription({
          tenantId,
          planCode:
            context.platform.platformProduct?.plan ??
            context.platform.localEntitlement?.planCode ??
            "FREE",
          seatLimit:
            context.platform.platformProduct?.seatLimit ??
            context.platform.localEntitlement?.seatLimit ??
            5,
          status:
            context.platform.platformProduct?.status ??
            context.platform.localEntitlement?.status ??
            "ACTIVE",
        }),
        {
          headers: {
            "X-PhishSense-Fallback": "tenant-subscription",
          },
        },
      );
    }
  } catch (error) {
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "구독 정보를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
