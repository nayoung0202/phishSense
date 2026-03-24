import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { getMessages, LOCALE_COOKIE_NAME, resolveLocale } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value ?? null);
  const messages = getMessages(locale);

  return {
    title: messages["metadata.login.title"],
    description: messages["metadata.login.description"],
  };
}

/**
 * /login 전용 레이아웃
 * AppShell(사이드바, 헤더)을 포함하지 않는 독립 레이아웃입니다.
 */
export default function LoginLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
