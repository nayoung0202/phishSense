import type { Route } from "next";
import {
  Globe2,
  KeyRound,
  Link2,
  Receipt,
  Sparkles,
  Users2,
  type LucideIcon,
} from "lucide-react";
import type { TranslationKey, TranslationValue } from "@/lib/i18n";

const INTERNAL_PRODUCTION_SUBSCRIPTION_EMAIL_PATTERN =
  /^dev(\d{3})@evriz\.co\.kr$/i;

export type SettingsSidebarItem = {
  href: Route;
  key: "general" | "domain" | "members" | "subscription" | "credits" | "api-keys";
  label: string;
  icon: LucideIcon;
};

function canAccessSubscriptionMenuInProduction(accountEmail: string | null) {
  const normalizedEmail = accountEmail?.trim().toLowerCase() ?? "";
  const match = INTERNAL_PRODUCTION_SUBSCRIPTION_EMAIL_PATTERN.exec(normalizedEmail);

  if (!match?.[1]) {
    return false;
  }

  const accountNumber = Number(match[1]);
  return Number.isInteger(accountNumber) && accountNumber >= 1 && accountNumber <= 999;
}

export function getSettingsSidebarItems(options: {
  t: (key: TranslationKey, values?: Record<string, TranslationValue>) => string;
  role: string | null;
  isLoading: boolean;
  billingUiEnabled: boolean;
  byokUiEnabled: boolean;
  accountEmail: string | null;
}): SettingsSidebarItem[] {
  const { t, role, isLoading, billingUiEnabled, byokUiEnabled, accountEmail } = options;
  const canManageBilling = isLoading || role === "OWNER";
  const canViewDomain = isLoading || role === "OWNER" || role === "ADMIN";
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
      href: "/settings/domain" as Route,
      key: "domain",
      label: t("settings.domain"),
      icon: Link2,
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
      if (!billingUiEnabled || !canManageBilling) {
        return false;
      }

      if (process.env.NODE_ENV !== "production") {
        return true;
      }

      return canAccessSubscriptionMenuInProduction(accountEmail);
    }

    if (item.key === "domain") {
      return canViewDomain;
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
