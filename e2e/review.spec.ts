import { expect, type Page, test } from "@playwright/test";

/** Scans with the fake client's scenario and waits for Review. */
async function review(page: Page, scenario = "complete") {
  await page.goto(`/?scan=${scenario}`);
  await page.getByRole("button", { name: "Start scan" }).click();
  await expect(page.getByRole("list", { name: "Junk groups" })).toBeVisible();
}

test("opens Review with the default junk groups selected", async ({ page }) => {
  await review(page);

  for (const name of ["App Caches", "Browsers", "Logs & Saved State", "Trash", "App Leftovers"]) {
    await expect(page.getByRole("checkbox", { name, exact: true })).toBeChecked();
  }
  for (const name of ["Developer Tools", "Virtualization", "Device Firmware"]) {
    await expect(page.getByRole("checkbox", { name, exact: true })).not.toBeChecked();
  }
  // 5.19 + 2.5 + 1.53 + 4.21 + 0.9 GB.
  await expect(page.getByText("14.3 GB selected")).toBeVisible();
  await expect(page.getByRole("button", { name: "Clean 13 items →" })).toBeEnabled();
  await expect(page.getByText("moves to Trash")).toHaveCount(3);
  await expect(page.getByText("Device backups & firmware")).toHaveCount(0);
});

test("selects single junk items and highlights a group in the color bar", async ({ page }) => {
  await review(page);
  const caches = page.getByRole("checkbox", { name: "App Caches", exact: true });

  await page.getByRole("button", { name: "App Caches items" }).click();
  await page.getByRole("checkbox", { name: "/Users/test/Library/Caches/com.spotify.client" }).uncheck();
  await expect(caches).toHaveAttribute("aria-checked", "mixed");
  await expect(page.getByText("4/5")).toBeVisible();
  await expect(page.getByText("11.9 GB selected")).toBeVisible();

  const bar = page.getByRole("img", { name: "Selection by junk group" });
  await page.getByRole("button", { name: "Trash items" }).hover();
  await expect(bar.locator("rect", { hasText: "Trash" })).toHaveCSS("opacity", "1");
  await expect(bar.locator("rect", { hasText: "Browsers" })).toHaveCSS("opacity", "0.35");

  await caches.click();
  await expect(caches).toBeChecked();
  await expect(page.getByText("14.3 GB selected")).toBeVisible();
});

test("expands a junk group from anywhere on its row, the checkbox aside", async ({ page }) => {
  await review(page);
  const expand = page.getByRole("button", { name: "Trash items" });
  const row = page.getByRole("listitem").filter({ has: expand }).locator("div").first();

  // The row's top-left padding, outside the button's own content.
  await row.click({ position: { x: 6, y: 4 } });
  await expect(expand).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("checkbox", { name: "/Users/test/.Trash" })).toBeVisible();

  await page.getByRole("checkbox", { name: "Trash", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Trash", exact: true })).not.toBeChecked();
  await expect(expand).toHaveAttribute("aria-expanded", "true");
});

test("disables Clean once nothing is selected", async ({ page }) => {
  await review(page);
  for (const name of ["App Caches", "Browsers", "Logs & Saved State", "Trash", "App Leftovers"]) {
    await page.getByRole("checkbox", { name, exact: true }).click();
  }

  await expect(page.getByText("0 B selected")).toBeVisible();
  await expect(page.getByRole("button", { name: "Clean 0 items →" })).toBeDisabled();
});

test("scrolls a long list inside the card and truncates very long paths", async ({ page }) => {
  await review(page, "long");
  await page.getByRole("button", { name: "App Caches items" }).click();

  const list = page.getByRole("list", { name: "Junk groups" });
  const overflows = await list.evaluate((element) => element.scrollHeight > element.clientHeight);
  expect(overflows).toBe(true);
  await expect(page.getByRole("button", { name: /^Clean \d+ items →$/ })).toBeInViewport();

  const longPath = page.getByText(/very-long-bundle-identifier.*Cache\.db$/);
  await longPath.scrollIntoViewIfNeeded();
  const truncated = await longPath.evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(truncated).toBe(true);
  await expect(longPath.locator("xpath=following-sibling::span")).toHaveText("42 MB");
  await expect(longPath.locator("xpath=following-sibling::span")).toBeInViewport();

  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(pageWidth).toBe(0);
});

test("scans again from the footer", async ({ page }) => {
  await review(page);
  await page.getByRole("button", { name: "← Scan again" }).click();

  await expect(page.getByRole("list", { name: "Junk groups" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Developer Tools", exact: true })).not.toBeChecked();
});

test("shows protected access unavailable and opens Full Disk Access", async ({ page }) => {
  await review(page, "unreadable");
  const groups = page.getByRole("list", { name: "Junk groups" });

  const trash = groups.getByRole("listitem").filter({ hasText: "Protected access unavailable" });
  await expect(trash).toHaveCount(1);
  await expect(trash).toContainText("Items already placed in Trash.");
  await expect(trash.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "App Caches", exact: true })).toBeChecked();

  await page.getByRole("button", { name: "Open System Settings" }).click();
  await expect(page.getByText("Turn on Burrow in Full Disk Access, then scan again.")).toBeVisible();
});

test("walks the user to Full Disk Access when only Privacy & Security opens", async ({ page }) => {
  await page.goto("/?scan=unreadable&settings=fallback");
  await page.getByRole("button", { name: "Start scan" }).click();

  await page.getByRole("button", { name: "Open System Settings" }).click();
  await expect(
    page.getByText("In Privacy & Security, scroll to Full Disk Access, turn on Burrow, then scan again."),
  ).toBeVisible();
});

test("gives the manual path when System Settings does not open", async ({ page }) => {
  await page.goto("/?scan=unreadable&settings=refused");
  await page.getByRole("button", { name: "Start scan" }).click();

  await page.getByRole("button", { name: "Open System Settings" }).click();
  await expect(
    page.getByText(
      "System Settings did not open. Open it from the Apple menu, go to Privacy & Security › Full Disk Access, and turn on Burrow.",
    ),
  ).toBeVisible();
});

test("says nothing about Full Disk Access when the Scan read everything", async ({ page }) => {
  await review(page);

  await expect(page.getByText("Protected access unavailable")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open System Settings" })).toHaveCount(0);
});
