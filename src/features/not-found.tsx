import { cookies } from "next/headers";
import { getMessages, LOCALE_COOKIE_NAME, resolveLocale } from "@/lib/i18n";

export default async function NotFound() {
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value ?? null);
  const messages = getMessages(locale);

  return (
    <div className="flex min-h-full items-center justify-center bg-background px-6 py-16 text-center">
      <p className="text-base font-medium text-foreground">
        {messages["common.pageNotFound"]}
      </p>
    </div>
  );
}
