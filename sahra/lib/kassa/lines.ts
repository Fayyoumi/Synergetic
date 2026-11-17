/**
 * Picking Kassa's line for an event (pure).
 * Lines come from kassa_lines (approved only). The same seed gives the same
 * line, so the TV and phones can agree without sending the text around.
 */

export const KASSA_MOODS = ["family", "friends", "roast"] as const;
export type KassaMood = (typeof KASSA_MOODS)[number];

export type KassaLine = { id: string; event: string; mood: KassaMood; text: string };
export type KassaVars = { name?: string; points?: string };

/** Small stable hash (FNV-1a) for picking a line from a seed. */
export function hashSeed(seed: string | number): number {
  let h = 2166136261;
  for (const ch of String(seed)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function fill(text: string, vars: KassaVars): string {
  return text.replace(/\{(name|points)\}/g, (_, k: "name" | "points") => vars[k] ?? "");
}

function usable(line: KassaLine, vars: KassaVars): boolean {
  if (line.text.includes("{name}") && !vars.name) return false;
  if (line.text.includes("{points}") && !vars.points) return false;
  return true;
}

/**
 * A line for `event` in `mood`, with placeholders filled. Falls back to the
 * family mood (always safe), and returns null when there's no usable line.
 */
export function pickKassaLine(
  lines: readonly KassaLine[],
  event: string,
  mood: KassaMood,
  seed: string | number,
  vars: KassaVars = {},
): string | null {
  for (const m of mood === "family" ? (["family"] as const) : [mood, "family" as const]) {
    const pool = lines.filter((l) => l.event === event && l.mood === m && usable(l, vars)).sort((a, b) => a.id.localeCompare(b.id));
    if (pool.length) return fill(pool[hashSeed(`${event}:${seed}`) % pool.length].text, vars);
  }
  return null;
}
