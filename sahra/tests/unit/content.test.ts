import { describe, expect, it } from "vitest";
import { loadSeedContent } from "@/lib/content/load";
import { KASSA_EVENTS, MOODS, questionSchema, traitSchema } from "@/lib/content/schemas";

const content = loadSeedContent();

describe("seed content", () => {
  it("validates every seed file", () => {
    expect(content.questions.length).toBeGreaterThanOrEqual(12);
    expect(content.charades).toHaveLength(15);
    expect(content.prompts).toHaveLength(5);
    expect(content.traits).toHaveLength(30);
  });

  it("ships the 12 verified Arabic questions as approved, each with a source", () => {
    const approved = content.questions.filter((q) => q.status === "approved");
    expect(approved.map((q) => q.id).sort()).toEqual(
      [
        "food-0001", "geo-0001", "geo-0002", "geo-0003", "hist-0001", "hist-0002",
        "lang-0001", "sci-0001", "sci-0002", "sport-0001", "sport-0002", "tv-0001",
      ].sort(),
    );
    for (const q of approved) {
      expect(q.lang).toBe("ar");
      expect(q.source_url).toMatch(/^https:\/\//);
    }
  });

  it("stores the right answers against the stored option order", () => {
    const answer = (id: string) => {
      const q = content.questions.find((x) => x.id === id)!;
      return q.options[q.answer_index];
    };
    expect(answer("geo-0001")).toBe("عمّان");
    expect(answer("geo-0002")).toBe("مصر");
    expect(answer("geo-0003")).toBe("جبل أم الدامي");
    expect(answer("sport-0001")).toBe("٢٠٢٢");
    expect(answer("sport-0002")).toBe("٧");
    expect(answer("food-0001")).toBe("الأردن");
    expect(answer("hist-0001")).toBe("١٩٤٦");
    expect(answer("hist-0002")).toBe("عمّان");
    expect(answer("sci-0001")).toBe("عطارد");
    expect(answer("sci-0002")).toBe("٣٦٦");
    expect(answer("lang-0001")).toBe("٢٨");
    expect(answer("tv-0001")).toBe("سوريا");
  });

  it("keeps machine translations as drafts, with the same answer as the Arabic original", () => {
    const english = content.questions.filter((q) => q.lang === "en");
    expect(english.length).toBeGreaterThan(0);
    for (const en of english) {
      expect(en.status).toBe("draft");
      const ar = content.questions.find((q) => q.id === en.id.replace(/-en$/, ""))!;
      expect(en.answer_index).toBe(ar.answer_index);
      expect(en.difficulty).toBe(ar.difficulty);
    }
  });

  it("refuses an approved question without a source (no invented facts)", () => {
    const result = questionSchema.safeParse({
      id: "geo-0099", lang: "ar", category: "geo", difficulty: "easy", country_tags: [],
      question: "?", options: ["a", "b", "c", "d"], answer_index: 0, status: "approved",
    });
    expect(result.success).toBe(false);
  });

  it("refuses image categories in the MVP", () => {
    const result = questionSchema.safeParse({
      id: "flags-0001", lang: "ar", category: "flags", difficulty: "easy", country_tags: [],
      question: "?", options: ["a", "b", "c", "d"], answer_index: 0, source_url: "https://x.org", status: "draft",
    });
    expect(result.success).toBe(false);
  });

  it("only approves the human-written traits; AI-drafted ones wait for review", () => {
    const approved = content.traits.filter((t) => t.status === "approved").map((t) => t.text);
    expect(approved).toEqual([
      "أول واحد بينام بالسهرة",
      "بيضيع بالطريق دايماً",
      "بياكل أكثر شي",
      "بيبكي بالأفلام",
      "بيرد على الرسائل بعد يومين",
    ]);
  });

  it("never allows a banned trait to be approved", () => {
    const banned = { id: "trait-0999", lang: "ar", text: "x", mood_min: "family", banned: true, banned_topic: "weight" };
    expect(traitSchema.safeParse({ ...banned, status: "approved" }).success).toBe(false);
    expect(traitSchema.safeParse({ ...banned, status: "draft" }).success).toBe(true);
  });

  it("has templates with a {trait} slot", () => {
    expect(content.traitTemplates.find((t) => t.lang === "ar")?.templates[0]).toContain("{trait}");
  });

  it("has at least 5 Kassa lines per event per mood, all drafts for review", () => {
    const kassa = content.kassa.ar;
    expect(kassa.status).toBe("draft");
    for (const event of KASSA_EVENTS) {
      for (const mood of MOODS) {
        expect(kassa.events[event]?.[mood]?.length, `${event}/${mood}`).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it("marks only 'شو أكثر شي بتخاف منه' as a friends-level prompt", () => {
    expect(content.prompts.filter((p) => p.mood_min === "friends").map((p) => p.text)).toEqual([
      "شو أكثر شي بتخاف منه وما حدا بيعرف؟",
    ]);
  });
});

describe("supabase/seed.sql", () => {
  it("is up to date with /content (run `npm run content:sql`)", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const { buildSeedSql } = await import("@/lib/content/seedSql");
    const onDisk = readFileSync(path.resolve(__dirname, "../../supabase/seed.sql"), "utf8");
    expect(onDisk).toBe(buildSeedSql(content));
  });
});
