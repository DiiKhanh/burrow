import { expect, type Page, test } from "@playwright/test";

/** Runs a Scan and Cleans its default selection from the Clean tab, until the Clean's summary shows. */
async function cleanFromTab(page: Page) {
  await page.keyboard.press("Meta+1");
  await page.getByRole("button", { name: "Start scan" }).click();
  await page.getByRole("button", { name: "Clean 13 items →" }).click();
  await expect(page.getByRole("region", { name: "Clean summary" })).toBeVisible();
}

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
    "User LibraryTop levelReveal73.1 GB›",
    "HomeTop levelReveal46.3 GB›",
    "ApplicationsReveal onlyReveal19.7 GB›",
    "System LibraryReveal onlyReveal6.83 GB›",
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
  await expect(page.getByText("46.3 GB in this folder, without Library")).toBeVisible();
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
  await expect(page.getByText("46.3 GB in this folder, without Library")).toBeVisible();

  const targets = await page.evaluate(() => window.burrowFake?.measure.calls.map((call) => call.target));
  expect(targets).toEqual([
    { kind: "overview" },
    { kind: "folder", path: "/Users/test", excludeLibrary: true },
    { kind: "folder", path: "/Users/test/Projects" },
  ]);
});

test("opens Home and Old Downloads from the overview with the totals of their rows", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Meta+3");
  await expect(page.getByRole("listitem").filter({ hasText: "Old Downloads (90d+)" })).toContainText("3.02 GB");
  await expect(page.getByRole("region", { name: "Locations" }).getByRole("listitem").nth(1)).toContainText("46.3 GB");

  await page.getByRole("button", { name: "Open Home", exact: true }).click();
  await expect(page.getByText("46.3 GB in this folder, without Library")).toBeVisible();
  const contents = page.getByRole("region", { name: "Contents" }).getByRole("listitem");
  await expect(contents.filter({ hasText: "Library" })).toHaveCount(0);

  await page.getByRole("navigation", { name: "Folders" }).getByRole("button", { name: "This Mac" }).click();
  await page.getByRole("button", { name: "Open Old Downloads (90d+)" }).click();
  await expect(page.getByText("3.02 GB older than 90 days")).toBeVisible();
  await expect(contents).toHaveText(["Xcode_16.xipReveal2.1 GB", "InstallersReveal900 MB›", "invoice.pdfReveal20 MB"]);

  const targets = await page.evaluate(() => window.burrowFake?.measure.calls.map((call) => call.target));
  expect(targets).toEqual([
    { kind: "overview" },
    { kind: "folder", path: "/Users/test", excludeLibrary: true },
    { kind: "folder", path: "/Users/test/Downloads", olderThanDays: 90 },
  ]);
});

