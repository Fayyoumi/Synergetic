/**
 * Number formatting rules:
 * - Arabic UI uses Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩).
 * - English UI uses Western digits.
 * - Room codes always use Western digits: render them with `roomCode()`, never `formatNumber()`.
 */
const ARABIC_INDIC = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

export function toArabicDigits(input: string): string {
  return input.replace(/[0-9]/g, (d) => ARABIC_INDIC[Number(d)]);
}

export function toWesternDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** Formats an integer with grouping, in the digits of the given UI locale. */
export function formatNumber(value: number, locale: string): string {
  const western = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    useGrouping: true,
  }).format(value);
  if (locale !== "ar") return western;
  // Arabic thousands separator is U+066C.
  return toArabicDigits(western.replace(/,/g, "٬"));
}

/** Signed points such as "+٣٠٠" / "+300". */
export function formatPoints(value: number, locale: string): string {
  const sign = value > 0 ? "+" : "";
  return sign + formatNumber(value, locale);
}

/** Room codes are 4 Western digits in every language. */
export function roomCode(code: string): string {
  return toWesternDigits(code);
}
