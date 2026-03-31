import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const settingsTenantMock = vi.hoisted(() => ({
  useSettingsTenant: vi.fn(),
}));

vi.mock("@/components/I18nProvider", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/features/settings/useSettingsTenant", () => ({
  useSettingsTenant: settingsTenantMock.useSettingsTenant,
}));

import { SettingsShell } from "./SettingsShell";

describe("SettingsShell", () => {
  beforeEach(() => {
    settingsTenantMock.useSettingsTenant.mockReturnValue({
      tenantId: "tenant-1",
      membership: { tenantId: "tenant-1", role: "OWNER", name: "Acme" },
      isLoading: false,
    });
  });

  it("설정 헤더와 tenant 요약을 표시한다", () => {
    render(
      <SettingsShell>
        <div>content</div>
      </SettingsShell>,
    );

    expect(screen.getByText("settings.title")).toBeInTheDocument();
    expect(screen.getByText("settings.subtitle")).toBeInTheDocument();
    expect(screen.getByText("OWNER")).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("tenant 정보가 없어도 콘텐츠를 렌더링한다", () => {
    settingsTenantMock.useSettingsTenant.mockReturnValue({
      tenantId: null,
      membership: null,
      isLoading: false,
    });

    render(
      <SettingsShell>
        <div>content</div>
      </SettingsShell>,
    );

    expect(screen.getByText("content")).toBeInTheDocument();
    expect(screen.queryByText("tenant-1")).not.toBeInTheDocument();
    expect(screen.queryByText("OWNER")).not.toBeInTheDocument();
  });
});
