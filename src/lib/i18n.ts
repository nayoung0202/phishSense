import { enUS, ja as jaDateFns, ko as koDateFns } from "date-fns/locale";
import type { Locale } from "date-fns";
import { enMessages } from "@/lib/i18n-messages/en";
import { jaMessages } from "@/lib/i18n-messages/ja";
import {
  koMessages,
  type TranslationKey,
  type TranslationMessages,
} from "@/lib/i18n-messages/ko";

export const LOCALE_COOKIE_NAME = "ps_locale";

export const supportedLocales = ["ko", "en", "ja"] as const;

export type AppLocale = (typeof supportedLocales)[number];
export type TranslationValue = string | number | null | undefined;

const localeSet = new Set<AppLocale>(supportedLocales);
const interpolationPattern = /\{\{(\w+)\}\}/g;

export const localeLabels: Record<AppLocale, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
};

const messagesByLocale: Record<AppLocale, TranslationMessages> = {
  ko: koMessages,
  en: enMessages,
  ja: jaMessages,
};

const intlLocaleByAppLocale: Record<AppLocale, string> = {
  ko: "ko-KR",
  en: "en-US",
  ja: "ja-JP",
};

const dateFnsLocaleByAppLocale: Record<AppLocale, Locale> = {
  ko: koDateFns,
  en: enUS,
  ja: jaDateFns,
};

export const resolveLocale = (value: string | null | undefined): AppLocale => {
  if (!value) return "ko";
  return localeSet.has(value as AppLocale) ? (value as AppLocale) : "ko";
};

export const getMessages = (locale: AppLocale) => messagesByLocale[locale];
export const getIntlLocale = (locale: AppLocale) =>
  intlLocaleByAppLocale[locale];
export const getDateFnsLocale = (locale: AppLocale) =>
  dateFnsLocaleByAppLocale[locale];

export const formatMessage = (
  messages: TranslationMessages,
  key: TranslationKey,
  values?: Record<string, TranslationValue>,
) => {
  const template = messages[key] ?? key;

  if (!values) {
    return template;
  }

  return template.replace(interpolationPattern, (_, name: string) => {
    const raw = values[name];
    return raw === null || raw === undefined ? "" : String(raw);
  });
};

export type { TranslationKey };
