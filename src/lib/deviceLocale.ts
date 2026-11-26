import type { Locale } from "@shared/types";

/**
 * The device's language, if it is one we have: the first of the browser's
 * preferred languages that is Vietnamese or English. null when neither is listed.
 */
export function deviceLocale(langs: readonly string[]): Locale | null {
  for (const l of langs) {
    const base = l.toLowerCase().split("-")[0];
    if (base === "vi" || base === "en") return base;
  }
  return null;
}
