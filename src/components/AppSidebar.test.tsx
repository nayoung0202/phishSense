import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SidebarProvider } from "@/components/ui/sidebar";

const pathnameMock = vi.hoisted(() => ({
  value: "/",
}));

const featureFlagsMock = vi.hoisted(() => ({
  useFeatureFlags: vi.fn(),
}));

const settingsTenantMock = vi.hoisted(() => ({
  useSettingsTenant: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock.value,
}));

vi.mock("@/components/FeatureFlagProvider", () => ({
  useFeatureFlags: featureFlagsMock.useFeatureFlags,
}));

vi.mock("@/components/I18nProvider", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/features/settings/useSettingsTenant", () => ({
  useSettingsTenant: settingsTenantMock.useSettingsTenant,
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/components/SidebarAccountCard", () => ({
  SidebarAccountCard: () => <div>account-card</div>,
}));

import { AppSidebar } from "./AppSidebar";

describe("AppSidebar", () => {
  beforeEach(() => {
    pathnameMock.value = "/";
    featureFlagsMock.useFeatureFlags.mockReturnValue({
      settingsV2Enabled: true,
      billingUiEnabled: true,
      creditsEnforcementEnabled: false,
      byokUiEnabled: true,
    });
    settingsTenantMock.useSettingsTenant.mockReturnValue({
      membership: { tenantId: "tenant-1", role: "OWNER", name: "Acme" },
      isLoading: false,
    });
  });

  it("설정 경로에서는 기존 앱 메뉴 대신 설정 메뉴를 노출한다", () => {
    pathnameMock.value = "/settings/general";

    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>,
    );

    expect(screen.getByRole("link", { name: /settings.general/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /settings.members/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "프로젝트" })).not.toBeInTheDocument();
  });

  it("MEMBER는 설정 사이드바에서 권한 없는 항목을 보지 않는다", () => {
    pathnameMock.value = "/settings/members";
    settingsTenantMock.useSettingsTenant.mockReturnValue({
      membership: { tenantId: "tenant-1", role: "MEMBER", name: "Acme" },
      isLoading: false,
    });

    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>,
    );

    expect(screen.getByRole("link", { name: /settings.general/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /settings.members/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /settings.subscription/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /settings.credits/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /settings.apiKeys/i })).not.toBeInTheDocument();
  });

  it("일반 경로에서는 기존 앱 메뉴를 유지한다", () => {
    pathnameMock.value = "/projects";

    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>,
    );

    expect(screen.getByRole("link", { name: "프로젝트" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /settings.general/i })).not.toBeInTheDocument();
  });
});
