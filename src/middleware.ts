import { NextRequest, NextResponse } from "next/server";
import {
  getAuthDevBypassConfig,
  getSessionCookieName,
} from "@/server/auth/config";
import { getAppOrigin } from "@/server/auth/redirect";

const PROTECTED_PAGE_PREFIXES = [
  "/projects",
  "/targets",
  "/templates",
  "/training-pages",
  "/settings",
  "/admin",
];

const SESSION_PAGE_PREFIXES = ["/onboarding"];

const PUBLIC_API_ROUTES = [
  {
    method: "GET",
    pathname: "/api/auth/oidc/login",
  },
];

type ApiRouteMatcher = {
  method: string;
  pathname?: string;
  pathnamePattern?: RegExp;
};

const SESSION_API_ROUTES: ApiRouteMatcher[] = [
  {
    method: "POST",
    pathname: "/api/platform/tenants",
  },
  {
    method: "POST",
    pathnamePattern: /^\/api\/platform\/tenant-invites\/[^/]+\/accept$/,
  },
];

/** 인증 없이 접근 가능한 페이지 경로 */
const PUBLIC_PAGE_PATHS = ["/login"];

const isProtectedPagePath = (pathname: string) => {
  if (pathname === "/") return true;
  return PROTECTED_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
};

const isSessionPagePath = (pathname: string) =>
  SESSION_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

const isPublicPagePath = (pathname: string) =>
  PUBLIC_PAGE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

const isAuthApiPath = (pathname: string) => pathname.startsWith("/api/auth/");

const isPublicApiRoute = (pathname: string, method: string) =>
  PUBLIC_API_ROUTES.some(
    (route) => route.method === method && route.pathname === pathname,
  );

const isSessionApiRoute = (pathname: string, method: string) =>
  SESSION_API_ROUTES.some(
    (route) =>
      route.method === method &&
      ((route.pathname && route.pathname === pathname) ||
        (route.pathnamePattern && route.pathnamePattern.test(pathname))),
  );

type RouteAccessLevel = "public" | "session" | "ready" | null;

const getRouteAccessLevel = (
  pathname: string,
  method: string,
): RouteAccessLevel => {
  if (isPublicPagePath(pathname)) return "public";
  if (isPublicApiRoute(pathname, method)) return "public";
  if (isSessionPagePath(pathname)) return "session";
  if (isAuthApiPath(pathname)) return "session";
  if (isSessionApiRoute(pathname, method)) return "session";
  if (pathname.startsWith("/api/")) return "ready";
  if (isProtectedPagePath(pathname)) return "ready";
  return null;
};

const unauthorizedApiResponse = () =>
  NextResponse.json(
    {
      error: "Unauthorized",
    },
    { status: 401 },
  );

const redirectToLogin = (request: NextRequest) => {
  const loginUrl = new URL("/login", getAppOrigin());
  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (returnTo && returnTo !== "/") {
    loginUrl.searchParams.set("returnTo", returnTo);
  }
  return NextResponse.redirect(loginUrl);
};

const getSessionCheckOrigin = (request: NextRequest) => {
  const override = process.env.AUTH_SESSION_CHECK_ORIGIN?.trim();
  if (override) return override;

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return request.nextUrl.origin;
};

type PlatformContextMiddlewarePayload = {
  authenticated: boolean;
  hasAccess: boolean;
  onboardingRequired: boolean;
  status: string;
};

const getPlatformContext = async (
  request: NextRequest,
): Promise<PlatformContextMiddlewarePayload | null> => {
  const sessionUrl = new URL(
    "/api/auth/platform-context",
    getSessionCheckOrigin(request),
  );

  try {
    const validationResponse = await fetch(sessionUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        cookie: request.headers.get("cookie") ?? "",
      },
    });

    if (!validationResponse.ok) {
      return null;
    }

    return (await validationResponse.json()) as PlatformContextMiddlewarePayload;
  } catch {
    return null;
  }
};

const redirectToOnboarding = (request: NextRequest, reason: string) => {
  const onboardingUrl = new URL("/onboarding", getAppOrigin());
  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  onboardingUrl.searchParams.set("reason", reason);
  if (returnTo && returnTo !== "/onboarding") {
    onboardingUrl.searchParams.set("returnTo", returnTo);
  }
  return NextResponse.redirect(onboardingUrl);
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiPath = pathname.startsWith("/api/");
  const accessLevel = getRouteAccessLevel(pathname, request.method);

  if (!accessLevel || accessLevel === "public") {
    return NextResponse.next();
  }

  if (getAuthDevBypassConfig().enabled) {
    return NextResponse.next();
  }

  const cookieName = getSessionCookieName();
  const sessionCookie = request.cookies.get(cookieName)?.value?.trim();

  if (!sessionCookie) {
    return isApiPath ? unauthorizedApiResponse() : redirectToLogin(request);
  }

  if (accessLevel === "session") {
    if (isSessionPagePath(pathname)) {
      const platformContext = await getPlatformContext(request);
      if (platformContext?.hasAccess && !platformContext.onboardingRequired) {
        return NextResponse.redirect(new URL("/", getAppOrigin()));
      }
    }
    return NextResponse.next();
  }

  const platformContext = await getPlatformContext(request);
  if (!platformContext || !platformContext.authenticated) {
    return isApiPath ? unauthorizedApiResponse() : redirectToLogin(request);
  }

  if (!platformContext.hasAccess || platformContext.onboardingRequired) {
    if (isApiPath) {
      return NextResponse.json(
        {
          error: "Forbidden",
          reason: platformContext.status,
        },
        { status: 403 },
      );
    }
    return redirectToOnboarding(request, platformContext.status);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/onboarding/:path*",
    "/projects/:path*",
    "/targets/:path*",
    "/templates/:path*",
    "/training-pages/:path*",
    "/settings/:path*",
    "/admin/:path*",
    "/api/:path*",
  ],
};
