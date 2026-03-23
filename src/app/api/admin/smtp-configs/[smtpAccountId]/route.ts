import { NextRequest, NextResponse } from "next/server";
import {
  AdminSmtpError,
  deleteTenantSmtpConfigById,
  fetchTenantSmtpConfigById,
  updateTenantSmtpConfig,
} from "@/server/services/adminSmtpService";
import {
  buildReadyTenantErrorResponse,
  requireReadyTenant,
} from "@/server/tenant/currentTenant";

type RouteContext = {
  params: Promise<{
    smtpAccountId: string;
  }>;
};

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { tenantId } = await requireReadyTenant(request);
    const { smtpAccountId } = await params;
    const data = await fetchTenantSmtpConfigById(tenantId, smtpAccountId);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof AdminSmtpError) {
      return NextResponse.json(error.body, { status: error.status });
    }
    return buildReadyTenantErrorResponse(error, "발송 설정을 불러오지 못했습니다.");
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const body = await request.json();
    const { tenantId } = await requireReadyTenant(request);
    const { smtpAccountId } = await params;
    const result = await updateTenantSmtpConfig(tenantId, smtpAccountId, body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AdminSmtpError) {
      return NextResponse.json(error.body, { status: error.status });
    }
    return buildReadyTenantErrorResponse(error, "발송 설정을 저장하지 못했습니다.");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { tenantId } = await requireReadyTenant(request);
    const { smtpAccountId } = await params;
    const result = await deleteTenantSmtpConfigById(tenantId, smtpAccountId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AdminSmtpError) {
      return NextResponse.json(error.body, { status: error.status });
    }
    return buildReadyTenantErrorResponse(error, "발송 설정을 삭제하지 못했습니다.");
  }
}
