"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/I18nProvider";
import { useSettingsTenant } from "@/features/settings/useSettingsTenant";

export function SettingsShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { membership, tenantId } = useSettingsTenant();

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(78,195,224,0.12),transparent_28%),linear-gradient(180deg,rgba(7,13,24,0.96),rgba(5,8,16,1))]">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <Card className="border-white/10 bg-card/80 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)] backdrop-blur">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-primary/80">
            {t("Workspace")}
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-foreground">
            {t("settings.title")}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {t("settings.subtitle")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {tenantId ? <Badge variant="outline">{tenantId}</Badge> : null}
            {membership ? <Badge>{membership.role}</Badge> : null}
          </div>
        </Card>
        <div className="mt-6 min-w-0">{children}</div>
      </div>
    </div>
  );
}
