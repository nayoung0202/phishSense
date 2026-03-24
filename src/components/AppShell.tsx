"use client";

import React, { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { DashboardHeader } from "@/components/DashboardHeader";

/** AppShell을 표시하지 않는 경로 접두사 */
const SHELL_EXCLUDED_PREFIXES = ["/login", "/onboarding", "/tenant-invites"];

const shouldExcludeShell = (pathname: string) =>
  SHELL_EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (shouldExcludeShell(pathname)) {
    return <>{children}</>;
  }

  const sidebarStyle = {
    "--sidebar-width": "280px",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <DashboardHeader />
          <main className="fullpage-scroll flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