test("measures the folder on screen again", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Meta+3");
  await page.getByRole("button", { name: "Open Home", exact: true }).click();
  await expect(page.getByText("46.3 GB in this folder, without Library")).toBeVisible();

  await page.getByRole("button", { name: "Measure again" }).click();

  await expect(page.getByText("46.3 GB in this folder, without Library")).toBeVisible();
  const targets = await page.evaluate(() => window.burrowFake?.measure.calls.map((call) => call.target));
  expect(targets).toEqual([
    { kind: "overview" },
    { kind: "folder", path: "/Users/test", excludeLibrary: true },
    { kind: "folder", path: "/Users/test", excludeLibrary: true },
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
  expect(targets).toEqual([{ kind: "overview" }, { kind: "folder", path: "/Users/test", excludeLibrary: true }]);
});

test("shows what the overview could not read and opens Full Disk Access", async ({ page }) => {
  await page.goto("/?measure=unreadable");
  await page.keyboard.press("Meta+3");

  await expect(page.getByRole("region", { name: "Locations" }).getByRole("listitem").first()).toHaveText(
    "User LibraryTop levelRevealPartly unreadable73.1 GB›",
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

test("marks the overview after a Clean, under its total, until measured again", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Meta+3");
  await expect(page.getByText("146 GB measured on this Mac")).toBeVisible();
  const notice = page.getByRole("region", { name: "Measured before last clean" });
  await expect(notice).toHaveCount(0);

  await cleanFromTab(page);
  await page.keyboard.press("Meta+3");

  await expect(notice).toBeVisible();
  const totalBottom = await page
    .getByText("146 GB measured on this Mac")
    .evaluate((total) => total.getBoundingClientRect().bottom);
  const noticeBox = await notice.boundingBox();
  const insightsTop = (await page.getByRole("region", { name: "Insights" }).boundingBox())?.y ?? 0;
  expect(noticeBox?.y).toBeGreaterThanOrEqual(totalBottom);
  expect((noticeBox?.y ?? 0) + (noticeBox?.height ?? 0)).toBeLessThanOrEqual(insightsTop);

  await notice.getByRole("button", { name: "Measure again" }).click();

  await expect(page.getByText("146 GB measured on this Mac")).toBeVisible();
  await expect(notice).toHaveCount(0);
  const targets = await page.evaluate(() => window.burrowFake?.measure.calls.map((call) => call.target));
  expect(targets).toEqual([{ kind: "overview" }, { kind: "overview" }]);
});

test("marks each folder measured before a Clean, apart from the ones measured again", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Meta+3");
  await page.getByRole("button", { name: "Open Home", exact: true }).click();
  await expect(page.getByText("46.3 GB in this folder")).toBeVisible();

  await cleanFromTab(page);
  await page.keyboard.press("Meta+3");

  const notice = page.getByRole("region", { name: "Measured before last clean" });
  await expect(page.getByText("46.3 GB in this folder")).toBeVisible();
  await notice.getByRole("button", { name: "Measure again" }).click();
  await expect(page.getByText("46.3 GB in this folder")).toBeVisible();
  await expect(notice).toHaveCount(0);

  await page.getByRole("navigation", { name: "Folders" }).getByRole("button", { name: "This Mac" }).click();
  await expect(page.getByText("146 GB measured on this Mac")).toBeVisible();
  await expect(notice).toBeVisible();
});

test("does not mark what is measured after a Clean", async ({ page }) => {
  await page.goto("/");
  await cleanFromTab(page);

  await page.keyboard.press("Meta+3");

  await expect(page.getByText("146 GB measured on this Mac")).toBeVisible();
  await expect(page.getByRole("region", { name: "Measured before last clean" })).toHaveCount(0);
});

/** Opens Space on the project, the deepest fake folder. */
async function openProject(page: Page, url = "/") {
  await page.goto(url);
  await page.keyboard.press("Meta+3");
  await page.getByRole("button", { name: "Open Home", exact: true }).click();
  await page.getByRole("button", { name: "Open Projects" }).click();
  await page.getByRole("button", { name: "Open burrow" }).click();
  await expect(page.getByText("12.1 GB in this folder")).toBeVisible();
}

const trail = (page: Page) => page.getByRole("navigation", { name: "Folders" });
const moveButton = (page: Page) => page.getByRole("button", { name: /^Move \d+ items? to Trash/ });

test("offers no checkbox for what cannot be picked, and says why", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Meta+3");

  const locations = page.getByRole("region", { name: "Locations" });
  await expect(locations.getByRole("checkbox")).toHaveCount(0);
  const applications = locations.getByRole("listitem").filter({ hasText: "Applications" });
  await expect(applications.getByText("Reveal only", { exact: true })).toBeVisible();
  await expect(applications.getByRole("button", { name: "Reveal Applications in Finder" })).toBeAttached();
  await expect(locations.getByRole("listitem").filter({ hasText: "Home" }).getByText("Top level")).toBeVisible();

  const insights = page.getByRole("region", { name: "Insights" });
  await expect(insights.getByRole("listitem").filter({ hasText: "Homebrew Cache" }).getByRole("checkbox")).toHaveCount(
    0,
  );
  await expect(page.getByRole("checkbox", { name: "Pick Docker Data" })).toBeVisible();
});

test("picks across folders, a folder covering what lies in it", async ({ page }) => {
  await openProject(page);

  await page.getByRole("checkbox", { name: "Pick node_modules" }).click();
  await expect(page.getByText("6.4 GB picked")).toBeVisible();
  await trail(page).getByRole("button", { name: "This Mac" }).click();
  await page.getByRole("checkbox", { name: "Pick Docker Data" }).click();
  await expect(moveButton(page)).toHaveText("Move 2 items to Trash (28 GB)");

  await page.getByRole("button", { name: "Open Home", exact: true }).click();
  await page.getByRole("button", { name: "Open Projects" }).click();
  const burrow = page.getByRole("checkbox", { name: "Pick burrow", exact: true });
  await expect(burrow).toHaveAttribute("aria-checked", "mixed");
  await burrow.click();
  await expect(burrow).toBeChecked();
  await expect(moveButton(page)).toHaveText("Move 2 items to Trash (33.7 GB)");

  await page.getByRole("button", { name: "Open burrow" }).click();
  const covered = page.getByRole("checkbox", { name: "Pick node_modules" });
  await expect(covered).toBeChecked();
  await expect(covered).toBeDisabled();
});

test("ticks a row without opening it, and a row still opens around its checkbox", async ({ page }) => {
  await openProject(page);
  const contents = page.getByRole("region", { name: "Contents" });
  const row = contents.getByRole("listitem").filter({ hasText: "dist" });

  await row.getByRole("checkbox").click();
  await expect(row.getByRole("checkbox")).toBeChecked();
  await expect(trail(page).getByRole("button")).toHaveText(["This Mac", "Home", "Projects", "burrow"]);

  await row.getByText("dist").click();
  await expect(trail(page).getByRole("button")).toHaveText(["This Mac", "Home", "Projects", "burrow", "dist"]);
});

test("moves the picks to the Trash and drops their size from every folder above", async ({ page }) => {
  await openProject(page);
  await page.getByRole("checkbox", { name: "Pick node_modules" }).click();

  await moveButton(page).click();

  const result = page.getByRole("region", { name: "Move to Trash result" });
  await expect(result).toContainText("6.4 GB moved to Trash · 1 moved");
  await expect(result).toContainText("Disk space comes back when the Trash is emptied.");
  await expect(page.getByText("5.7 GB in this folder")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open node_modules" })).toHaveCount(0);

  await trail(page).getByRole("button", { name: "Projects" }).click();
  await expect(page.getByText("15 GB in this folder")).toBeVisible();
  await expect(page.getByRole("region", { name: "Contents" }).getByRole("listitem").nth(1)).toContainText("burrow");
  await expect(page.getByRole("region", { name: "Contents" }).getByRole("listitem").nth(1)).toContainText("5.7 GB");
  await trail(page).getByRole("button", { name: "This Mac" }).click();
  await expect(page.getByRole("region", { name: "Locations" }).getByRole("listitem").nth(1)).toContainText("39.9 GB");

  expect(await page.evaluate(() => window.burrowFake?.moveToTrash.last.ids)).toEqual([
    "id:/Users/test/Projects/burrow/node_modules",
  ]);
  expect(await page.evaluate(() => window.burrowFake?.measure.calls.length)).toBe(4);
  await expect(page.getByRole("region", { name: "Measured before last clean" })).toHaveCount(0);

  await result.getByRole("button", { name: "Done" }).click();
  await expect(result).toHaveCount(0);
});

test("says which item it skipped and why, and leaves it in the list", async ({ page }) => {
  await openProject(page, "/?trash=skipped");
  await page.getByRole("checkbox", { name: "Pick node_modules" }).click();
  await page.getByRole("checkbox", { name: "Pick dist" }).click();

  await moveButton(page).click();

  await expect(page.getByRole("region", { name: "Move to Trash result" })).toContainText(
    "3.3 GB moved to Trash · 1 moved · 1 skipped: node_modules (in use)",
  );
  const contents = page.getByRole("region", { name: "Contents" }).getByRole("listitem");
  await expect(contents.first()).toContainText("node_modules");
  await expect(contents.first()).toContainText("6.4 GB");
  await expect(page.getByRole("button", { name: "Open dist" })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Pick node_modules" })).not.toBeChecked();
});

test("shows how far a Move to Trash got", async ({ page }) => {
  await openProject(page, "/?trash=running");
  await page.getByRole("checkbox", { name: "Pick node_modules" }).click();
  await page.getByRole("checkbox", { name: "Pick dist" }).click();

  await moveButton(page).click();

  const progress = page.getByRole("status", { name: "Move to Trash progress" });
  await expect(progress).toContainText("Moving to Trash… 1 / 2");
  await expect(progress).toContainText("6.4 GB moved so far");
  await expect(moveButton(page)).toHaveCount(0);
});

test("says a failed Move to Trash could not finish and keeps the picks", async ({ page }) => {
  await openProject(page, "/?trash=failed");
  await page.getByRole("checkbox", { name: "Pick dist" }).click();

  await moveButton(page).click();

  await expect(page.getByText("Move to Trash could not finish. Measure again to see what is left.")).toBeVisible();
  await expect(moveButton(page)).toHaveText("Move 1 item to Trash (3.3 GB)");
});

test("keeps the footer on screen while the list scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 560 });
  await openProject(page);
  await page.getByRole("checkbox", { name: "Pick node_modules" }).click();
  const footerTop = (await moveButton(page).boundingBox())?.y ?? 0;

  await page.getByRole("region", { name: /^Largest files/ }).scrollIntoViewIfNeeded();

  await expect(moveButton(page)).toBeInViewport();
  expect((await moveButton(page).boundingBox())?.y).toBe(footerTop);
});
