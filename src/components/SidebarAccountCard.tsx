"use client";

import Link from "next/link";
import { LogOut, Settings2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useI18n } from "@/components/I18nProvider";

const getInitials = (name: string | null | undefined, email: string | null | undefined) => {
  const trimmedName = name?.trim();
  if (trimmedName) {
    return trimmedName.slice(0, 2).toUpperCase();
  }

  const localPart = email?.split("@")[0]?.trim();
  return localPart?.slice(0, 2).toUpperCase() || "PS";
};

export function SidebarAccountCard() {
  const { data } = useAuthSession();
  const { t } = useI18n();

  const name = data?.user?.name?.trim() || null;
  const email = data?.user?.email?.trim() || null;

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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl border border-sidebar-border/70 bg-sidebar-accent/60 px-3 py-3 text-left transition-colors hover:bg-sidebar-accent"
          data-testid="button-sidebar-account-menu"
        >
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
              {getInitials(name, email)}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-sidebar-foreground/70">
              {t("account.currentAccount")}
            </span>
            <span className="block truncate text-sm font-semibold text-sidebar-foreground">
              {email ?? name ?? "-"}
            </span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-64 rounded-xl"
      >
        <DropdownMenuLabel className="space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">
            {t("account.currentAccount")}
          </span>
          <span className="block truncate text-sm">{email ?? name ?? "-"}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/general" data-testid="link-settings">
            <Settings2 className="mr-2 h-4 w-4" />
            {t("account.settings")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleLogout} data-testid="button-sidebar-logout">
          <LogOut className="mr-2 h-4 w-4" />
          {t("account.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
