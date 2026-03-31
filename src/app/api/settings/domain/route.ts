import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  TenantDomainError,
  fetchTenantDomainSettings,
  saveTenantDomain,
} from "@/server/services/tenantDomainService";
import {
  buildReadyTenantErrorResponse,
  requireReadyTenant,
} from "@/server/tenant/currentTenant";

const resolveMembershipRole = async (request: NextRequest) => {
  const context = await requireReadyTenant(request);
  const membership =
    context.platform.tenants.find((tenant) => tenant.tenantId === context.tenantId) ?? null;

  if (!membership) {
    return {
      context,
      role: null,
    };
  }

  return {
    context,
    role: membership.role,
  };
};

export async function GET(request: NextRequest) {
  try {
    const { context, role } = await resolveMembershipRole(request);
    if (!["OWNER", "ADMIN"].includes(role ?? "")) {
      return NextResponse.json(
        {
          error: "도메인 설정은 OWNER 또는 ADMIN만 조회할 수 있습니다.",
        },
        { status: 403 },
      );
    }

    const result = await fetchTenantDomainSettings(context.tenantId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TenantDomainError) {
      return NextResponse.json(error.body, { status: error.status });
    }
    return buildReadyTenantErrorResponse(error, "도메인 설정을 불러오지 못했습니다.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { context, role } = await resolveMembershipRole(request);
    if (role !== "OWNER") {
      return NextResponse.json(
        {
          error: "도메인 발급과 변경은 OWNER 권한에서만 가능합니다.",
        },
        { status: 403 },
      );
    }

    const result = await saveTenantDomain(context.tenantId, body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "slug를 확인해 주세요.",
          issues: error.issues,
        },
        { status: 422 },
      );
    }
    if (error instanceof TenantDomainError) {
      return NextResponse.json(error.body, { status: error.status });
    }
    return buildReadyTenantErrorResponse(error, "도메인 설정을 저장하지 못했습니다.");
  }
}
