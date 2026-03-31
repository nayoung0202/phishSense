import { NextRequest, NextResponse } from "next/server";
import { PLATFORM_BILLING_PRODUCT_ID } from "@/lib/platformBilling";
import {
  fetchPlatformBillingSubscription,
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

    const subscription = await fetchPlatformBillingSubscription({
      accessToken: context.auth.accessToken,
      tenantId,
      productId: PLATFORM_BILLING_PRODUCT_ID,
    });

    return NextResponse.json(subscription);
  } catch (error) {
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof PlatformApiError) {
      if (error.status === 401) {
        return NextResponse.json(
          { error: "로그인 정보를 다시 확인해 주세요." },
          { status: 401 },
        );
      }

      if (error.status === 404) {
        return NextResponse.json(
          { error: "현재 billing subscription을 찾을 수 없습니다." },
          { status: 404 },
        );
      }

      return NextResponse.json(
        { error: "구독 정보를 불러오지 못했습니다." },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "구독 정보를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
