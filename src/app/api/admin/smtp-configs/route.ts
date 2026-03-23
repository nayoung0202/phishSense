import { NextRequest, NextResponse } from "next/server";
import {
  AdminSmtpError,
  createTenantSmtpConfig,
  fetchTenantSmtpConfigSummaries,
} from "@/server/services/adminSmtpService";
import {
  buildReadyTenantErrorResponse,
  requireReadyTenant,
} from "@/server/tenant/currentTenant";

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await requireReadyTenant(request);
    const summaries = await fetchTenantSmtpConfigSummaries(tenantId);
    return NextResponse.json(summaries);
  } catch (error) {
    return buildReadyTenantErrorResponse(error, "발송 설정 목록을 불러오지 못했습니다.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId } = await requireReadyTenant(request);
    const result = await createTenantSmtpConfig(tenantId, body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AdminSmtpError) {
      return NextResponse.json(error.body, { status: error.status });
    }
    return buildReadyTenantErrorResponse(error, "발송 설정을 저장하지 못했습니다.");
  }
}
