import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/requireAuth";
import {
  fetchPlatformBillingCatalog,
  PlatformApiError,
} from "@/server/platform/client";
import { getFallbackBillingCatalog } from "@/server/platform/fallback";
import { PLATFORM_PRODUCT_ID } from "@/server/platform/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    if (!auth.accessToken) {
      return NextResponse.json(
        { error: "플랫폼 access token을 확인하지 못했습니다." },
        { status: 400 },
      );
    }

    const productId =
      request.nextUrl.searchParams.get("productId")?.trim() || PLATFORM_PRODUCT_ID;

    try {
      const catalog = await fetchPlatformBillingCatalog({
        accessToken: auth.accessToken,
        productId,
      });
      return NextResponse.json(catalog);
    } catch (error) {
      if (error instanceof PlatformApiError && error.status === 401) {
        return NextResponse.json(
          { error: "로그인 정보를 다시 확인해 주세요." },
          { status: 401 },
        );
      }

      return NextResponse.json(getFallbackBillingCatalog(), {
        headers: {
          "X-PhishSense-Fallback": "billing-catalog",
        },
      });
    }
  } catch {
    return NextResponse.json(
      { error: "구독 카탈로그를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
