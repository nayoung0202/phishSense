import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.restoreAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.AUTH_SESSION_COOKIE_NAME = "ps_session";
  process.env.APP_BASE_URL = "https://app.phishsense.cloud";
  delete process.env.AUTH_DEV_BYPASS;
});

describe("middleware 인증 및 플랫폼 게이트", () => {
  it("OIDC 로그인 시작 API는 무세션이어도 통과시킨다", async () => {
    const request = new NextRequest("http://localhost/api/auth/oidc/login");

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("보호 페이지 무세션 요청을 로그인 페이지로 리다이렉트한다", async () => {
    const request = new NextRequest("http://localhost/projects?tab=list");
    const response = await middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.phishsense.cloud/login?returnTo=%2Fprojects%3Ftab%3Dlist",
    );
  });

  it("AUTH_DEV_BYPASS=true이면 보호 페이지 무세션 요청을 통과시킨다", async () => {
    process.env.AUTH_DEV_BYPASS = "true";

    const request = new NextRequest("http://localhost/projects?tab=list");
    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("플랫폼 컨텍스트가 ready이면 보호 페이지 요청을 통과시킨다", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          authenticated: true,
          hasAccess: true,
          onboardingRequired: false,
          status: "ready",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const request = new NextRequest("http://localhost/projects", {
      headers: {
        cookie: "ps_session=session-1",
      },
    });

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("settings 페이지도 보호 경로로 처리한다", async () => {
    const request = new NextRequest("http://localhost/settings/general");
    const response = await middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.phishsense.cloud/login?returnTo=%2Fsettings%2Fgeneral",
    );
  });

  it("플랫폼 온보딩이 필요하면 보호 페이지를 onboarding으로 리다이렉트한다", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          authenticated: true,
          hasAccess: false,
          onboardingRequired: true,
          status: "tenant_selection_required",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const request = new NextRequest("http://localhost/projects");
    request.cookies.set("ps_session", "session-1");

    const response = await middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.phishsense.cloud/onboarding?reason=tenant_selection_required&returnTo=%2Fprojects",
    );
  });

  it("플랫폼 온보딩이 필요하면 보호 API 요청에 403을 반환한다", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          authenticated: true,
          hasAccess: false,
          onboardingRequired: true,
          status: "entitlement_pending",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const request = new NextRequest("http://localhost/api/projects");
    request.cookies.set("ps_session", "session-1");

    const response = await middleware(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: "Forbidden",
      reason: "entitlement_pending",
    });
  });

  it("tenant_missing 상태에서도 온보딩용 tenant 생성 API는 통과시킨다", async () => {
    const request = new NextRequest("http://localhost/api/platform/tenants", {
      method: "POST",
      headers: {
        cookie: "ps_session=session-1",
      },
    });

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tenant_missing 상태에서도 초대 수락 API는 통과시킨다", async () => {
    const request = new NextRequest(
      "http://localhost/api/platform/tenant-invites/invite-token-1/accept",
      {
        method: "POST",
        headers: {
          cookie: "ps_session=session-1",
        },
      },
    );

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tenant 생성 API도 무세션 요청이면 401을 반환한다", async () => {
    const request = new NextRequest("http://localhost/api/platform/tenants", {
      method: "POST",
    });

    const response = await middleware(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: "Unauthorized",
    });
  });

  it("초대 수락 API도 무세션 요청이면 401을 반환한다", async () => {
    const request = new NextRequest(
      "http://localhost/api/platform/tenant-invites/invite-token-1/accept",
      {
        method: "POST",
      },
    );

    const response = await middleware(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: "Unauthorized",
    });
  });

  it("onboarding 페이지에서 ready 상태면 홈으로 리다이렉트한다", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          authenticated: true,
          hasAccess: true,
          onboardingRequired: false,
          status: "ready",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const request = new NextRequest("http://localhost/onboarding");
    request.cookies.set("ps_session", "session-1");

    const response = await middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.phishsense.cloud/",
    );
  });
});
