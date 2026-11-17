import { describe, expect, it } from "vitest";
import { csvRowToContent, parseCsv } from "@/lib/admin/content";
import { questionSchema } from "@/lib/content/schemas";
import { wrapText } from "@/lib/share/story";

describe("CSV upload", () => {
  it("parses quotes, escaped quotes, commas and newlines inside quotes", () => {
    const rows = parseCsv('a,b,c\n1,"x, y","he said ""hi"""\n2,"line1\nline2",z\n');
    expect(rows).toEqual([
      { a: "1", b: "x, y", c: 'he said "hi"' },
      { a: "2", b: "line1\nline2", c: "z" },
    ]);
  });

  it("handles CRLF, a BOM and blank lines", () => {
    expect(parseCsv("﻿id,text\r\n\r\nt1,hello\r\n")).toEqual([{ id: "t1", text: "hello" }]);
  });

  it("turns a question row into a valid draft question", () => {
    const [row] = parseCsv(
      "id,lang,category,difficulty,country_tags,question,option_1,option_2,option_3,option_4,answer_index,source_url\n" +
        "geo-0101,ar,geo,easy,JO|PS,ما هي عاصمة فلسطين؟,القدس,غزة,رام الله,نابلس,0,https://example.org\n",
    );
    const q = csvRowToContent("questions", row);
    expect(q).toMatchObject({ country_tags: ["JO", "PS"], options: ["القدس", "غزة", "رام الله", "نابلس"], answer_index: 0, status: "draft" });
    expect(questionSchema.safeParse(q).success).toBe(true);
  });

  it("rejects an approved question without a source", () => {
    const [row] = parseCsv(
      "id,category,difficulty,question,option_1,option_2,option_3,option_4,answer_index,status\ngeo-0102,geo,easy,q,a,b,c,d,1,approved\n",
    );
    expect(questionSchema.safeParse(csvRowToContent("questions", row)).success).toBe(false);
  });
});

describe("story text wrapping", () => {
  const measure = (s: string) => s.length * 10;
  it("wraps by words without breaking them", () => {
    expect(wrapText(measure, "aaa bbb ccc ddd", 75)).toEqual(["aaa bbb", "ccc ddd"]);
  });
  it("keeps an over-long single word on its own line", () => {
    expect(wrapText(measure, "aaaaaaaaaaaa b", 50)).toEqual(["aaaaaaaaaaaa", "b"]);
  });
});
