import { describe, expect, it } from "vitest";
import { pickKassaLine, type KassaLine } from "@/lib/kassa/lines";

const lines: KassaLine[] = [
  { id: "correct:family:0", event: "correct", mood: "family", text: "برافو {name}!" },
  { id: "correct:family:1", event: "correct", mood: "family", text: "ممتاز! كمّل هيك." },
  { id: "correct:friends:0", event: "correct", mood: "friends", text: "{name} طلع بيفهم!" },
  { id: "wrong:roast:0", event: "wrong", mood: "roast", text: "غلط… تعوّدنا." },
  { id: "final_winner:family:0", event: "final_winner", mood: "family", text: "مبروك {name}، {points} نقطة!" },
];

describe("Kassa lines", () => {
  it("fills placeholders", () => {
    expect(pickKassaLine(lines, "final_winner", "family", 1, { name: "ليلى", points: "٢٬٤٠٠" })).toBe("مبروك ليلى، ٢٬٤٠٠ نقطة!");
  });

  it("skips lines that need a name when there isn't one", () => {
    for (let seed = 0; seed < 20; seed++) expect(pickKassaLine(lines, "correct", "family", seed)).toBe("ممتاز! كمّل هيك.");
    expect(pickKassaLine(lines, "final_winner", "family", 1, { name: "ليلى" })).toBeNull(); // no points
  });

  it("uses the room's mood, falling back to family", () => {
    expect(pickKassaLine(lines, "correct", "friends", 3, { name: "كريم" })).toBe("كريم طلع بيفهم!");
    expect(pickKassaLine(lines, "final_winner", "roast", 3, { name: "كريم", points: "1" })).toBe("مبروك كريم، 1 نقطة!");
  });

  it("never falls back from family to a cheekier mood", () => {
    expect(pickKassaLine(lines, "wrong", "family", 1)).toBeNull();
  });

  it("is stable for a seed, so the TV and phones agree", () => {
    const a = pickKassaLine(lines, "correct", "family", "room-1:q3", { name: "س" });
    const b = pickKassaLine(lines, "correct", "family", "room-1:q3", { name: "س" });
    expect(a).toBe(b);
  });

  it("returns null when nothing is approved for the event", () => {
    expect(pickKassaLine([], "correct", "family", 1)).toBeNull();
  });
});
