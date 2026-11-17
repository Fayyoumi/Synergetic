import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/** Kassa speaks only approved lines; drafts fall back to the built-in copy. */

test.describe.configure({ mode: "serial" });
test.skip(() => test.info().project.name !== "phone", "run once");

const env = Object.fromEntries(
  readFileSync(path.join(__dirname, "../../.env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const db = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
type Seed = { question: string; options: string[]; answer_index: number };
const seed: Seed[] = JSON.parse(readFileSync(path.join(__dirname, "../../content/questions.json"), "utf8"));

async function firstCorrectReveal(page: Page) {
  await page.goto("/play/trivia");
  await page.getByRole("button", { name: "يلا نبدأ!" }).click();
  const q = (await page.getByTestId("question-text").textContent())!.trim();
  const s = seed.find((x) => x.question === q)!;
  await page.locator('[data-testid^="option-"]', { hasText: s.options[s.answer_index] }).click();
  await expect(page.getByTestId("kassa-line")).toBeVisible();
  return (await page.getByTestId("kassa-line").textContent())!.trim();
}

test.afterAll(async () => {
  await db().from("kassa_lines").update({ status: "draft" }).like("id", "correct:family:%");
});

test("draft lines are never shown", async ({ page }) => {
  await db().from("kassa_lines").update({ status: "draft" }).like("id", "correct:family:%");
  expect(await firstCorrectReveal(page)).toBe("صح! برافو عليك.");
});

test("approved lines are used (only ones that fit: solo has no name)", async ({ page }) => {
  const { data } = await db().from("kassa_lines").update({ status: "approved" }).like("id", "correct:family:%").select("text");
  const usable = (data ?? []).map((r) => r.text as string).filter((t) => !t.includes("{name}"));
  expect(usable.length).toBeGreaterThan(0);
  const line = await firstCorrectReveal(page);
  expect(usable).toContain(line);
});
