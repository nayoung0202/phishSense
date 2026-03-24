import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/requireAuth";
import {
  acceptPlatformTenantInvite,
  PlatformApiError,
} from "@/server/platform/client";
import { resolvePlatformContext } from "@/server/platform/context";
import { logPlatformAuditEvent } from "@/server/platform/audit";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ token: string }>;
};

const toAcceptInviteMessage = (status: number) => {
  switch (status) {
    case 401:
      return "로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.";
    case 404:
      return "초대 링크를 찾을 수 없습니다.";
    case 409:
      return "초대를 수락할 수 없습니다. 이메일 불일치, 만료, 중복 수락 여부를 확인해 주세요.";
    default:
      return "초대 수락에 실패했습니다. 잠시 후 다시 시도해 주세요.";
  }
};

export async function POST(request: NextRequest, { params }: RouteContext) {
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

    const { token } = await params;
    await acceptPlatformTenantInvite({
      accessToken: auth.accessToken,
      token,
    });

    logPlatformAuditEvent({
      action: "tenant_invite.accepted",
      actorUserId: auth.user.sub,
      targetId: token,
    });

    const platformContext = await resolvePlatformContext({
      auth,
      preferredTenantId: auth.tenantId,
      forceRefresh: true,
    });

    return NextResponse.json({
      ok: true,
      platformContext,
    });
  } catch (error) {
    if (error instanceof PlatformApiError) {
      return NextResponse.json(
        {
          error: toAcceptInviteMessage(error.status),
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "초대 수락에 실패했습니다." },
      { status: 500 },
    );
  }
}
