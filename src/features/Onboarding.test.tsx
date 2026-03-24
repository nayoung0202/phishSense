import React, { type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { createQueryClient } from "@/lib/queryClient";
import Onboarding, {
  normalizeReturnTo,
  shouldContinueProvisioningPolling,
} from "./Onboarding";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const renderWithClient = (ui: ReactElement) => {
  const queryClient = createQueryClient();

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Onboarding returnTo 정규화", () => {
  it("내부 경로는 그대로 유지한다", () => {
    expect(normalizeReturnTo("/projects?tab=list")).toBe("/projects?tab=list");
  });

  it("외부 URL은 루트로 fallback한다", () => {
    expect(normalizeReturnTo("https://evil.example")).toBe("/");
    expect(normalizeReturnTo("//evil.example")).toBe("/");
  });

  it("인증 API나 인코딩된 경로 우회 입력은 차단한다", () => {
    expect(normalizeReturnTo("/api/auth/logout")).toBe("/");
    expect(normalizeReturnTo("/%2f%2fevil.example")).toBe("/");
    expect(normalizeReturnTo("/foo%5cbar")).toBe("/");
  });

  it("query string에 포함된 invite token 인코딩은 허용한다", () => {
    expect(normalizeReturnTo("/tenant-invites?token=a%2Fb%3D%3D")).toBe(
      "/tenant-invites?token=a%2Fb%3D%3D",
    );
  });

  it("자동 확인 polling은 제한 시간 안에서만 유지한다", () => {
    expect(shouldContinueProvisioningPolling(1000, 2000)).toBe(true);
    expect(shouldContinueProvisioningPolling(1000, 32000)).toBe(false);
    expect(shouldContinueProvisioningPolling(null, 32000)).toBe(false);
  });
});

describe("Onboarding tenant 생성", () => {
  it("tenant가 없으면 조직 생성 폼을 보여 준다", async () => {
    server.use(
      http.get("/api/auth/platform-context", () =>
        HttpResponse.json({
          authenticated: true,
          status: "tenant_missing",
          hasAccess: false,
          onboardingRequired: true,
          tenantId: null,
          currentTenantId: null,
          tenants: [],
          products: [],
          platformProduct: null,
          localEntitlement: null,
        }),
      ),
    );

    renderWithClient(<Onboarding />);

    await screen.findByLabelText("회사 또는 조직 이름");
    expect(screen.getByText("사용할 회사 또는 조직 이름을 입력해 주세요. 생성 후 이용 권한을 다시 확인합니다.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "회사 또는 조직 만들기" }),
    ).toBeDisabled();
  });

  it("조직 생성 성공 후 자동 대기 화면을 보여 준다", async () => {
    let createdTenantName = "";

    server.use(
      http.get("/api/auth/platform-context", () =>
        HttpResponse.json({
          authenticated: true,
          status: "tenant_missing",
          hasAccess: false,
          onboardingRequired: true,
          tenantId: null,
          currentTenantId: null,
          tenants: [],
          products: [],
          platformProduct: null,
          localEntitlement: null,
        }),
      ),
      http.post("/api/platform/tenants", async ({ request }) => {
        const body = (await request.json()) as { name: string };
        createdTenantName = body.name;

        return HttpResponse.json(
          {
            authenticated: true,
            createdTenant: {
              tenantId: "tenant-1",
              name: "Acme",
              role: "OWNER",
            },
            status: "entitlement_pending",
            hasAccess: false,
            onboardingRequired: true,
            tenantId: "tenant-1",
            currentTenantId: "tenant-1",
            tenants: [{ tenantId: "tenant-1", name: "Acme", role: "OWNER" }],
            products: [],
            platformProduct: {
              tenantId: "tenant-1",
              productId: "PHISHSENSE",
              status: "ACTIVE",
            },
            localEntitlement: null,
          },
          { status: 201 },
        );
      }),
    );

    renderWithClient(<Onboarding />);

    await screen.findByLabelText("회사 또는 조직 이름");
    fireEvent.change(screen.getByLabelText("회사 또는 조직 이름"), {
      target: { value: "Acme" },
    });
    fireEvent.click(screen.getByRole("button", { name: "회사 또는 조직 만들기" }));

    await waitFor(() => {
      expect(createdTenantName).toBe("Acme");
    });

    expect(await screen.findByText("이용 권한을 연결하는 중입니다.")).toBeInTheDocument();
    expect(
      screen.getByText("이용 권한이 연결되면 자동으로 다음 화면으로 이동합니다."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("이용 권한 정보를 확인하는 중입니다. 잠시 후 다시 시도해 주세요."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "회사 또는 조직 만들기" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "상태 다시 확인" })).not.toBeInTheDocument();
  });

  it("조직 생성 충돌 오류를 사용자 메시지로 보여 준다", async () => {
    server.use(
      http.get("/api/auth/platform-context", () =>
        HttpResponse.json({
          authenticated: true,
          status: "tenant_missing",
          hasAccess: false,
          onboardingRequired: true,
          tenantId: null,
          currentTenantId: null,
          tenants: [],
          products: [],
          platformProduct: null,
          localEntitlement: null,
        }),
      ),
      http.post("/api/platform/tenants", () =>
        HttpResponse.json(
          {
            error:
              "이미 사용 중인 이름이거나 요청이 충돌했습니다. 다른 이름으로 다시 시도해 주세요.",
          },
          { status: 409 },
        ),
      ),
    );

    renderWithClient(<Onboarding />);

    await screen.findByLabelText("회사 또는 조직 이름");
    fireEvent.change(screen.getByLabelText("회사 또는 조직 이름"), {
      target: { value: "Acme" },
    });
    fireEvent.click(screen.getByRole("button", { name: "회사 또는 조직 만들기" }));

    expect(
      await screen.findByText(
        "이미 사용 중인 이름이거나 요청이 충돌했습니다. 다른 이름으로 다시 시도해 주세요.",
      ),
    ).toBeInTheDocument();
  });

  it("플랫폼 상태를 불러오지 못하면 수동 재확인 버튼을 보여 준다", async () => {
    server.use(
      http.get("/api/auth/platform-context", () =>
        HttpResponse.json({
          authenticated: true,
          status: "platform_unavailable",
          hasAccess: false,
          onboardingRequired: true,
          tenantId: "tenant-1",
          currentTenantId: "tenant-1",
          tenants: [{ tenantId: "tenant-1", name: "Acme", role: "OWNER" }],
          products: [],
          platformProduct: {
            tenantId: "tenant-1",
            productId: "PHISHSENSE",
            status: "ACTIVE",
          },
          localEntitlement: null,
        }),
      ),
    );

    renderWithClient(<Onboarding />);

    expect(
      await screen.findByText("서비스 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "상태 다시 확인" })).toBeInTheDocument();
  });
});
