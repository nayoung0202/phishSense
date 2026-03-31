import { NextRequest, NextResponse } from "next/server";
import {
  requireScopedTenantAccess,
  TenantAccessError,
} from "@/server/platform/tenantAccess";
import {
  getTenantCreditSummary,
  TenantCreditServiceError,
} from "@/server/services/tenantCredits";

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
      allowedRoles: ["OWNER", "ADMIN"],
    });

    const summary = await getTenantCreditSummary(tenantId);
    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof TenantCreditServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "크레딧 정보를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
