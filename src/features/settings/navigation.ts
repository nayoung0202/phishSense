import type { Route } from "next";
import {
  Globe2,
  KeyRound,
  Receipt,
  Sparkles,
  Users2,
  type LucideIcon,
} from "lucide-react";
import type { TranslationKey, TranslationValue } from "@/lib/i18n";

export type SettingsSidebarItem = {
  href: Route;
  key: "general" | "members" | "subscription" | "credits" | "api-keys";
  label: string;
  icon: LucideIcon;
};

export function getSettingsSidebarItems(options: {
  t: (key: TranslationKey, values?: Record<string, TranslationValue>) => string;
  role: string | null;
  isLoading: boolean;
  billingUiEnabled: boolean;
  byokUiEnabled: boolean;
}): SettingsSidebarItem[] {
  const { t, role, isLoading, billingUiEnabled, byokUiEnabled } = options;
  const canManageBilling = isLoading || role === "OWNER";
  const canViewCredits = isLoading || role === "OWNER" || role === "ADMIN";
  const canManageAiKeys = isLoading || role === "OWNER";
  const items: SettingsSidebarItem[] = [
    {
      href: "/settings/general" as Route,
      key: "general",
      label: t("settings.general"),
      icon: Globe2,
    },
    {
      href: "/settings/members" as Route,
      key: "members",
      label: t("settings.members"),
      icon: Users2,
    },
    {
      href: "/settings/subscription" as Route,
      key: "subscription",
      label: t("settings.subscription"),
      icon: Receipt,
    },
    {
      href: "/settings/credits" as Route,
      key: "credits",
      label: t("settings.credits"),
      icon: Sparkles,
    },
    {
      href: "/settings/api-keys" as Route,
      key: "api-keys",
      label: t("settings.apiKeys"),
      icon: KeyRound,
    },
  ];

  return items.filter((item) => {
    if (item.key === "subscription") {
      return billingUiEnabled && canManageBilling;
    }

    if (item.key === "credits") {
      return canViewCredits;
    }

    if (item.key === "api-keys") {
      return byokUiEnabled && canManageAiKeys;
    }

    return true;
  });
}
