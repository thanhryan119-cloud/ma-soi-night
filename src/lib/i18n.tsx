"use client";

import { NextIntlClientProvider, createTranslator, useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import vi from "@messages/vi.json";
import en from "@messages/en.json";
import type { Locale } from "@shared/types";
import type { LogEntry } from "@shared/types";
import { deviceLocale } from "./deviceLocale";

export const MESSAGES = { vi, en } as const;
const STORAGE_KEY = "msn:locale";

interface LocaleCtx {
  locale: Locale;
  /** true when the user explicitly picked a language on this device */
  explicit: boolean;
  setLocale: (l: Locale) => void;
  suggestLocale: (l: Locale) => void;
}

const Ctx = createContext<LocaleCtx>({
  locale: "vi",
  explicit: false,
  setLocale: () => {},
  suggestLocale: () => {},
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("vi");
  const [explicit, setExplicit] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "vi" || saved === "en") {
        setLocaleState(saved);
        setExplicit(true);
        return;
      }
    } catch {}
    // Nothing picked yet: an English device starts in English. It counts as the
    // player's own choice (rooms do not switch it back), but is not saved, so
    // it follows the device if that changes.
    if (deviceLocale(navigator.languages?.length ? navigator.languages : [navigator.language]) === "en") {
      setLocaleState("en");
      setExplicit(true);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    setExplicit(true);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {}
  }, []);

  /** Use a locale (e.g. the room default) only if the user never picked one. */
  const suggestLocale = useCallback(
    (l: Locale) => {
      if (!explicit) setLocaleState(l);
    },
    [explicit],
  );

  const value = useMemo(
    () => ({ locale, explicit, setLocale, suggestLocale }),
    [locale, explicit, setLocale, suggestLocale],
  );
  return (
    <Ctx.Provider value={value}>
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="Asia/Ho_Chi_Minh">
        {children}
      </NextIntlClientProvider>
    </Ctx.Provider>
  );
}

export const useLocale = () => useContext(Ctx);

export type T = ReturnType<typeof useTranslations>;
export const useT = () => useTranslations();

const translators = {
  vi: createTranslator({ locale: "vi", messages: vi }),
  en: createTranslator({ locale: "en", messages: en }),
};

/** A translator for a fixed locale (used by the bilingual projector). */
export function translatorFor(locale: Locale): T {
  return translators[locale] as unknown as T;
}

const ROLE_PARAMS = new Set(["role", "from", "step"]);

/** Formats a server log entry; role ids inside params are translated. */
export function formatLog(t: T, e: LogEntry): string {
  const params: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(e.params)) params[k] = ROLE_PARAMS.has(k) ? t(`roles.${v}.name`) : v;
  try {
    return t(e.key, params);
  } catch {
    return e.key;
  }
}
