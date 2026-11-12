import { describe, expect, it } from "vitest";
import { createTextFilter, normaliseArabic } from "@/lib/content/textFilter";

const filter = createTextFilter({ ar: ["حمار", "كلب"], en: ["shit", "ass"] });

describe("text filter", () => {
  it("leaves clean text alone", () => {
    expect(filter("ليلى من عمّان")).toEqual({ text: "ليلى من عمّان", flagged: false });
  });

  it("masks whole words and flags the entry", () => {
    expect(filter("you shit!")).toEqual({ text: "you ***!", flagged: true });
    expect(filter("SHIT")).toEqual({ text: "***", flagged: true });
  });

  it("does not mask words that merely contain a bad word", () => {
    expect(filter("classic assessment").flagged).toBe(false);
  });

  it("matches Arabic with diacritics, tatweel and common prefixes", () => {
    expect(filter("يا حِمار").text).toBe("يا ***");
    expect(filter("حمــار").flagged).toBe(true);
    expect(filter("الكلب").text).toBe("ال***");
    expect(filter("والكلب").flagged).toBe(true);
    expect(filter("يا كلب").text).toBe("يا ***");
  });

  it("normalises alef and yaa variants", () => {
    expect(normaliseArabic("أحمد إلى آخر")).toBe("احمد الي اخر");
  });
});
