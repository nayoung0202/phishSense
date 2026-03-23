import { NextRequest, NextResponse } from "next/server";
import {
  AdminSmtpError,
  deleteTenantSmtpConfig,
  fetchTenantSmtpConfig,
  saveTenantSmtpConfig,
} from "@/server/services/adminSmtpService";

type RouteContext = {
  params: Promise<{
    tenantId: string;
  }>;
};

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const data = await fetchTenantSmtpConfig(tenantId);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof AdminSmtpError) {
      return NextResponse.json(error.body, { status: error.status });
    }
    return NextResponse.json({ message: "발송 설정을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const body = await request.json();
    const { tenantId } = await params;
    const result = await saveTenantSmtpConfig(tenantId, body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AdminSmtpError) {
      return NextResponse.json(error.body, { status: error.status });
    }
    return NextResponse.json({ message: "발송 설정을 저장하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const result = await deleteTenantSmtpConfig(tenantId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AdminSmtpError) {
      return NextResponse.json(error.body, { status: error.status });
    }
    return NextResponse.json({ message: "발송 설정을 삭제하지 못했습니다." }, { status: 500 });
  }
}
