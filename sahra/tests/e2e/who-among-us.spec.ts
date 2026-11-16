import { expect, test, type Browser, type Page } from "@playwright/test";

/** Secret prompts + "Who among us?": 1 host + 3 phones, against a live Supabase. */

test.skip(() => test.info().project.name !== "host-720p", "multi-device tests run once, on the host viewport");

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

async function answerPrompts(p: Page, answers: (string | null)[]) {
  for (const a of answers) {
    await expect(p.getByTestId("prompt-text")).toBeVisible();
    if (a === null) await p.getByTestId("prompt-skip").click();
    else {
      await p.getByLabel("جوابك").fill(a);
      await p.getByTestId("prompt-send").click();
    }
    await p.waitForTimeout(250);
  }
}

test("secret prompts, voting, veto, titles: a full game", async ({ page: host, browser }) => {
  test.slow();
  await host.goto("/play/group");
  await host.getByTestId("create-who_among_us").click();
  await host.waitForURL(/\/host\/\d{4}$/);
  const code = (await host.getByTestId("room-code").textContent())!.trim();

  const layla = await phone(browser, code, "ليلى");
  const karim = await phone(browser, code, "كريم");
  const sara = await phone(browser, code, "سارة");
  const phones = [layla, karim, sara];
  await host.getByTestId("host-start").click();
  await expect(host.getByTestId("host-who")).toHaveAttribute("data-phase", "prompts_collect");

  // Secret answers (4 prompts: the 5th seed prompt is for "friends" nights only).
  // Karim's has a bad word: masked, flagged, never used in a round.
  await answerPrompts(layla.page, ["مقلوبة بالنوتيلا", null, null, null]);
  await answerPrompts(sara.page, ["فلافل بالعسل", null, null, null]);
  await karim.page.getByLabel("جوابك").fill("shit sandwich");
  await karim.page.getByTestId("prompt-send").click();
  await expect(karim.page.getByRole("status")).toContainText("خبينا كلمة");
  await answerPrompts(karim.page, [null, null, null]);
  await expect(layla.page.getByTestId("prompts-done")).toBeVisible();
  await expect(host.getByTestId("prompt-progress-ليلى")).toHaveText("٤ من ٤");

  // Nobody can read secret answers through the game state.
  const state = await sara.page.request.get(`/api/rooms/${code}/game`).then((r) => r.text());
  expect(state).not.toContain("مقلوبة");
  expect(await host.locator("body").innerText()).not.toContain("مقلوبة");

  await host.getByTestId("host-open-voting").click();
  await expect(host.getByTestId("host-who")).toHaveAttribute("data-phase", "vote_open");

  // You can't vote for yourself.
  const seats = await layla.page.request.get(`/api/rooms/${code}`).then((r) => r.json());
  const laylaSeat = seats.room.mySeatId;
  const self = await layla.page.request.post(`/api/rooms/${code}/vote`, { data: { index: 0, target: laylaSeat } }).then((r) => r.json());
  expect(self.error).toBe("self_vote");

  let vetoed = false;
  let authorRevealed = false;
  let titles = 0;
  for (let round = 0; round < 12; round++) {
    await expect(host.getByTestId("host-who")).toHaveAttribute("data-phase", /^(vote_open|final)$/);
    if ((await host.getByTestId("host-who").getAttribute("data-phase")) === "final") break;

    const isAnswer = (await host.getByTestId("who-answer").count()) > 0;
    if (isAnswer) {
      const text = (await host.getByTestId("who-answer").textContent())!;
      expect(text).not.toContain("***"); // flagged answers are never shown
      // Only the author's phone offers the veto.
      const owners = [];
      for (const p of phones) if ((await p.page.getByTestId("my-answer").count()) > 0) owners.push(p);
      expect(owners).toHaveLength(1);
      const author = owners[0];
      if (!vetoed) {
        await author.page.getByTestId("veto").click();
        await expect(host.getByTestId("vetoed")).toBeVisible();
        expect(await host.locator("body").innerText()).not.toContain(text.replace(/[«»]/g, ""));
        vetoed = true;
        await host.getByTestId("host-advance").click();
        continue;
      }
      // Everyone votes for the author's neighbour; the author is revealed.
      for (const p of phones) {
        const target = phones.find((x) => x !== p && x !== author) ?? phones.find((x) => x !== p)!;
        await p.page.getByTestId(`vote-${target.name}`).click();
      }
      await expect(host.getByTestId("author")).toContainText(author.name);
      authorRevealed = true;
    } else {
      // Trait round: Layla and Sara vote Karim, Karim votes Sara.
      await layla.page.getByTestId("vote-كريم").click();
      await expect(layla.page.getByText("صوتك لـكريم وصل")).toBeVisible();
      await sara.page.getByTestId("vote-كريم").click();
      await karim.page.getByTestId("vote-سارة").click();
      await expect(host.getByTestId("who-reveal")).toBeVisible();
      await expect(host.getByTestId("bar-كريم")).toHaveAttribute("data-top", "true");
      await expect(host.getByTestId("bar-سارة")).toHaveAttribute("data-top", "false");
      await expect(host.getByTestId("round-title")).toContainText("كريم");
      await expect(layla.page.getByTestId("my-vote-result")).toContainText("+١٠٠");
      await expect(karim.page.getByTestId("my-vote-result")).toContainText("ما صوّتت مع الأغلبية");
      titles++;
    }
    await host.getByTestId("host-advance").click();
  }

  expect(vetoed).toBe(true);
  expect(authorRevealed).toBe(true);
  await expect(host.getByTestId("host-who")).toHaveAttribute("data-phase", "final");
  await expect(host.getByTestId("titles-of-night").locator("li")).toHaveCount(titles);
  await expect(karim.page.getByTestId("phone-who-final")).toBeVisible();

  // Titles are saved: Karim sees his on the Titles page.
  await karim.page.goto("/titles");
  await expect(karim.page.getByTestId("titles-list").locator("li").first()).toContainText("كريم");

  await host.getByTestId("play-again").click();
  await expect(host.getByTestId("host-start")).toBeVisible();
  for (const p of phones) await p.ctx.close();
});

test("prompts page before the vote; who-among-us needs 3 players", async ({ page: host, browser }) => {
  await host.goto("/play/group");
  await host.getByTestId("create-who_among_us").click();
  await host.waitForURL(/\/host\/\d{4}$/);
  const code = (await host.getByTestId("room-code").textContent())!.trim();
  const a = await phone(browser, code, "أ");
  const b = await phone(browser, code, "ب");
  await expect(host.getByTestId("host-start")).toBeDisabled();

  // Answer the secret questions early, from the lobby card.
  await a.page.getByTestId("prompts-card").click();
  await expect(a.page.getByTestId("prompt-progress")).toHaveText("١ / ٤");
  await a.page.getByLabel("جوابك").fill("سرّي");
  await a.page.getByTestId("prompt-send").click();
  await expect(a.page.getByTestId("prompt-progress")).toHaveText("٢ / ٤");
  await a.ctx.close();
  await b.ctx.close();
});
