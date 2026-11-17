import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Solo trivia end to end, against a running Supabase (local: `npx supabase start`).
 * Every test gets a fresh browser context, so a fresh anonymous player.
 * The seed answers let the test choose right or wrong on purpose.
 */

type Seed = { question: string; options: string[]; answer_index: number; status: string };
const seed: Seed[] = JSON.parse(readFileSync(path.join(__dirname, "../../content/questions.json"), "utf8"));
const answerFor = (question: string) => {
  const q = seed.find((s) => s.question === question);
  if (!q) throw new Error(`unknown question: ${question}`);
  return q.options[q.answer_index];
};

const arabicNumber = (n: number) =>
  n.toLocaleString("en-US").replace(/,/g, "٬").replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);

const westernDigits = (s: string) =>
  Number(s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[^\d]/g, ""));

async function answer(page: Page, right: boolean) {
  const question = (await page.getByTestId("question-text").textContent())!.trim();
  const correct = answerFor(question);
  const options = page.locator('[data-testid^="option-"]:visible:not([disabled])');
  const count = await options.count();
  for (let i = 0; i < count; i++) {
    const text = (await options.nth(i).textContent()) ?? "";
    if (text.includes(correct) === right) {
      await options.nth(i).click();
      break;
    }
  }
  await expect(page.getByTestId("reveal-card")).toBeVisible();
}

/** Taps Next and waits until the reveal is gone (next question or results). */
async function next(page: Page) {
  await page.getByTestId("next").click();
  await expect(page.getByTestId("reveal-card")).toHaveCount(0);
}

async function startClassic(page: Page) {
  await page.goto("/play");
  await page.getByRole("link", { name: /فردي/ }).click();
  await page.getByRole("link", { name: /ليلة الأسئلة/ }).click();
  await expect(page.getByTestId("setup-max")).toBeVisible();
  const max = westernDigits((await page.getByTestId("setup-max").textContent())!);
  await page.getByRole("button", { name: "يلا نبدأ!" }).click();
  await expect(page.getByTestId("question-text")).toBeVisible();
  return max;
}

