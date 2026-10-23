import { expect, type Locator, type Page, test } from "@playwright/test";

/**
 * Scans with the fake client's default result and cleans its default
 * selection: App Caches, Browsers, Logs & Saved State and Trash, which
 * Delete, and App Leftovers, which moves to Trash.
 */
async function clean(page: Page, scenario = "complete") {
  await page.goto(`/?clean=${scenario}`);
  await page.getByRole("button", { name: "Start scan" }).click();
  await page.getByRole("button", { name: "Clean 13 items →" }).click();
}

/** The step the Clean stepper marks as current. */
function currentStep(page: Page) {
  return page.getByRole("list", { name: "Clean progress" }).locator('[aria-current="step"]');
}

/** The Strata layer of the junk group name. */
function layer(region: Locator, name: string) {
  return region.getByRole("listitem").filter({ has: region.page().getByText(name, { exact: true }) });
}

test("shows the junk group being cleaned as the lit Strata layer", async ({ page }) => {
  await clean(page, "running");
  const strata = page.getByRole("status", { name: "Cleaning" });

  await expect(strata.getByText("2.41 GB freed so far")).toBeVisible();
  await expect(strata.getByText(/moved to Trash/)).toHaveCount(0);
  await expect(strata.getByRole("listitem")).toHaveCount(5);
  await expect(layer(strata, "App Caches")).toContainText("1 / 5");
  await expect(page.getByRole("progressbar", { name: "App Caches clean progress" })).toHaveAttribute("value", "0.2");
  await expect(layer(strata, "Browsers")).toContainText("0 / 3");
  await expect(layer(strata, "App Leftovers")).toContainText("0 / 2");
  await expect(currentStep(page)).toContainText("Clean");
});

test("ends on Done and starts over with Finish", async ({ page }) => {
  await clean(page);
  const summary = page.getByRole("region", { name: "Clean summary" });

  // 5.19 + 2.5 + 1.53 + 4.21 GB deleted; 612 + 288 MB of App Leftovers.
  await expect(summary.getByText("13.4 GB freed")).toBeVisible();
  await expect(summary.getByText("900 MB moved to Trash")).toBeVisible();
  await expect(summary.getByText("13 removed · 0 skipped")).toBeVisible();
  await expect(layer(summary, "Trash")).toContainText("1 / 1");
  await expect(layer(summary, "App Leftovers")).toContainText("2 / 2");
  await expect(currentStep(page)).toContainText("Done");

  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.getByRole("heading", { name: "Let's see what can go." })).toBeVisible();
});

test("shows a skipped item on its layer and on Done", async ({ page }) => {
  await clean(page, "skipped");
  const summary = page.getByRole("region", { name: "Clean summary" });

  await expect(summary.getByText("12 removed · 1 skipped")).toBeVisible();
  await expect(layer(summary, "App Caches")).toContainText("1 skipped");
  await expect(layer(summary, "App Caches")).toContainText("4 / 5");
  await expect(summary.getByText("/Users/test/Library/Caches/com.spotify.client (in use)")).toBeVisible();
  // 13.4 GB less the skipped 2.41 GB.
  await expect(summary.getByText("11 GB freed")).toBeVisible();
  await expect(summary.getByText("900 MB moved to Trash")).toBeVisible();
});

test("says Clean could not finish when it fails, and starts over", async ({ page }) => {
  await clean(page, "failed");

  await expect(page.getByText("Clean could not finish. Scan again to see what is left.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start scan" })).toBeVisible();
});
