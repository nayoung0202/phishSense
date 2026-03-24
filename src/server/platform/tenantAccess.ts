import type { NextRequest } from "next/server";
import { requireReadyTenant } from "@/server/tenant/currentTenant";

export class TenantAccessError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireScopedTenantAccess(options: {
  request: NextRequest;
  tenantId: string;
  allowedRoles?: string[];
}) {
  const context = await requireReadyTenant(options.request);

  if (context.tenantId !== options.tenantId) {
    throw new TenantAccessError(403, "현재 tenant 컨텍스트와 요청 tenant가 일치하지 않습니다.");
  }

  const membership =
    context.platform.tenants.find((tenant) => tenant.tenantId === options.tenantId) ?? null;

  if (!membership) {
    throw new TenantAccessError(403, "현재 tenant membership을 확인하지 못했습니다.");
  }

  if (
    options.allowedRoles &&
    !options.allowedRoles.includes(membership.role)
  ) {
    throw new TenantAccessError(403, "이 작업을 수행할 권한이 없습니다.");
  }

  return {
    ...context,
    membership,
  };
}
