import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createPlatformTenantInvite,
  PlatformApiError,
} from "@/server/platform/client";
import { logPlatformAuditEvent } from "@/server/platform/audit";
import {
  requireScopedTenantAccess,
  TenantAccessError,
} from "@/server/platform/tenantAccess";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ tenantId: string }>;
};

const bodySchema = z.object({
  email: z.string().trim().email("유효한 이메일을 입력해 주세요."),
  role: z.string().trim().min(1, "권한을 선택해 주세요."),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

const toInviteErrorMessage = (status: number) => {
  switch (status) {
    case 401:
      return "로그인 정보를 다시 확인해 주세요.";
    case 403:
      return "이 tenant에서 초대 링크를 만들 권한이 없습니다.";
    case 404:
      return "현재 tenant를 찾을 수 없습니다.";
    case 409:
      return "같은 사용자에 대한 초대가 이미 있거나 이미 멤버로 등록되어 있습니다.";
    default:
      return "초대 링크를 생성하지 못했습니다.";
  }
};

export async function POST(request: NextRequest, { params }: RouteContext) {
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

    const payload = bodySchema.parse(await request.json());
    const invite = await createPlatformTenantInvite({
      accessToken: context.auth.accessToken,
      tenantId,
      invite: payload,
    });

    logPlatformAuditEvent({
      action: "tenant_invite.created",
      tenantId,
      actorUserId: context.auth.user.sub,
      targetId: invite.inviteId,
      metadata: {
        inviteeEmail: payload.email,
        role: payload.role,
      },
    });

    return NextResponse.json(invite, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "초대 요청 값이 올바르지 않습니다.", issues: error.issues },
        { status: 422 },
      );
    }

    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof PlatformApiError) {
      return NextResponse.json(
        { error: toInviteErrorMessage(error.status) },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "초대 링크를 생성하지 못했습니다." },
      { status: 500 },
    );
  }
}
