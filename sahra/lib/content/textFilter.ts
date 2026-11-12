import type { Blocklist } from "./schemas";

export type FilterResult = { text: string; flagged: boolean };

/** Strips Arabic diacritics/tatweel and unifies common letter variants. */
export function normaliseArabic(input: string): string {
  return input
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

function normalise(s: string): string {
  return normaliseArabic(s.toLowerCase());
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Masks blocklisted words with *** and reports whether anything matched.
 * Matching is whole-word (so "classic" isn't hit by "ass"), case-insensitive,
 * and ignores Arabic diacritics and alef/yaa/taa-marbuta variants.
 * Arabic words also match with a leading "ال" / "و" / "يا" attached.
 */
export function createTextFilter(list: Blocklist): (input: string) => FilterResult {
  const terms = [...list.ar, ...list.en]
    .map(normalise)
    .sort((a, b) => b.length - a.length);

  return (input: string) => {
    // Work on a normalised copy, but map indexes back to the original string.
    const chars = [...input];
    const normChars = chars.map((c) => normalise(c));
    const mask = new Array<boolean>(chars.length).fill(false);

    const isWordAt = (i: number) => i >= 0 && i < chars.length && WORD_CHAR.test(normChars[i]);

    for (const term of terms) {
      const termChars = [...term];
      for (let start = 0; start < chars.length; start++) {
        // Build the normalised text from `start`, skipping chars that normalise to "".
        let i = start;
        let k = 0;
        while (k < termChars.length && i < chars.length) {
          if (normChars[i] === "") {
            i++;
            continue;
          }
          if (normChars[i] !== termChars[k]) break;
          i++;
          k++;
        }
        if (k < termChars.length) continue;
        const before = start - 1;
        const prefixOk = !isWordAt(before) || arabicPrefixAt(normChars, before);
        if (prefixOk && !isWordAt(i)) {
          for (let m = start; m < i; m++) mask[m] = true;
        }
      }
    }

    if (!mask.some(Boolean)) return { text: input, flagged: false };
    let out = "";
    for (let i = 0; i < chars.length; i++) {
      if (mask[i]) {
        if (i === 0 || !mask[i - 1]) out += "***";
      } else out += chars[i];
    }
    return { text: out, flagged: true };
  };
}

/** True when the word chars ending at `end` are a whole Arabic prefix (ال, و, يا, وال). */
function arabicPrefixAt(normChars: string[], end: number): boolean {
  let start = end;
  while (start - 1 >= 0 && WORD_CHAR.test(normChars[start - 1])) start--;
  const prefix = normChars.slice(start, end + 1).join("");
  return ["ال", "و", "يا", "وال", "بال"].includes(prefix);
}
