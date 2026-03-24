"use client";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/hooks/use-toast";
import type { AppLocale } from "@/lib/i18n";

export default function GeneralSettingsPage() {
  const { locale, localeLabels, setLocale, t } = useI18n();
  const { toast } = useToast();

  return (
    <Card className="border-white/10 bg-card/85 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
      <div className="max-w-2xl space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
            General
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-tight">
            {t("settings.general.title")}
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {t("settings.general.description")}
          </p>
        </div>

        <div className="rounded-2xl border border-border/70 bg-background/50 p-5">
          <Label htmlFor="settings-locale">{t("settings.general.localeLabel")}</Label>
          <Select
            value={locale}
            onValueChange={(value) => {
              setLocale(value as AppLocale);
              toast({
                title: t("settings.general.title"),
                description: t("settings.general.saved"),
              });
            }}
          >
            <SelectTrigger id="settings-locale" className="mt-3 max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(localeLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </Card>
  );
}
