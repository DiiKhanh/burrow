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
  await expect(insights.getByRole("listitem").first()).toHaveText("Docker DataInsightReveal21.6 GB›");
  await expect(locations.getByRole("listitem")).toHaveText([
    "User LibraryReveal73.1 GB›",
    "HomeReveal46.4 GB›",
    "ApplicationsReveal19.7 GB›",
    "System LibraryReveal6.83 GB›",
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
    "burrowReveal12.1 GB›",
    "Ảnh chụpReveal6.2 GB›",
    "quote\"and'apostrophe.zipReveal3.1 GB",
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

test("lists the largest files anywhere in a folder under its contents", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Meta+3");
  await page.getByRole("button", { name: "Open Home", exact: true }).click();

  const largest = page.getByRole("region", { name: "Largest files in Home" });
  await expect(largest.getByRole("listitem")).toHaveText([
    "Trip 2025.movMoviesReveal8.2 GB",
    "quote\"and'apostrophe.zipProjectsReveal3.1 GB",
    "Burrow.dmgProjects/burrow/releaseReveal1.2 GB",
  ]);
  const contentsTop = (await page.getByRole("region", { name: "Contents" }).boundingBox())?.y ?? 0;
  const largestTop = (await largest.boundingBox())?.y ?? 0;
  expect(contentsTop).toBeLessThan(largestTop);
});

test("labels Regenerable folders and Insights Clean handles", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Meta+3");

  const insights = page.getByRole("region", { name: "Insights" });
  await expect(insights.getByRole("listitem").filter({ hasText: "Homebrew Cache" })).toContainText(
    "InsightClean handles this",
  );
  await expect(insights.getByRole("button", { name: "Clean handles this" })).toHaveCount(2);

  await page.getByRole("button", { name: "Open Home", exact: true }).click();
  await page.getByRole("button", { name: "Open Projects" }).click();
  await page.getByRole("button", { name: "Open burrow" }).click();
  await expect(page.getByRole("region", { name: "Contents" }).getByRole("listitem")).toHaveText([
    "node_modulesRegenerableReveal6.4 GB›",
    "distRegenerableReveal3.3 GB›",
    "releaseReveal1.2 GB›",
    "srcReveal1.2 GB›",
  ]);
});

test("goes to Clean from an Insight Clean handles", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Meta+3");

  await page
    .getByRole("listitem")
    .filter({ hasText: "System Logs" })
    .getByRole("button", { name: "Clean handles this" })
    .click();

  await expect(page.getByRole("tab", { name: "Clean" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Clean" })).toBeVisible();
  await page.keyboard.press("Meta+3");
  await expect(page.getByRole("region", { name: "Insights" })).toBeVisible();
});

test("reveals any row in Finder, outside Home too, without opening it", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Meta+3");
  const applications = page.getByRole("listitem").filter({ hasText: "Applications" });
  const reveal = applications.getByRole("button", { name: "Reveal Applications in Finder" });
  await expect(reveal).toHaveCSS("opacity", "0");

  await applications.hover();
  await expect(reveal).toHaveCSS("opacity", "1");
  await reveal.click();

  await page.getByRole("button", { name: "Open Home", exact: true }).click();
  await page.getByRole("button", { name: "Reveal Trip 2025.mov in Finder" }).click();
  const revealed = await page.evaluate(() => window.burrowFake?.reveal.calls.map((call) => call.id));
  expect(revealed).toEqual(["id:/Applications", "id:/Users/test/Movies/Trip 2025.mov"]);
  const targets = await page.evaluate(() => window.burrowFake?.measure.calls.map((call) => call.target));
  expect(targets).toEqual([{ kind: "overview" }, { kind: "folder", path: "/Users/test" }]);
});

test("shows what the overview could not read and opens Full Disk Access", async ({ page }) => {
  await page.goto("/?measure=unreadable");
  await page.keyboard.press("Meta+3");

  await expect(page.getByRole("region", { name: "Locations" }).getByRole("listitem").first()).toHaveText(
    "User LibraryRevealPartly unreadable73.1 GB›",
  );
  await expect(page.getByRole("region", { name: "Insights" }).getByRole("listitem").last()).toHaveText(
    "iOS BackupsInsightRevealProtected access unavailable",
  );
  await expect(page.getByRole("button", { name: "Open iOS Backups" })).toHaveCount(0);

  await page.getByRole("button", { name: "Open System Settings" }).click();
  await expect(page.getByText("Turn on Burrow in Full Disk Access, then measure again.")).toBeVisible();
});

test("lists a folder's readable rows beside the ones it could not read", async ({ page }) => {
  await page.goto("/?settings=fallback");
  await page.keyboard.press("Meta+3");
  await expect(page.getByRole("region", { name: "Full Disk Access" })).toHaveCount(0);

  await page.getByRole("button", { name: "Open User Library" }).click();

  await expect(page.getByText("66.3 GB in this folder")).toBeVisible();
  await expect(page.getByRole("region", { name: "Contents" }).getByRole("listitem")).toHaveText([
    "Application SupportRevealPartly unreadable41.2 GB›",
    "DeveloperReveal25.1 GB›",
    "MailRevealProtected access unavailable",
  ]);
  await page.getByRole("button", { name: "Open System Settings" }).click();
  await expect(
    page.getByText("In Privacy & Security, scroll to Full Disk Access, turn on Burrow, then measure again."),
  ).toBeVisible();
});
