import { expect, test } from "@playwright/test";

test.describe("foundation smoke test", () => {
  test("home is Arabic and right-to-left by default", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.getByRole("heading", { level: 1, name: "سهرة" })).toBeVisible();
    await expect(page.getByRole("link", { name: "العب الآن" })).toBeVisible();
    await expect(page.getByRole("img", { name: "كاسة" })).toBeVisible();
  });

  test("the language toggle switches to English, left-to-right", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Switch to English" }).click();
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("link", { name: "Play now" })).toBeVisible();
    await page.getByRole("button", { name: "التبديل إلى العربية" }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });

  test("no horizontal scrolling", async ({ page }) => {
    for (const path of ["/", "/en", "/design", "/privacy"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test("design guide shows all five Kassa expressions with unique clip paths", async ({ page }) => {
    await page.goto("/design");
    for (const name of ["عادي", "مشاكس", "مصدوم", "بيضحك", "زعلان"]) {
      await expect(page.getByRole("img", { name })).toBeVisible();
    }
    const ids = await page.locator("svg clipPath").evaluateAll((els) => els.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
    await expect(page.getByTestId("session-status")).not.toHaveAttribute("data-status", "loading");
  });

  test("legal pages carry the lawyer-review marker", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByText("TODO: lawyer review")).toBeVisible();
    await page.goto("/en/terms");
    await expect(page.getByText("TODO: lawyer review")).toBeVisible();
  });

  test("unknown pages get the localised not-found screen", async ({ page }) => {
    const res = await page.goto("/nope");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "الصفحة مش موجودة" })).toBeVisible();
  });

  test("the PWA manifest is served", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const manifest = await res.json();
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toContain("512x512");
  });
});
