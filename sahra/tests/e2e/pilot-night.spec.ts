import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * A whole pilot night in one room: 1 host screen + 3 phones play a full team-trivia game,
 * go back to the lobby, switch to "Who among us?" and play it to the end, then the host
 * closes the night. Runs against a live Supabase.
 */

test.skip(() => test.info().project.name !== "host-720p", "multi-device tests run once, on the host viewport");

type Seed = { question: string; options: string[]; answer_index: number };
const seed: Seed[] = JSON.parse(readFileSync(path.join(__dirname, "../../content/questions.json"), "utf8"));
const answerFor = (q: string) => {
  const s = seed.find((x) => x.question === q.trim());
  if (!s) throw new Error(`unknown question ${q}`);
  return s.options[s.answer_index];
};

async function phone(browser: Browser, code: string, name: string) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`/join/${code}`);
  await page.getByLabel("اسمك").fill(name);
  await page.getByTestId("consent").check();
  await page.getByRole("button", { name: "ادخل السهرة" }).click();
  await expect(page.getByTestId("player-lobby")).toBeVisible();
  return { ctx, page, name };
}

async function answer(p: Page, question: string, right: boolean) {
  const correct = answerFor(question);
  for (let i = 0; i < 4; i++) {
    const btn = p.getByTestId(`phone-option-${i}`);
    if (((await btn.textContent()) ?? "").includes(correct) === right) return btn.click();
  }
}

test("a full night: team trivia, then Who among us?, then close the night", async ({ page: host, browser }) => {
  test.slow();
  await host.goto("/play/group");
  await host.getByTestId("create-trivia_team").click();
  await host.waitForURL(/\/host\/\d{4}$/);
  const code = (await host.getByTestId("room-code").textContent())!.trim();
  await host.getByRole("button", { name: "٥ أسئلة", exact: true }).click();

  const layla = await phone(browser, code, "ليلى");
  const karim = await phone(browser, code, "كريم");
  const sara = await phone(browser, code, "سارة");
  const phones = [layla, karim, sara];
  await expect(host.getByTestId("player-list").locator("li")).toHaveCount(3);

  // ── Game 1: team trivia, 5 questions ──
  await host.getByTestId("host-start").click();
  for (let i = 0; i < 5; i++) {
    await expect(host.getByTestId("host-question")).toBeVisible();
    const question = (await host.getByTestId("host-question").textContent())!;
    await answer(layla.page, question, true);
    await answer(karim.page, question, i % 2 === 0);
    await answer(sara.page, question, false);
    await expect(host.locator('[data-state="correct"]')).toBeVisible();
    await expect(host.getByTestId("kassa-line").first()).toBeVisible(); // Kassa reacts to the reveal
    await expect(layla.page.getByTestId("phone-reveal")).toContainText("نقطة");
    await host.getByTestId("host-advance").click(); // → scoreboard
    await expect(host.getByTestId("standings")).toBeVisible();
    await host.getByTestId("host-advance").click(); // → next question / final
  }
  await expect(host.getByTestId("winner")).toBeVisible();
  for (const p of phones) await expect(p.page.getByTestId("phone-final")).toBeVisible();

  // ── Back to the lobby, switch game ──
  await host.getByTestId("play-again").click();
  await expect(host.getByTestId("host-start")).toBeVisible();
  await host.getByRole("radio", { name: "مين فينا؟" }).click();
  await expect(host.getByRole("radio", { name: "مين فينا؟" })).toHaveAttribute("aria-checked", "true");

  // ── Game 2: Who among us? Everyone skips the secret prompts, so every round is a trait round. ──
  await host.getByTestId("host-start").click();
  await expect(host.getByTestId("host-who")).toHaveAttribute("data-phase", "prompts_collect");
  for (const p of phones) {
    while (!(await p.page.getByTestId("prompts-done").isVisible())) {
      await expect(p.page.getByTestId("prompt-text").or(p.page.getByTestId("prompts-done"))).toBeVisible();
      if (await p.page.getByTestId("prompts-done").isVisible()) break;
      await p.page.getByTestId("prompt-skip").click();
      await p.page.waitForTimeout(250);
    }
  }
  await host.getByTestId("host-open-voting").click();

  let rounds = 0;
  for (; rounds < 12; rounds++) {
    await expect(host.getByTestId("host-who")).toHaveAttribute("data-phase", /^(vote_open|final)$/);
    if ((await host.getByTestId("host-who").getAttribute("data-phase")) === "final") break;
    await layla.page.getByTestId("vote-كريم").click();
    await sara.page.getByTestId("vote-كريم").click();
    await karim.page.getByTestId("vote-سارة").click();
    await expect(host.getByTestId("who-reveal")).toBeVisible();
    await expect(host.getByTestId("round-title")).toContainText("كريم");
    await expect(host.getByTestId("kassa-line")).toBeVisible();
    await expect(layla.page.getByTestId("my-vote-result")).toContainText("+١٠٠");
    await host.getByTestId("host-advance").click();
  }
  expect(rounds).toBeGreaterThan(0);
  await expect(host.getByTestId("titles-of-night").locator("li")).toHaveCount(rounds);
  for (const p of phones) await expect(p.page.getByTestId("phone-who-final")).toBeVisible();

  // ── Close the night: totals and the night's titles ──
  await host.getByTestId("play-again").click();
  await expect(host.getByTestId("host-start")).toBeVisible();
  await host.getByRole("button", { name: "سكّر السهرة" }).click();
  await host.getByRole("button", { name: "سكّر السهرة" }).first().click();
  await expect(host.getByTestId("night-summary")).toBeVisible();
  await expect(host.getByTestId("night-titles").locator("li")).toHaveCount(rounds);

  for (const p of phones) await p.ctx.close();
});
