import { expect, test, type Browser, type Page } from "@playwright/test";

/** Charades end to end: 1 host + 3 phones, against a live Supabase. */

test.skip(() => test.info().project.name !== "host-720p", "multi-device tests run once, on the host viewport");

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

async function createCharadesRoom(host: Page) {
  await host.goto("/play/group");
  await host.getByTestId("create-charades").click();
  await host.waitForURL(/\/host\/\d{4}$/);
  return (await host.getByTestId("room-code").textContent())!.trim();
}

const bodyText = (p: Page) => p.locator("body").innerText();

test("the word is only on the actor's phone; got it, skip, steal and a full game", async ({ page: host, browser }) => {
  test.slow();
  const code = await createCharadesRoom(host);
  const a = await phone(browser, code, "ليلى"); // team 1 (first actor)
  const b = await phone(browser, code, "كريم"); // team 2
  const c = await phone(browser, code, "سارة"); // team 1
  await host.getByTestId("host-start").click();

  // Turn 1: ليلى acts for team 1.
  await expect(host.getByTestId("host-charades")).toHaveAttribute("data-phase", "turn_ready");
  await expect(a.page.getByTestId("phone-begin")).toBeVisible();
  await expect(b.page.getByTestId("phone-begin")).toHaveCount(0);
  await a.page.getByTestId("phone-begin").click();

  const word1 = (await a.page.getByTestId("secret-word").textContent())!.trim();
  expect(word1.length).toBeGreaterThan(0);
  // Nobody else has the word: not the TV, not the other phones.
  for (const p of [host, b.page, c.page]) expect(await bodyText(p)).not.toContain(word1);
  // The non-actors' phones have no controls.
  await expect(b.page.getByTestId("phone-got-it")).toHaveCount(0);

  // Got it: team 1 scores the word, and it now shows on the TV.
  await a.page.getByTestId("phone-got-it").click();
  await expect(host.getByTestId("turn-log")).toContainText(word1);
  const team1After = await host.getByTestId("charades-team-1").textContent();
  expect(team1After).not.toBe("٠");

  // Skip: the word stays hidden from the TV, and team 2 can steal it once.
  const word2 = (await a.page.getByTestId("secret-word").textContent())!.trim();
  await expect(a.page.getByTestId("secret-word")).not.toHaveText(word1);
  await a.page.getByTestId("phone-skip").click();
  await expect(host.getByTestId("turn-log")).toContainText("تخطّوا كلمة");
  expect(await bodyText(host)).not.toContain(word2);
  await host.getByTestId("host-steal").click();
  await expect(host.getByTestId("turn-log")).toContainText(`سرقة: ${word2}`);
  await expect(host.getByTestId("charades-team-2")).not.toHaveText("٠");
  await expect(host.getByTestId("host-steal")).toBeDisabled();

  // A player who isn't acting can't drive the turn.
  const r = await b.page.request.post(`/api/rooms/${code}/game`, { data: { action: "got_it" } }).then((x) => x.json());
  expect(r.error).toBe("not_actor");
  const secretForB = await b.page.request.get(`/api/rooms/${code}/secret`).then((x) => x.json());
  expect(secretForB.secret).toBeNull();

  // Guess every remaining word: when the deck runs out the turn ends.
  for (let i = 0; i < 20; i++) {
    const phase = await host.getByTestId("host-charades").getAttribute("data-phase");
    if (phase !== "turn_active") break;
    await a.page.getByTestId("phone-got-it").click();
    await a.page.waitForTimeout(150);
  }
  await expect(host.getByTestId("host-charades")).toHaveAttribute("data-phase", "turn_summary");

  // Turn 2: كريم acts for team 2. With no words left, each turn ends at once.
  await host.getByTestId("host-advance").click();
  await expect(b.page.getByTestId("phone-begin")).toBeVisible();
  for (let turn = 2; turn <= 6; turn++) {
    await expect(host.getByTestId("host-charades")).toHaveAttribute("data-phase", "turn_ready");
    await host.getByTestId("host-begin").click();
    await expect(host.getByTestId("host-charades")).toHaveAttribute("data-phase", "turn_summary");
    await host.getByTestId("host-advance").click();
  }
  await expect(host.getByTestId("winner")).toContainText("فريق الشاي ربح!");
  await expect(a.page.getByTestId("phone-charades-final")).toContainText("فريق الشاي ربح!");

  await host.getByTestId("play-again").click();
  await expect(host.getByTestId("host-start")).toBeVisible();
  for (const p of [a, b, c]) await p.ctx.close();
});

test("the turn ends by itself after 60 seconds", async ({ page: host, browser }) => {
  test.setTimeout(120_000);
  const code = await createCharadesRoom(host);
  const a = await phone(browser, code, "أ");
  const b = await phone(browser, code, "ب");
  await host.getByTestId("host-start").click();
  await host.getByTestId("host-begin").click();
  await expect(a.page.getByTestId("secret-word")).toBeVisible();
  await expect(host.getByRole("timer")).toBeVisible();
  await expect(host.getByTestId("host-charades")).toHaveAttribute("data-phase", "turn_summary", { timeout: 70_000 });
  // The unfinished word is not revealed as guessed.
  await expect(host.getByTestId("turn-log")).toHaveCount(0);
  await a.ctx.close();
  await b.ctx.close();
});
