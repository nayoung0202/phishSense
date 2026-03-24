"use client";

import { type ReactNode, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { createQueryClient } from "@/lib/queryClient";
import { FeatureFlagProvider } from "@/components/FeatureFlagProvider";
import { I18nProvider } from "@/components/I18nProvider";
import type { FeatureFlags } from "@/lib/featureFlags";
import type { AppLocale } from "@/lib/i18n";

export function AppProviders({
  children,
  featureFlags,
  initialLocale,
}: {
  children: ReactNode;
  featureFlags: FeatureFlags;
  initialLocale: AppLocale;
}) {
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <FeatureFlagProvider value={featureFlags}>
        <I18nProvider initialLocale={initialLocale}>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </I18nProvider>
      </FeatureFlagProvider>
    </QueryClientProvider>
  );
}
