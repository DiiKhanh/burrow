import { expect, test } from "@playwright/test";

test("shows determinate Strata progress and the current path", async ({ page }) => {
  await page.goto("/?scan=running");
  await page.getByRole("button", { name: "Start scan" }).click();

  await expect(page.getByRole("status", { name: "Scan progress" })).toBeVisible();
  await expect(page.getByText("1.5 MB found so far")).toBeVisible();
  await expect(page.getByText("/Users/test/Library/Caches/Burrow")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "App Caches scan progress" })).toHaveAttribute("value", "0.35");
});

test("shows indeterminate progress and cancels the Scan", async ({ page }) => {
  await page.goto("/?scan=indeterminate");
  await page.getByRole("button", { name: "Start scan" }).click();

  const progress = page.getByRole("progressbar", { name: "Browsers scan progress" });
  await expect(progress).toBeVisible();
  await expect(progress).not.toHaveAttribute("value");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Start scan" })).toBeVisible();
});

test("finishes with translated junk groups and sizes", async ({ page }) => {
  await page.goto("/?scan=complete");
  await page.getByRole("button", { name: "Start scan" }).click();

  await expect(page.getByText("8.2 GB found")).toBeVisible();
  await expect(page.getByText("Temporary files apps rebuild on next launch.")).toBeVisible();
  await expect(page.getByText("Downloaded iPhone and iPad firmware files.")).toBeVisible();
  await expect(page.getByText("1.2 GB")).toBeVisible();
  await expect(page.getByText("7 GB")).toBeVisible();
  await expect(page.getByText("Device backups & firmware")).toHaveCount(0);
});
