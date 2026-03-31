import { NextRequest, NextResponse } from "next/server";
import { buildHtmlErrorResponse, HTML_RESPONSE_SECURITY_HEADERS } from "@/server/lib/htmlErrorPage";
import { getPublicOriginFromRequest } from "@/server/lib/tenantDomain";
import { buildPhishingLinkUrl, buildSubmitFormUrl } from "@/server/lib/trainingLink";
import {
  getPublicTrainingContextByTrackingToken,
  updateProjectForTenant,
  updateProjectTargetForTenant,
} from "@/server/tenant/tenantStorage";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

const submitTokenReplacer = /\{\{\s*SUBMIT_URL\s*\}\}/gi;

const buildMissingTrainingResponse = (message: string) =>
  buildHtmlErrorResponse({
    status: 404,
    title: "훈련 안내 페이지를 찾을 수 없습니다.",
    message,
    label: "Training Page",
  });

const handleTrainingRequest = async (request: NextRequest, { params }: RouteContext) => {
  try {
    const { token } = await params;
    const normalized = token?.trim();
    if (!normalized) {
      return buildMissingTrainingResponse("잘못된 주소이거나 더 이상 유효하지 않은 훈련 안내 링크입니다.");
    }

    const publicOrigin = getPublicOriginFromRequest(request);
    const flowToken = request.cookies.get("ps_flow_token")?.value ?? "";
    if (flowToken !== normalized) {
      return NextResponse.redirect(buildPhishingLinkUrl(normalized, { baseUrl: publicOrigin }), 302);
    }

    if (request.method === "POST") {
      await request.formData().catch(() => undefined);
    }

    const context = await getPublicTrainingContextByTrackingToken(normalized);
    if (!context) {
      return buildMissingTrainingResponse("잘못된 주소이거나 더 이상 유효하지 않은 훈련 안내 링크입니다.");
    }

    const { tenantId, projectTarget, project, trainingPage } = context;

    const now = new Date();
    const openedAt = projectTarget.openedAt ?? now;
    const clickedAt = projectTarget.clickedAt ?? now;
    const submittedAt = projectTarget.submittedAt ?? now;
    const shouldIncrementOpen = !projectTarget.openedAt;
    const shouldIncrementClick = !projectTarget.clickedAt;
    const shouldIncrementSubmit = !projectTarget.submittedAt;

    await updateProjectTargetForTenant(tenantId, projectTarget.id, {
      openedAt: shouldIncrementOpen ? openedAt : projectTarget.openedAt,
      clickedAt: shouldIncrementClick ? clickedAt : projectTarget.clickedAt,
      submittedAt: shouldIncrementSubmit ? submittedAt : projectTarget.submittedAt,
      status: "submitted",
    });

    if (
      (shouldIncrementOpen || shouldIncrementClick || shouldIncrementSubmit) &&
      projectTarget.status !== "test"
    ) {
      await updateProjectForTenant(tenantId, project.id, {
        openCount: (project.openCount ?? 0) + (shouldIncrementOpen ? 1 : 0),
        clickCount: (project.clickCount ?? 0) + (shouldIncrementClick ? 1 : 0),
        submitCount: (project.submitCount ?? 0) + (shouldIncrementSubmit ? 1 : 0),
      });
    }

    const submitUrl = buildSubmitFormUrl(normalized, { baseUrl: publicOrigin });
    const renderedContent = (trainingPage.content ?? "").replace(submitTokenReplacer, submitUrl);
    const response = new NextResponse(renderedContent, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...HTML_RESPONSE_SECURITY_HEADERS,
      },
    });
    response.cookies.set("ps_flow_token", "", {
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch {
    return buildMissingTrainingResponse("요청한 훈련 안내 페이지를 불러오지 못했습니다.");
  }
};

export async function GET(request: NextRequest, context: RouteContext) {
  return handleTrainingRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return handleTrainingRequest(request, context);
}
