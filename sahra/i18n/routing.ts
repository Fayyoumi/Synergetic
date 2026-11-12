import { defineRouting } from "next-intl/routing";

export const locales = ["ar", "en"] as const;
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  // Arabic first: "/" is Arabic, English lives under "/en".
  defaultLocale: "ar",
  localePrefix: "as-needed",
  // Don't switch to English because of the browser's Accept-Language header.
  // A player's explicit toggle is remembered in the NEXT_LOCALE cookie.
  localeDetection: false,
});

export function dirFor(locale: string): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}
