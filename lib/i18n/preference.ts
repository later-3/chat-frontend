import type { Locale } from "./types";

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "pi-locale";

/** Only an explicit saved choice overrides English; browser language is not a preference. */
export function resolveInitialLocale(stored: string | null | undefined): Locale {
  return stored === "zh-CN" ? "zh-CN" : DEFAULT_LOCALE;
}
