"use client";

import {
  startTransition,
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  formatMessage,
  getMessages,
  LOCALE_COOKIE_NAME,
  localeLabels,
  resolveLocale,
  type AppLocale,
  type TranslationKey,
  type TranslationValue,
} from "@/lib/i18n";

type I18nContextValue = {
  locale: AppLocale;
  localeLabels: typeof localeLabels;
  setLocale: (locale: AppLocale) => void;
  t: (key: TranslationKey, values?: Record<string, TranslationValue>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale: AppLocale;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<AppLocale>(resolveLocale(initialLocale));

  const value = useMemo<I18nContextValue>(() => {
    const messages = getMessages(locale);

    return {
      locale,
      localeLabels,
      setLocale: (nextLocale) => {
        const normalized = resolveLocale(nextLocale);
        if (normalized === locale) {
          return;
        }
        setLocaleState(normalized);
        document.cookie = `${LOCALE_COOKIE_NAME}=${normalized}; path=/; max-age=31536000; samesite=lax`;
        document.documentElement.lang = normalized;
        startTransition(() => {
          router.refresh();
        });
      },
      t: (key, values) => formatMessage(messages, key, values),
    };
  }, [locale, router]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);

  if (!value) {
    throw new Error("I18nProvider가 필요합니다.");
  }

  return value;
}
