import { expect, type Page, test } from "@playwright/test";

// Bottom colors of each tab's gradient (--color-*-bottom in src/styles.css).
const CLEAN_GRADIENT = "rgb(27, 31, 49)";
const STATUS_GRADIENT = "rgb(42, 38, 32)";

// The gradient animates between tabs, so assertions poll until it settles.
function windowBackground(page: Page) {
  return page.locator("#root > div").evaluate((el) => getComputedStyle(el).backgroundImage);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("opens on Clean with the navy gradient", async ({ page }) => {
  await expect(page.getByRole("tab", { name: "Clean" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Clean" })).toBeVisible();
  await expect(page.locator('[role="tabpanel"][data-state="inactive"]')).toBeHidden();
  await expect.poll(() => windowBackground(page)).toContain(CLEAN_GRADIENT);
});

test("switches tabs on click", async ({ page }) => {
  await page.getByRole("tab", { name: "Status" }).click();
  await expect(page.getByRole("tab", { name: "Status" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Status" })).toBeVisible();
  await expect(page.locator('[role="tabpanel"][data-state="inactive"]')).toBeHidden();
  await expect.poll(() => windowBackground(page)).toContain(STATUS_GRADIENT);

  await page.getByRole("tab", { name: "Clean" }).click();
  await expect(page.getByRole("tabpanel", { name: "Clean" })).toBeVisible();
  await expect.poll(() => windowBackground(page)).toContain(CLEAN_GRADIENT);
});

test("switches tabs with ⌘1 and ⌘2", async ({ page }) => {
  await page.keyboard.press("Meta+2");
  await expect(page.getByRole("tab", { name: "Status" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Status" })).toBeVisible();

  await page.keyboard.press("Meta+1");
  await expect(page.getByRole("tab", { name: "Clean" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Clean" })).toBeVisible();
});
