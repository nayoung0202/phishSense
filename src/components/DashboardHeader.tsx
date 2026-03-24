"use client";

import Link from "next/link";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Settings2, User } from "lucide-react";
import { useFeatureFlags } from "@/components/FeatureFlagProvider";
import { useI18n } from "@/components/I18nProvider";

export function DashboardHeader() {
  const { settingsV2Enabled } = useFeatureFlags();
  const { t } = useI18n();

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      window.location.href = "/login?reason=logout";
    }
  };

  return (
    <header className="flex items-center justify-between border-b border-border p-4">
      <SidebarTrigger data-testid="button-sidebar-toggle" />

      {settingsV2Enabled ? <div aria-hidden="true" /> : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="hover-elevate active-elevate-2 flex items-center gap-2 rounded-lg p-1"
              data-testid="button-user-menu"
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary text-primary-foreground">
                  관
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>{t("account.admin")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem data-testid="button-profile">
              <User className="mr-2 h-4 w-4" />
              {t("account.profile")}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings/general">
                <Settings2 className="mr-2 h-4 w-4" />
                {t("account.settings")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout} data-testid="button-logout">
              <LogOut className="mr-2 h-4 w-4" />
              {t("account.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </header>
  );
}
