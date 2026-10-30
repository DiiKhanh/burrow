import { expect, test } from "@playwright/test";

test("measures the overview when Space opens and cancels it", async ({ page }) => {
  await page.goto("/?measure=running");
  await page.getByRole("tab", { name: "Space" }).click();

  const progress = page.getByRole("status", { name: "Measure progress" });
  await expect(progress.getByText("Measuring…")).toBeVisible();
  await expect(progress.getByText("Applications, Library, your home folder and insights")).toBeVisible();
  await expect(progress.getByRole("progressbar")).not.toHaveAttribute("value");

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Measure this Mac" })).toBeVisible();
});

test("shows the overview: the locations' total, Insights above Locations", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Meta+3");

  await expect(page.getByText("146 GB measured on this Mac")).toBeVisible();
  const insights = page.getByRole("region", { name: "Insights" });
  const locations = page.getByRole("region", { name: "Locations" });
  await expect(insights.getByRole("listitem")).toHaveCount(5);
  await expect(insights.getByRole("listitem").first()).toHaveText("Docker Data21.6 GB›");
  await expect(locations.getByRole("listitem")).toHaveText([
    "User Library73.1 GB›",
    "Home46.4 GB›",
    "Applications19.7 GB›",
    "System Library6.83 GB›",
  ]);
  const insightsTop = (await insights.boundingBox())?.y ?? 0;
  const locationsTop = (await locations.boundingBox())?.y ?? 0;
  expect(insightsTop).toBeLessThan(locationsTop);
});

test("keeps the overview when switching tabs", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Meta+3");
  await expect(page.getByRole("region", { name: "Locations" })).toBeVisible();

  await page.keyboard.press("Meta+1");
  await expect(page.getByRole("tabpanel", { name: "Clean" })).toBeVisible();
  await page.keyboard.press("Meta+3");

  await expect(page.getByRole("region", { name: "Locations" })).toBeVisible();
  expect(await page.evaluate(() => window.burrowFake?.measure.calls.length)).toBe(1);
});

test("says a failed Measure could not finish", async ({ page }) => {
  await page.goto("/?measure=failed");
  await page.keyboard.press("Meta+3");

  await expect(page.getByText("Measure could not finish. Try again.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Measure this Mac" })).toBeVisible();
});

test("drills down into folders and back up the trail without measuring again", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Meta+3");
  const trail = page.getByRole("navigation", { name: "Folders" });
  await expect(trail.getByRole("button")).toHaveText(["This Mac"]);

  await page.getByRole("button", { name: "Open Home", exact: true }).click();
  await expect(page.getByText("46.3 GB in this folder")).toBeVisible();
  await page.getByRole("button", { name: "Open Projects" }).click();
  await expect(page.getByText("21.4 GB in this folder")).toBeVisible();
  await expect(page.getByRole("region", { name: "Contents" }).getByRole("listitem")).toHaveText([
    "burrow12.1 GB›",
    "Ảnh chụp6.2 GB›",
    "quote\"and'apostrophe.zip3.1 GB",
  ]);
  await expect(trail.getByRole("button")).toHaveText(["This Mac", "Home", "Projects"]);
  await expect(trail.getByRole("button", { name: "Projects" })).toHaveAttribute("aria-current", "page");

  await trail.getByRole("button", { name: "This Mac" }).click();
  await expect(page.getByText("146 GB measured on this Mac")).toBeVisible();
  await page.getByRole("button", { name: "Open Home", exact: true }).click();
  await expect(page.getByText("46.3 GB in this folder")).toBeVisible();

  const targets = await page.evaluate(() => window.burrowFake?.measure.calls.map((call) => call.target));
  expect(targets).toEqual([
    { kind: "overview" },
    { kind: "folder", path: "/Users/test" },
    { kind: "folder", path: "/Users/test/Projects" },
  ]);
});

test("measures the folder on screen again", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Meta+3");
  await page.getByRole("button", { name: "Open Home", exact: true }).click();
  await expect(page.getByText("46.3 GB in this folder")).toBeVisible();

  await page.getByRole("button", { name: "Measure again" }).click();

  await expect(page.getByText("46.3 GB in this folder")).toBeVisible();
  const targets = await page.evaluate(() => window.burrowFake?.measure.calls.map((call) => call.target));
  expect(targets).toEqual([
    { kind: "overview" },
    { kind: "folder", path: "/Users/test" },
    { kind: "folder", path: "/Users/test" },
  ]);
});
