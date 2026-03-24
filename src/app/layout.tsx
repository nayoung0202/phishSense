import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import "suneditor/dist/css/suneditor.min.css";
import "./globals.css";
import { AppProviders } from "@/components/AppProviders";
import { AppShell } from "@/components/AppShell";
import { ClientOnly } from "@/components/ClientOnly";
import { getMessages, resolveLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n";
import { getFeatureFlags } from "@/server/featureFlags";

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value ?? null);
  const messages = getMessages(locale);

  return {
    title: messages["metadata.title"] ?? "PhishSense Dashboard",
    description: messages["metadata.description"] ?? "피싱 대응 대시보드",
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const initialLocale = resolveLocale(
    cookieStore.get(LOCALE_COOKIE_NAME)?.value ?? null,
  );
  const featureFlags = getFeatureFlags();

  return (
    <html lang={initialLocale} className="dark" data-scroll-behavior="smooth">
      <body suppressHydrationWarning className="min-h-screen bg-background font-sans antialiased">
        <AppProviders featureFlags={featureFlags} initialLocale={initialLocale}>
          <ClientOnly>
            <AppShell>{children}</AppShell>
          </ClientOnly>
        </AppProviders>
      </body>
    </html>
  );
}
