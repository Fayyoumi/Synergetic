import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Team trivia, end to end: 1 host screen + 3 phones play a full 5-question game.
 * One phone drops mid-game and comes back. Runs against a live Supabase.
 */

test.skip(() => test.info().project.name !== "host-720p", "multi-device tests run once, on the host viewport");

type Seed = { question: string; options: string[]; answer_index: number };
const seed: Seed[] = JSON.parse(readFileSync(path.join(__dirname, "../../content/questions.json"), "utf8"));
const answerFor = (q: string) => {
  const s = seed.find((x) => x.question === q.trim());
  if (!s) throw new Error(`unknown question ${q}`);
  return s.options[s.answer_index];
};
const western = (s: string) => Number(s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[^\d]/g, ""));

async function phone(browser: Browser, code: string, name: string) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`/join/${code}`);
  await page.getByLabel("اسمك").fill(name);
  await page.getByTestId("consent").check();
  await page.getByRole("button", { name: "ادخل السهرة" }).click();
  await expect(page.getByTestId("player-lobby")).toBeVisible();
  return { ctx, page };
}

/** Taps the right (or a wrong) option on a phone. */
async function answer(p: Page, question: string, right: boolean) {
  const correct = answerFor(question);
  for (let i = 0; i < 4; i++) {
    const btn = p.getByTestId(`phone-option-${i}`);
    const text = (await btn.textContent()) ?? "";
    if (text.includes(correct) === right) {
      await btn.click();
      return;
    }
  }
}

test("1 host + 3 phones play a full team-trivia game", async ({ page: host, browser }) => {
  test.slow();
  await host.goto("/play/group");
  await host.getByTestId("create-trivia_team").click();
  await host.waitForURL(/\/host\/\d{4}$/);
  const code = (await host.getByTestId("room-code").textContent())!.trim();
  await host.getByRole("button", { name: "٥ أسئلة", exact: true }).click();

  const layla = await phone(browser, code, "ليلى");
  const karim = await phone(browser, code, "كريم");
  const sara = await phone(browser, code, "سارة");
  await expect(host.getByTestId("player-list").locator("li")).toHaveCount(3);

  await host.getByTestId("host-start").click();
  await expect(host.getByTestId("host-question")).toBeVisible();
  // Teams were balanced in join order: ليلى + سارة on team 1, كريم on team 2.
  await expect(layla.page.getByText("فريقك: فريق الشاي")).toBeVisible();
  await expect(karim.page.getByText("فريقك: فريق القهوة")).toBeVisible();

  let karimPage = karim.page;
  for (let i = 0; i < 5; i++) {
    const question = (await host.getByTestId("host-question").textContent())!;
    // The phones never see the answer before the reveal.
    await expect(layla.page.locator('[data-testid="phone-reveal"]')).toHaveCount(0);

    if (i === 2) {
      // كريم's phone drops during question 3: everyone sees it, and he times out.
      await karimPage.close();
      await expect(host.getByTestId("seat-كريم").or(host.getByTestId("answered-كريم"))).toContainText("انقطع");
      await expect(layla.page.getByTestId("conn-toasts")).toContainText("انقطع اتصال كريم");
      await answer(layla.page, question, true);
      await answer(sara.page, question, true);
      await expect(host.getByTestId("answered-count")).toContainText("جاوب ٢ من ٣");
      // No early reveal while a player is missing; it comes when time is up.
      await expect(host.getByTestId("host-option-0")).toHaveAttribute("data-state", "open");
      await expect(host.locator('[data-state="correct"]')).toBeVisible({ timeout: 25_000 });
      karimPage = await karim.ctx.newPage();
      await karimPage.goto(`/join/${code}`);
      await expect(karimPage.getByTestId("player-game")).toBeVisible();
    } else {
      await answer(layla.page, question, true);
      await answer(karimPage, question, i % 2 === 1); // wrong, right, -, right, wrong
      await answer(sara.page, question, i !== 4);
      // All three in: reveal at once.
      await expect(host.locator('[data-state="correct"]')).toBeVisible();
    }

    await expect(host.getByTestId("who-got-it")).toContainText("ليلى");
    await expect(layla.page.getByTestId("phone-reveal")).toContainText("نقطة");
    await host.getByTestId("host-advance").click(); // → scoreboard
    await expect(host.getByTestId("standings")).toBeVisible();
    await host.getByTestId("host-advance").click(); // → next question / final
  }

  await expect(host.getByTestId("winner")).toContainText("فريق الشاي ربح!");
  const team1 = western((await host.getByTestId("team-1-score").first().textContent())!);
  const team2 = western((await host.getByTestId("team-2-score").first().textContent())!);
  expect(team1).toBeGreaterThan(team2);
  await expect(layla.page.getByTestId("phone-final")).toContainText("مجموعك");
  await expect(karimPage.getByTestId("phone-final")).toBeVisible();

  // Scores and XP were saved for the players.
  await layla.page.goto("/profile");
  await expect(layla.page.getByTestId("profile-games")).toHaveText("١");

  // Play again goes back to the lobby.
  await host.getByTestId("play-again").click();
  await expect(host.getByTestId("host-start")).toBeVisible();

  for (const p of [layla, karim, sara]) await p.ctx.close();
});

test("phones can't answer twice, late, or for a question that isn't up", async ({ page: host, browser }) => {
  await host.goto("/play/group");
  await host.getByTestId("create-trivia_team").click();
  await host.waitForURL(/\/host\/\d{4}$/);
  const code = (await host.getByTestId("room-code").textContent())!.trim();
  const a = await phone(browser, code, "أ");
  const b = await phone(browser, code, "ب");
  const post = (p: Page, body: object) =>
    p.request.post(`/api/rooms/${code}/answer`, { data: body, headers: { connection: "close" } }).then((r) => r.json());

  expect((await post(a.page, { index: 0, choice: 0, answeredAt: null })).error).toBe("not_playing");
  await host.getByTestId("host-start").click();
  await expect(host.getByTestId("host-question")).toBeVisible();

  expect((await post(a.page, { index: 3, choice: 0, answeredAt: null })).error).toBe("stale_question");
  expect((await post(a.page, { index: 0, choice: 1, answeredAt: null })).ok).toBe(true);
  expect((await post(a.page, { index: 0, choice: 2, answeredAt: null })).error).toBe("already_answered");
  // The response to a player never includes the answer before the reveal.
  const view = await a.page.request.get(`/api/rooms/${code}/game`).then((r) => r.json());
  expect(view.game.reveal).toBeNull();
  expect(JSON.stringify(view)).not.toContain("answer_index");
  // Asking for the reveal before time is up is refused.
  const early = await b.page.request.post(`/api/rooms/${code}/game`, { data: { action: "timeup", index: 0 } }).then((r) => r.json());
  expect(early.error).toBe("too_early");
  // Players can't drive the game.
  const drive = await b.page.request.post(`/api/rooms/${code}/game`, { data: { action: "advance" } }).then((r) => r.json());
  expect(drive.error).toBe("not_host");

  await a.ctx.close();
  await b.ctx.close();
});
