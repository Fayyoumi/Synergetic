import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Rooms: one host screen and phones, each in its own browser context (its own
 * guest account). Runs against a live Supabase (local: `npm run db:start`).
 */

test.describe.configure({ mode: "serial" });
test.skip(() => test.info().project.name !== "host-720p", "multi-device tests run once, on the host viewport");

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

async function phone(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext(PHONE);
  return { ctx, page: await ctx.newPage() };
}

async function createRoom(page: Page): Promise<string> {
  await page.goto("/play/group");
  await page.getByTestId("create-trivia_team").click();
  await page.waitForURL(/\/host\/\d{4}$/);
  const code = (await page.getByTestId("room-code").textContent())!.trim();
  expect(code).toMatch(/^\d{4}$/);
  return code;
}

async function join(page: Page, code: string, name: string) {
  await page.goto(`/join/${code}`);
  await page.getByLabel("اسمك").fill(name);
  const consent = page.getByTestId("consent");
  if (await consent.isVisible()) await consent.check();
  await page.getByRole("button", { name: "ادخل السهرة" }).click();
  await expect(page.getByTestId("player-lobby")).toBeVisible();
}

/** Simulates switching to another app / locking the phone (document becomes hidden). */
async function setHidden(page: Page, hidden: boolean) {
  await page.evaluate((h) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

const seat = (page: Page, name: string) => page.getByTestId(`seat-${name}`);

test("everyone sees players join, leave the app, disconnect and come back", async ({ page: host, browser }) => {
  const code = await createRoom(host);
  await expect(host.getByText("لسّا ما حدا دخل")).toBeVisible();

  const a = await phone(browser);
  await join(a.page, code, "ليلى");
  await expect(seat(host, "ليلى")).toHaveAttribute("data-status", "active");

  const b = await phone(browser);
  await join(b.page, code, "كريم");
  await expect(seat(host, "كريم")).toHaveAttribute("data-status", "active");
  await expect(seat(a.page, "كريم")).toHaveAttribute("data-status", "active");
  await expect(a.page.getByTestId("host-status")).toHaveAttribute("data-status", "active");

  // Karim switches to another app (e.g. to look something up).
  await setHidden(b.page, true);
  await expect(seat(host, "كريم")).toHaveAttribute("data-status", "away");
  await expect(seat(a.page, "كريم")).toHaveAttribute("data-status", "away");
  await expect(host.getByTestId("conn-toasts")).toContainText("كريم طلع من التطبيق");
  await expect(a.page.getByTestId("conn-toasts")).toContainText("كريم طلع من التطبيق");
  await expect(seat(host, "كريم").getByTestId("incidents")).toHaveText("طلع مرة");

  // …and comes back.
  await setHidden(b.page, false);
  await expect(seat(host, "كريم")).toHaveAttribute("data-status", "active");
  await expect(a.page.getByTestId("conn-toasts")).toContainText("كريم رجع");

  // Karim's phone drops off entirely.
  await b.page.close();
  await expect(seat(host, "كريم")).toHaveAttribute("data-status", "offline");
  await expect(seat(a.page, "كريم")).toHaveAttribute("data-status", "offline");
  await expect(host.getByTestId("conn-toasts")).toContainText("انقطع اتصال كريم");
  await expect(a.page.getByTestId("conn-toasts")).toContainText("انقطع اتصال كريم");

  // He reopens the link on the same phone: same seat, no second form.
  const b2 = await b.ctx.newPage();
  await b2.goto(`/join/${code}`);
  await expect(b2.getByTestId("player-lobby")).toBeVisible();
  await expect(seat(host, "كريم")).toHaveAttribute("data-status", "active");
  await expect(host.getByTestId("player-list").locator("li")).toHaveCount(2);
  await expect(seat(host, "كريم").getByTestId("incidents")).toHaveText("طلع ٢ مرات");

  // The host screen disconnecting is shown to the players as well.
  await host.close();
  await expect(a.page.getByTestId("host-status")).toHaveAttribute("data-status", "offline");
  await expect(a.page.getByTestId("conn-toasts")).toContainText("انقطع اتصال المضيف");

  await a.ctx.close();
  await b.ctx.close();
});

test("mood: roast needs the 18+ confirmation, and phones see the change", async ({ page: host, browser }) => {
  const code = await createRoom(host);
  const a = await phone(browser);
  await join(a.page, code, "سارة");

  await host.getByTestId("mood-roast").click();
  await expect(host.getByRole("alert").filter({ hasText: "١٨+" })).toBeVisible();
  await expect(host.getByTestId("mood-family")).toHaveAttribute("aria-checked", "true");

  await host.getByTestId("roast-confirm").check();
  await host.getByTestId("mood-roast").click();
  await expect(host.getByTestId("mood-roast")).toHaveAttribute("aria-checked", "true");
  await expect(a.page.getByText("المزاج: تحفيل")).toBeVisible();
  await a.ctx.close();
});

test("the host can remove a player, who can't come straight back", async ({ page: host, browser }) => {
  const code = await createRoom(host);
  const a = await phone(browser);
  await join(a.page, code, "زياد");
  await host.getByRole("button", { name: "طلّع زياد" }).click();
  await expect(a.page.getByText("طلعت من السهرة")).toBeVisible();
  await expect(host.getByTestId("player-list")).toHaveCount(0);
  await a.page.goto(`/join/${code}`);
  await a.page.getByLabel("اسمك").fill("زياد");
  await a.page.getByRole("button", { name: "ادخل السهرة" }).click();
  await expect(a.page.getByRole("alert").filter({ hasText: "المضيف طلّعك" })).toBeVisible();
  await a.ctx.close();
});

test("only the host can open the host screen; bad codes are refused", async ({ page: host, browser }) => {
  const code = await createRoom(host);
  const a = await phone(browser);
  await join(a.page, code, "نور");
  await a.page.goto(`/host/${code}`);
  await expect(a.page.getByText("هاي مش سهرتك")).toBeVisible();
  await a.page.goto(`/join/${code === "0000" ? "0001" : "0000"}`);
  await expect(a.page.getByRole("alert").filter({ hasText: "ما في سهرة" })).toBeVisible();
  await a.ctx.close();
});

test("consent is required to join, and remembered on this device", async ({ page: host, browser }) => {
  const code = await createRoom(host);
  const a = await phone(browser);
  await a.page.goto(`/join/${code}`);
  await a.page.getByLabel("اسمك").fill("هبة");
  await a.page.getByRole("button", { name: "ادخل السهرة" }).click();
  await expect(a.page.getByRole("alert").filter({ hasText: "لازم توافق" })).toBeVisible();
  await a.page.getByTestId("consent").check();
  await a.page.getByRole("button", { name: "ادخل السهرة" }).click();
  await expect(a.page.getByTestId("player-lobby")).toBeVisible();

  const code2 = await createRoom(host);
  await a.page.goto(`/join/${code2}`);
  await expect(a.page.getByLabel("اسمك")).toBeVisible();
  await expect(a.page.getByTestId("consent")).toHaveCount(0);
  await a.ctx.close();
});

test("realtime security: outsiders can't listen in, players can't forge messages", async ({ page: host, browser }) => {
  const env = Object.fromEntries(
    readFileSync(path.join(__dirname, "../../.env.local"), "utf8")
      .split("\n")
      .filter((l) => l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
  const code = await createRoom(host);
  const a = await phone(browser);
  await join(a.page, code, "منى");

  const subscribe = async (client: SupabaseClient) => {
    await client.realtime.setAuth();
    const ch = client.channel(`room:${code}`, { config: { private: true } });
    const status = await new Promise<string>((resolve) => {
      ch.subscribe((s) => {
        if (s !== "SUBSCRIBED" && s !== "CHANNEL_ERROR" && s !== "TIMED_OUT") return;
        resolve(s);
      });
    });
    return { ch, status };
  };

  // An outsider with their own guest account is refused.
  const outsider = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await outsider.auth.signInAnonymously();
  const o = await subscribe(outsider);
  expect(o.status).toBe("CHANNEL_ERROR");
  await outsider.removeAllChannels();

  // A seated player (using the phone's own session) can listen but not broadcast.
  const session = await a.page.evaluate(() => {
    const raw = document.cookie.split("; ").find((c) => c.startsWith("sb-") && c.includes("auth-token="));
    return raw ? decodeURIComponent(raw.slice(raw.indexOf("=") + 1)) : null;
  });
  expect(session).toBeTruthy();
  const parsed = JSON.parse(Buffer.from(session!.replace(/^base64-/, ""), "base64").toString("utf8"));
  const player = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await player.auth.setSession({ access_token: parsed.access_token, refresh_token: parsed.refresh_token });
  const p = await subscribe(player);
  expect(p.status).toBe("SUBSCRIBED");
  const forged = { v: 1, type: "room", room: { code, status: "ended", mood: "family", game: null, seats: [], full: false } };
  // Over REST: refused outright.
  await expect(p.ch.httpSend("room", forged)).rejects.toThrow(/Unauthorized/);
  // Over the socket: dropped by the server (no broadcast insert policy for players).
  await p.ch.send({ type: "broadcast", event: "room", payload: forged });
  await a.page.waitForTimeout(1500);
  await player.removeAllChannels();

  // The phone was not affected by the forged message.
  await expect(a.page.getByTestId("player-lobby")).toBeVisible();
  await a.ctx.close();
});
