import { NextRequest, NextResponse } from "next/server";
import { buildHtmlErrorResponse } from "@/server/lib/htmlErrorPage";
import { getPublicOriginFromRequest } from "@/server/lib/tenantDomain";
import { buildSubmitUrl } from "@/server/lib/trainingLink";
import {
  getPublicProjectContextByTrackingToken,
  updateProjectForTenant,
  updateProjectTargetForTenant,
} from "@/server/tenant/tenantStorage";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

const buildMissingSubmitResponse = (message: string) =>
  buildHtmlErrorResponse({
    status: 404,
    title: "제출 경로를 찾을 수 없습니다.",
    message,
    label: "Submit Route",
  });

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { token } = await params;
    const normalized = token?.trim();
    if (!normalized) {
      return buildMissingSubmitResponse("잘못된 제출 주소이거나 더 이상 유효하지 않은 링크입니다.");
    }

    const context = await getPublicProjectContextByTrackingToken(normalized);
    if (!context) {
      return buildMissingSubmitResponse("잘못된 제출 주소이거나 더 이상 유효하지 않은 링크입니다.");
    }

    const { tenantId, projectTarget, project } = context;
    await request.formData().catch(() => undefined);

    if (!projectTarget.submittedAt) {
      const now = new Date();
      const openedAt = projectTarget.openedAt ?? now;
      const clickedAt = projectTarget.clickedAt ?? now;
      const submittedAt = now;
      const shouldIncrementOpen = !projectTarget.openedAt;
      const shouldIncrementClick = !projectTarget.clickedAt;

      await updateProjectTargetForTenant(tenantId, projectTarget.id, {
        openedAt: shouldIncrementOpen ? openedAt : projectTarget.openedAt,
        clickedAt: shouldIncrementClick ? clickedAt : projectTarget.clickedAt,
        submittedAt,
        status: "submitted",
      });

      if (projectTarget.status !== "test") {
        await updateProjectForTenant(tenantId, project.id, {
          openCount: (project.openCount ?? 0) + (shouldIncrementOpen ? 1 : 0),
          clickCount: (project.clickCount ?? 0) + (shouldIncrementClick ? 1 : 0),
          submitCount: (project.submitCount ?? 0) + 1,
        });
      }
    }

    const publicOrigin = getPublicOriginFromRequest(request);
    const response = NextResponse.redirect(buildSubmitUrl(normalized, { baseUrl: publicOrigin }), 302);
    response.cookies.set("ps_flow_token", normalized, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });
    return response;
  } catch {
    return buildMissingSubmitResponse("요청한 제출 경로를 불러오지 못했습니다.");
  }
}
