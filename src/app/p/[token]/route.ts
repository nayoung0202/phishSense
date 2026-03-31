import { NextResponse } from "next/server";
import { normalizeTrainingUrlPlaceholders } from "@shared/templateTokens";
import { neutralizePreviewModalHtml } from "@/lib/templatePreview";
import { buildHtmlErrorResponse, HTML_RESPONSE_SECURITY_HEADERS } from "@/server/lib/htmlErrorPage";
import { getPublicOriginFromRequest } from "@/server/lib/tenantDomain";
import {
  buildSubmitFormUrl,
  buildTrainingLinkUrl,
  injectTrainingLink,
} from "@/server/lib/trainingLink";
import {
  getPublicPhishingContextByTrackingToken,
  updateProjectForTenant,
  updateProjectTargetForTenant,
} from "@/server/tenant/tenantStorage";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

const trainingTokenMatcher = /\{\{\s*TRAINING_URL\s*\}\}/i;
const trainingTokenReplacer = /\{\{\s*TRAINING_URL\s*\}\}/gi;
const submitTokenMatcher = /\{\{\s*SUBMIT_URL\s*\}\}/i;
const submitTokenReplacer = /\{\{\s*SUBMIT_URL\s*\}\}/gi;
const formTagMatcher = /<form\b/i;

const buildMissingLandingResponse = (message: string) =>
  buildHtmlErrorResponse({
    status: 404,
    title: "페이지를 찾을 수 없습니다.",
    message,
    label: "Phishing Landing",
  });

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { token } = await params;
    const normalized = token?.trim();
    if (!normalized) {
      return buildMissingLandingResponse("잘못된 주소이거나 더 이상 유효하지 않은 공개 링크입니다.");
    }

    const context = await getPublicPhishingContextByTrackingToken(normalized);
    if (!context) {
      return buildMissingLandingResponse("잘못된 주소이거나 더 이상 유효하지 않은 공개 링크입니다.");
    }

    const { tenantId, projectTarget, project, template } = context;
    const publicOrigin = getPublicOriginFromRequest(request);
    const maliciousHtml = template.maliciousPageContent?.trim() ?? "";
    const isFallback = maliciousHtml.length === 0;
    const baseHtml = normalizeTrainingUrlPlaceholders(
      neutralizePreviewModalHtml(isFallback ? template.body || "" : maliciousHtml),
    );
    const trainingUrl = buildTrainingLinkUrl(normalized, { baseUrl: publicOrigin });
    const submitUrl = buildSubmitFormUrl(normalized, { baseUrl: publicOrigin });
    const hasTrainingToken = trainingTokenMatcher.test(baseHtml);
    const hasSubmitToken = submitTokenMatcher.test(baseHtml);
    const hasFormTag = formTagMatcher.test(baseHtml);

    let renderedHtml = baseHtml
      .replace(trainingTokenReplacer, trainingUrl)
      .replace(submitTokenReplacer, submitUrl);

    if (!hasTrainingToken && !hasSubmitToken && !hasFormTag) {
      renderedHtml = injectTrainingLink(renderedHtml, trainingUrl, {
        replaceSingleAnchor: false,
        replaceFirstAnchor: true,
        replaceFirstButton: true,
        appendType: "button",
      });
    }

    if (isFallback) {
      const isTest = projectTarget.status === "test";
      const banner = isTest
        ? '<div style="background:#fef3c7; color:#92400e; padding:12px 16px; border-radius:12px; margin-bottom:16px; font-size:13px; font-weight:600;">악성 본문이 설정되지 않아 메일 본문을 임시로 표시합니다.</div>'
        : '<div style="background:#f8fafc; color:#64748b; padding:8px 12px; border-radius:8px; margin-bottom:12px; font-size:12px;">콘텐츠 미설정으로 임시 화면을 표시합니다.</div>';
      renderedHtml = `${banner}${renderedHtml}`;
    }

    const now = new Date();
    const openedAt = projectTarget.openedAt ?? now;
    const clickedAt = projectTarget.clickedAt ?? now;
    const shouldIncrementOpen = !projectTarget.openedAt;
    const shouldIncrementClick = !projectTarget.clickedAt;
    const nextStatus = projectTarget.status === "submitted" ? "submitted" : "clicked";

    await updateProjectTargetForTenant(tenantId, projectTarget.id, {
      openedAt: shouldIncrementOpen ? openedAt : projectTarget.openedAt,
      clickedAt: shouldIncrementClick ? clickedAt : projectTarget.clickedAt,
      status: nextStatus,
    });
    if ((shouldIncrementOpen || shouldIncrementClick) && projectTarget.status !== "test") {
      await updateProjectForTenant(tenantId, project.id, {
        openCount: (project.openCount ?? 0) + (shouldIncrementOpen ? 1 : 0),
        clickCount: (project.clickCount ?? 0) + (shouldIncrementClick ? 1 : 0),
      });
    }

    const response = new NextResponse(renderedHtml, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...HTML_RESPONSE_SECURITY_HEADERS,
      },
    });
    response.cookies.set("ps_flow_token", normalized, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });
    return response;
  } catch {
    return buildMissingLandingResponse("요청한 피싱 랜딩 페이지를 불러오지 못했습니다.");
  }
}