test.describe("solo trivia", () => {
  test.skip(({ browserName }) => browserName !== "chromium");

  test("a perfect classic round saves score, XP and badges", async ({ page }) => {
    const max = await startClassic(page);
    expect(max).toBeGreaterThan(0);
    for (let i = 0; i < 5; i++) {
      await answer(page, true);
      await expect(page.getByTestId("reveal-card")).toContainText("صعوبة");
      await next(page);
    }
    await expect(page.getByTestId("results")).toBeVisible();
    const score = westernDigits((await page.getByTestId("final-score").textContent())!);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(max);
    await expect(page.getByText("٥ من ٥ صح")).toBeVisible();
    await expect(page.getByText("علامة كاملة")).toBeVisible();
    await expect(page.getByText("أول جولة")).toBeVisible();

    await page.goto("/profile");
    await expect(page.getByTestId("profile-xp")).toHaveText(arabicNumber(Math.floor(score / 10)));
    await expect(page.getByTestId("profile-games")).toHaveText("١");
  });

  test("sharing a result makes a 1080×1920 story image", async ({ page }) => {
    await startClassic(page);
    for (let i = 0; i < 5; i++) {
      await answer(page, true);
      await next(page);
    }
    await page.getByTestId("share").click();
    const img = page.getByTestId("story-preview");
    await expect(img).toBeVisible();
    expect(await img.evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight])).toEqual([1080, 1920]);
    await expect(page.getByRole("link", { name: "احفظ الصورة" })).toHaveAttribute("download", "sahra.png");
  });

  test("a wrong answer shows the right one and your pick", async ({ page }) => {
    await startClassic(page);
    await answer(page, false);
    await expect(page.getByText("غلط!")).toBeVisible();
    await expect(page.locator('[data-state="correct"]')).toContainText("صح");
    await expect(page.locator('[data-state="picked"]')).toContainText("جوابك");
    await expect(page.getByTestId("score")).toHaveText("٠");
  });

  test("50:50 hides two wrong options and ×2 doubles the points, once each", async ({ page }) => {
    await startClassic(page);
    const question = (await page.getByTestId("question-text").textContent())!.trim();
    await page.getByTestId("joker-fifty").click();
    await expect(page.locator('[data-testid^="option-"]:visible')).toHaveCount(2);
    await expect(page.locator('[data-testid^="option-"]:visible', { hasText: answerFor(question) })).toHaveCount(1);
    await page.getByTestId("joker-double").click();
    await expect(page.getByTestId("joker-double")).toHaveAttribute("aria-pressed", "true");
    await answer(page, true);
    await expect(page.getByTestId("reveal-card")).toContainText("مضروبة ×٢");
    await next(page);
    await expect(page.getByTestId("joker-fifty")).toBeDisabled();
    await expect(page.getByTestId("joker-double")).toBeDisabled();
  });

  test("the timer runs out at 0 and scores nothing", async ({ page }) => {
    test.slow();
    await startClassic(page);
    await expect(page.getByRole("timer")).toBeVisible();
    await expect(page.getByText("خلص الوقت!")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("score")).toHaveText("٠");
  });

  test("a refresh mid-game resumes the same question and score", async ({ page }) => {
    await startClassic(page);
    await answer(page, true);
    await next(page);
    const question = await page.getByTestId("question-text").textContent();
    const score = await page.getByTestId("score").textContent();
    await page.reload();
    await expect(page.getByTestId("question-text")).toHaveText(question!);
    await expect(page.getByTestId("score")).toHaveText(score!);
  });

  test("reporting a question hides it and moves on", async ({ page }) => {
    await startClassic(page);
    const before = await page.getByTestId("question-text").textContent();
    await page.getByRole("button", { name: "بلّغ عن السؤال" }).click();
    await page.getByRole("button", { name: "بلّغ", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("شكراً");
    await expect(page.getByTestId("question-text")).not.toHaveText(before!);
  });

  test("sudden death ends at the first mistake", async ({ page }) => {
    await page.goto("/play/sudden");
    await page.getByRole("button", { name: "يلا نبدأ!" }).click();
    await answer(page, true);
    await next(page);
    await answer(page, true);
    await next(page);
    await answer(page, false);
    await expect(page.getByTestId("next")).toHaveText("شوف النتيجة");
    await next(page);
    await expect(page.getByTestId("results")).toBeVisible();
    await expect(page.getByText("٢ صح", { exact: true })).toBeVisible();
  });

  test("the daily challenge can be played once a day", async ({ page }) => {
    await page.goto("/play/daily");
    await page.getByRole("button", { name: "يلا نبدأ!" }).click();
    await answer(page, true);
    await next(page);
    await expect(page.getByTestId("results")).toBeVisible();
    await expect(page.getByText("خلص تحدي اليوم")).toBeVisible();

    await page.goto("/play/daily");
    await page.getByRole("button", { name: "يلا نبدأ!" }).click();
    await expect(page.getByTestId("results")).toBeVisible();
    await page.goto("/play/solo");
    await expect(page.getByText("لعبته اليوم")).toBeVisible();
  });

  test("English setup says the questions are in Arabic for now", async ({ page }) => {
    await page.goto("/en/play/trivia");
    await expect(page.getByText("Some questions are in Arabic")).toBeVisible();
  });

  test("anti-cheat: the server ignores fake fast timestamps and double submissions", async ({ page }) => {
    await page.goto("/play");
    await expect(page.getByTestId("streak-card")).toBeVisible(); // guest session exists
    // "connection: close": the test idles longer than the server's keep-alive between calls.
    const api = (body: object) =>
      page.request.post("/api/solo", { data: body, headers: { connection: "close" } }).then((r) => r.json());

    const start = await api({ action: "start", mode: "classic", categories: ["geo", "sport", "food", "hist", "sci", "tv", "lang"], difficulty: "mixed", locale: "ar" });
    expect(start.ok).toBe(true);
    const view = start.view;
    // The client never sees which option is right.
    expect(JSON.stringify(view)).not.toContain("answer_index");

    const correct = view.question.options.indexOf(answerFor(view.question.question));
    await page.waitForTimeout(6_000);
    // Claim we answered the instant the question appeared.
    const cheat = await api({ action: "answer", gameId: view.gameId, index: 0, choice: correct, answeredAt: view.question.startedAt, double: false });
    expect(cheat.ok).toBe(true);
    expect(cheat.view.reveal.correct).toBe(true);
    // ~6 s elapsed, 1.5 s grace: at most 11 s may count, never 15.
    const base = cheat.view.reveal.base;
    expect(cheat.view.reveal.speed).toBeLessThanOrEqual(Math.round((base * 11) / 30));

    // Sending the same answer again doesn't score twice.
    const again = await api({ action: "answer", gameId: view.gameId, index: 0, choice: correct, answeredAt: null, double: true });
    expect(again.view.points).toBe(cheat.view.points);
    expect(again.view.jokers.double).toBe(true);

    // Nobody else can read or play this game.
    const other = await page.context().browser()!.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto("/play");
    await expect(otherPage.getByTestId("streak-card")).toBeVisible();
    const res = await otherPage.request.post("/api/solo", { data: { action: "state", gameId: view.gameId } });
    expect(res.status()).toBe(404);
    await other.close();
  });

  test("anti-cheat: a forged round with made-up question ids is replaced by a real one", async ({ page }) => {
    await page.goto("/play");
    await expect(page.getByTestId("streak-card")).toBeVisible();
    const r = await page.request
      .post("/api/solo", { data: { action: "start", mode: "classic", categories: ["geo"], difficulty: "easy", locale: "ar", questionIds: ["geo-0003", "hist-0002", "x", "y", "z"] } })
      .then((x) => x.json());
    expect(r.ok).toBe(true);
    // geo-0003 / hist-0002 are legend questions, not allowed in an easy round.
    expect(["easy", "medium"]).toContain(r.view.question.difficulty);
  });

  test("profile: names are filtered, and 'delete my data' wipes the player", async ({ page }) => {
    await startClassic(page);
    await answer(page, true);
    await page.goto("/profile");
    await page.getByLabel("الاسم").fill("كريم shit");
    await page.getByRole("button", { name: "احفظ" }).first().click();
    await expect(page.getByRole("status")).toContainText("خبينا كلمة");
    await expect(page.getByRole("paragraph").filter({ hasText: "كريم ***" }).first()).toBeVisible();

    await page.getByRole("button", { name: "امسح بياناتي" }).click();
    await page.getByTestId("confirm-delete").click();
    await expect(page.getByText("انمسحت بياناتك.")).toBeVisible();
    await page.goto("/profile");
    await expect(page.getByTestId("profile-games")).toHaveText("٠");
  });
});
