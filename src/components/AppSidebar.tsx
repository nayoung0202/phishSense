"use client";

import { LayoutDashboard, FolderKanban, Users, FileText, BookOpen, Mail, FileBarChart } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { SidebarAccountCard } from "@/components/SidebarAccountCard";
import { useFeatureFlags } from "@/components/FeatureFlagProvider";
import { useI18n } from "@/components/I18nProvider";
import { useSettingsTenant } from "@/features/settings/useSettingsTenant";
import { getSettingsSidebarItems } from "@/features/settings/navigation";

const workspaceMenuItems: Array<{ label: string; href: Route; icon: typeof LayoutDashboard }> = [
  {
    label: "대시보드",
    href: "/" as Route,
    icon: LayoutDashboard,
  },
  {
    label: "프로젝트",
    href: "/projects" as Route,
    icon: FolderKanban,
  },
  {
    label: "훈련대상 관리",
    href: "/targets" as Route,
    icon: Users,
  },
  {
    label: "템플릿 관리",
    href: "/templates" as Route,
    icon: FileText,
  },
  {
    label: "훈련 안내 페이지",
    href: "/training-pages" as Route,
    icon: BookOpen,
  },
  {
    label: "보고서 관리",
    href: "/reports/settings" as Route,
    icon: FileBarChart,
  },
  {
    label: "발송 설정",
    href: "/admin/smtp" as Route,
    icon: Mail,
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { settingsV2Enabled, billingUiEnabled, byokUiEnabled } = useFeatureFlags();
  const { t } = useI18n();
  const { membership, isLoading } = useSettingsTenant();
  const localizedWorkspaceMenuItems = workspaceMenuItems.map((item) => ({
    ...item,
    label: t(item.label),
  }));
  const isSettingsSidebar =
    settingsV2Enabled &&
    (pathname === "/settings" || pathname.startsWith("/settings/"));
  const menuItems = isSettingsSidebar
    ? getSettingsSidebarItems({
        t,
        role: membership?.role ?? null,
        isLoading,
        billingUiEnabled,
        byokUiEnabled,
      })
    : localizedWorkspaceMenuItems;
  const isMenuActive = (url: Route) =>
    url === "/" ? pathname === "/" : pathname === url || pathname.startsWith(`${url}/`);

  return (
    <Sidebar>
      <SidebarHeader className="p-6">
        <Link href="/" data-testid="link-logo" aria-label={t("대시보드로 이동")} className="inline-flex">
          <div className="flex items-center gap-2">
            <div
              className="text-[20pt] font-bold tracking-tight"
              style={{ fontFamily: "'NanumSquareRound', var(--font-sans)" }}
            >
              <span style={{ color: "#FDF6E3" }}>Phish</span>
              <span style={{ color: "#4EC3E0" }}>Sense</span>
            </div>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            {isSettingsSidebar ? t("settings.title") : t("Workspace")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isMenuActive(item.href)}>
                    <Link
                      href={item.href}
                      data-testid={`link-${(item.href.slice(1) || "dashboard").replace(/\//g, "-")}`}
                    >
                      <item.icon className="w-5 h-5" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      {settingsV2Enabled ? (
        <SidebarFooter className="px-4 pb-4">
          <SidebarAccountCard />
        </SidebarFooter>
      ) : null}
    </Sidebar>
  );
}
