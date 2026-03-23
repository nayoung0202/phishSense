"use client";

import { LayoutDashboard, FolderKanban, Users, FileText, BookOpen, Mail, FileBarChart } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
} from "@/components/ui/sidebar";

const menuItems: Array<{ title: string; url: Route; icon: typeof LayoutDashboard }> = [
  {
    title: "대시보드",
    url: "/" as Route,
    icon: LayoutDashboard,
  },
  {
    title: "프로젝트",
    url: "/projects" as Route,
    icon: FolderKanban,
  },
  {
    title: "훈련대상 관리",
    url: "/targets" as Route,
    icon: Users,
  },
  {
    title: "템플릿 관리",
    url: "/templates" as Route,
    icon: FileText,
  },
  {
    title: "훈련 안내 페이지",
    url: "/training-pages" as Route,
    icon: BookOpen,
  },
  {
    title: "보고서 관리",
    url: "/reports/settings" as Route,
    icon: FileBarChart,
  },
  {
    title: "발송 설정",
    url: "/admin/smtp" as Route,
    icon: Mail,
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const isMenuActive = (url: Route) =>
    url === "/" ? pathname === "/" : pathname === url || pathname.startsWith(`${url}/`);

  return (
    <Sidebar>
      <SidebarHeader className="p-6">
        <Link href="/" data-testid="link-logo" aria-label="대시보드로 이동" className="inline-flex">
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
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isMenuActive(item.url)}>
                    <Link href={item.url} data-testid={`link-${item.url.slice(1) || "dashboard"}`}>
                      <item.icon className="w-5 h-5" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
