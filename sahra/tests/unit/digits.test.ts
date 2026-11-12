import { describe, expect, it } from "vitest";
import { formatNumber, formatPoints, roomCode, toArabicDigits, toWesternDigits } from "@/lib/i18n/digits";

describe("digits", () => {
  it("uses Arabic-Indic digits in Arabic and Western digits in English", () => {
    expect(formatNumber(1500, "ar")).toBe("١٬٥٠٠");
    expect(formatNumber(1500, "en")).toBe("1,500");
    expect(formatPoints(300, "ar")).toBe("+٣٠٠");
    expect(formatPoints(0, "en")).toBe("0");
  });

  it("converts both ways", () => {
    expect(toArabicDigits("2022")).toBe("٢٠٢٢");
    expect(toWesternDigits("٢٠٢٢")).toBe("2022");
    expect(toWesternDigits("۱۲۳")).toBe("123");
  });

  it("always shows room codes in Western digits", () => {
    expect(roomCode("٤٨٢٧")).toBe("4827");
    expect(roomCode("4827")).toBe("4827");
  });
});
