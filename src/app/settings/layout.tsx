import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { SettingsShell } from "@/features/settings/SettingsShell";
import { getFeatureFlags } from "@/server/featureFlags";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const featureFlags = getFeatureFlags();

  if (!featureFlags.settingsV2Enabled) {
    redirect("/");
  }

  return <SettingsShell>{children}</SettingsShell>;
}
