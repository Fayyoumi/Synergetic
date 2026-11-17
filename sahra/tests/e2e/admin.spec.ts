import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/** Content admin and pilot dashboard, against a live Supabase. */

test.skip(() => test.info().project.name !== "host-720p", "admin is a desktop page; run once");

const env = Object.fromEntries(
  readFileSync(path.join(__dirname, "../../.env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const service = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/** Creates (or reuses) an admin and signs this page in with a one-time link, like `npm run admin:make`. */
async function signInAsAdmin(page: Page, email: string) {
  const db = service();
  let link = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) {
    await db.auth.admin.createUser({ email, email_confirm: true });
    link = await db.auth.admin.generateLink({ type: "magiclink", email });
  }
  await db.from("profiles").update({ is_admin: true }).eq("id", link.data.user!.id);
  await page.goto(`/auth/callback?token_hash=${link.data.properties!.hashed_token}&type=magiclink&next=/admin`);
  await page.waitForURL(/\/admin$/);
}

test("guests can't use the admin", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "دخول الإدارة" })).toBeVisible();
  const r = await page.request.get("/api/admin/content?type=questions");
  expect([401, 403]).toContain(r.status());
});

test("an admin approves drafts, uploads content and resolves reports", async ({ page, browser }) => {
  // A player reports a question first.
  const player = await (await browser.newContext()).newPage();
  await player.goto("/play/trivia");
  await player.getByRole("button", { name: "يلا نبدأ!" }).click();
  const reported = (await player.getByTestId("question-text").textContent())!.trim();
  await player.getByRole("button", { name: "بلّغ عن السؤال" }).click();
  await player.getByRole("button", { name: "بلّغ", exact: true }).click();
  await expect(player.getByRole("status")).toContainText("شكراً");

  await signInAsAdmin(page, "content-admin@example.com");
  await expect(page.getByTestId("admin-rows")).toBeVisible();

  // Approve a draft "who among us" trait.
  await page.getByTestId("admin-type-traits").click();
  const row = page.locator('[data-testid^="row-trait-"]').first();
  const id = (await row.getAttribute("data-testid"))!.replace("row-", "");
  await page.getByTestId(`approve-${id}`).click();
  await expect(page.getByTestId(`row-${id}`)).toHaveCount(0);
  await page.getByTestId("admin-status-approved").click();
  await expect(page.getByTestId(`row-${id}`)).toBeVisible();

  // A draft question can't be approved without a source.
  await page.getByTestId("admin-type-questions").click();
  await page.getByTestId("admin-status-draft").click();
  await page.getByTestId("admin-tab-upload").click();
  await page.getByTestId("upload-format").selectOption("json");
  await page.getByTestId("upload-text").fill(
    JSON.stringify([
      { id: "sci-0901", lang: "ar", category: "sci", difficulty: "easy", country_tags: [], question: "كم رجل للعنكبوت؟", options: ["٦", "٨", "١٠", "٤"], answer_index: 1, status: "draft" },
      { id: "bad", lang: "ar" },
    ]),
  );
  await page.getByTestId("upload-submit").click();
  await expect(page.getByTestId("upload-result")).toContainText("انرفع ١ صف");
  await expect(page.getByTestId("upload-result")).toContainText("١ صف فيه مشكلة");

  await page.getByTestId("admin-tab-content").click();
  await page.getByTestId("admin-type-questions").click();
  await page.getByTestId("approve-sci-0901").click();
  await expect(page.getByRole("alert").filter({ hasText: "بحاجة لمصدر" })).toBeVisible();

  // Reports: the reported question shows up and can be resolved.
  await page.getByTestId("admin-tab-reports").click();
  const report = page.getByTestId("reports").locator("li", { hasText: reported });
  await expect(report).toBeVisible();
  const reportId = (await report.getAttribute("data-testid"))!.replace("report-", "");
  await page.getByTestId(`resolve-${reportId}`).click();
  await expect(page.getByTestId(`report-${reportId}`)).toHaveCount(0);

  // Clean up the uploaded draft so other runs start fresh.
  await service().from("questions").delete().eq("id", "sci-0901");
});

test("the pilot dashboard shows the go/no-go numbers", async ({ page }) => {
  await signInAsAdmin(page, "pilot-admin@example.com");
  await page.goto("/admin/pilot");
  await expect(page.getByTestId("pilot")).toBeVisible();
  await expect(page.getByText("نسبة الإعادة").first()).toBeVisible();
  await expect(page.getByText("رجوع اليوم السابع (فردي)")).toBeVisible();
  await expect(page.getByTestId("pilot-rooms")).toBeVisible();
});
