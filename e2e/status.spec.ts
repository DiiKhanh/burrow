import { expect, type Page, test } from "@playwright/test";
import type { Snapshot } from "../src/mygo";
import { snapshot } from "../src/testing/snapshots";

// Go's side of the page: the fake client's hook in `--mode fake`.
async function sendStatus(page: Page, s: Snapshot) {
  await page.evaluate((payload) => window.burrowFake?.emitStatus(payload), s);
}

function card(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

test.beforeEach(async ({ page }) => {
  // Uptime counts back from the clock to the day the Mac started.
  await page.clock.setFixedTime(new Date(2026, 9, 23, 12, 0, 0));
  await page.goto("/");
});

test("shows the Health and CPU cards from Go's snapshot", async ({ page }) => {
  await page.keyboard.press("Meta+2");
  await sendStatus(page, snapshot());

  const health = card(page, "Health");
  await expect(health).toContainText("78Good");
  await expect(health).toContainText("Restart recommended");
  await expect(health).toContainText("Apple M2 · 16.0 GB");
  await expect(health).toContainText("macOS 15.7.9");
  await expect(health).toContainText("up 21 days · since Oct 2");

  const cpu = card(page, "CPU");
  await expect(cpu).toContainText("30%");
  await expect(cpu).toContainText("4P + 4E cores");
  await expect(cpu).toContainText("Load 3.76 · 3.16 · 3.75");
});

test("opens Status with a full minute of CPU history", async ({ page }) => {
  await sendStatus(page, snapshot()); // arrives while Clean is shown
  await page.getByRole("tab", { name: "Status" }).click();

  await expect(card(page, "CPU").locator("rect")).toHaveCount(60);
  await expect(card(page, "CPU")).toContainText("30%");
});

test("shows a dash for each field Go could not read", async ({ page }) => {
  await page.keyboard.press("Meta+2");
  await sendStatus(
    page,
    snapshot({
      healthScore: { score: null, level: null, reasons: [] },
      hardware: { cpuModel: null, ram: null, osVersion: null },
      uptimeSeconds: null,
      cpu: { usage: null, load1: null, load5: null, load15: null, pCores: null, eCores: null },
      series: { cpu: [] },
    }),
  );

  await expect(card(page, "Health")).toContainText("- · -");
  await expect(card(page, "CPU")).toContainText("Load - · - · -");
  await expect(card(page, "CPU").locator("rect")).toHaveCount(0);
});

test("shows all remaining Status cards from Go's snapshot", async ({ page }) => {
  await page.keyboard.press("Meta+2");
  await sendStatus(page, snapshot());

  await expect(card(page, "Memory")).toContainText("83%");
  await expect(card(page, "Memory")).toContainText("Normal");
  await expect(card(page, "Memory")).toContainText("14.2 GB / 17.2 GB");
  await expect(card(page, "Network")).toContainText("450KB/s");
  await expect(card(page, "Network")).toContainText("Upload 57 KB/s");
  await expect(card(page, "Battery")).toContainText("100% Charged");
  await expect(card(page, "Battery")).toContainText("Magic Mouse 64%");
  await expect(card(page, "Disk")).toContainText("14GB free");
  await expect(card(page, "Disk")).toContainText("Trash 42 MB");
  await expect(card(page, "Disk I/O")).toContainText("2.5MB/s read");
  await expect(card(page, "Thermal")).toContainText("53°C");
  await expect(card(page, "Thermal")).not.toContainText("RPM");
});

test("uses Power on a desktop Mac and only shows RPM when a fan exists", async ({ page }) => {
  await page.keyboard.press("Meta+2");
  await sendStatus(page, snapshot({ battery: null, power: { systemWatts: 9.5, adapterWatts: 30 }, bluetooth: [] }));

  await expect(card(page, "Power")).toContainText("9.5W system");
  await expect(card(page, "Power")).toContainText("30 W adapter");
  await expect(card(page, "Battery")).toHaveCount(0);
  await expect(card(page, "Thermal")).not.toContainText("RPM");

  await sendStatus(page, snapshot({ battery: null, thermal: { hasFan: true, fanRPM: 1_800 } }));
  await expect(card(page, "Thermal")).toContainText("1,800 RPM");
});

test("keeps every Status card usable when collectors omit fields", async ({ page }) => {
  await page.keyboard.press("Meta+2");
  await sendStatus(
    page,
    snapshot({
      memory: { used: null, total: null, usedPercent: null, swapUsed: null, pressure: null },
      network: { downloadBytesPerSecond: null, uploadBytesPerSecond: null, interface: null },
      battery: { percent: null, state: null, timeRemaining: null, cycles: null, maximumCapacity: null },
      disk: { free: null, used: null, total: null, purgeable: null, trash: null },
      diskIO: { readBytesPerSecond: null, writeBytesPerSecond: null },
      thermal: { cpuCelsius: null, systemWatts: null, hasFan: null, fanRPM: null },
      bluetooth: [],
      series: { memory: [], networkDownload: [], diskRead: [], thermalCPU: [] },
    }),
  );

  for (const name of ["Memory", "Network", "Battery", "Disk", "Disk I/O", "Thermal"]) {
    await expect(card(page, name)).toContainText("-");
  }
  await expect(card(page, "Disk")).toContainText("Trash Unavailable");
  await expect(card(page, "Thermal")).toContainText("Fan -");
});

test("scrolls vertically without horizontal overflow in a short window", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 420 });
  await page.keyboard.press("Meta+2");
  await sendStatus(page, snapshot());

  const status = page.getByRole("tabpanel", { name: "Status" }).locator("main");
  await expect.poll(() => status.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  expect(
    await page.evaluate(() => ({
      page: document.documentElement.scrollWidth <= window.innerWidth,
      status: [...document.querySelectorAll("main")].every((element) => element.scrollWidth <= element.clientWidth),
    })),
  ).toEqual({ page: true, status: true });
});

test("colors the Health level by how serious it is", async ({ page }) => {
  await page.keyboard.press("Meta+2");
  await sendStatus(page, snapshot({ healthScore: { score: 38, level: "needs-attention", reasons: ["overheating"] } }));

  // --color-danger in src/styles.css.
  await expect(card(page, "Health").getByText("Overheating")).toHaveCSS("color", "rgb(255, 107, 97)");
});

// Card boxes of prototype variant D's Status bento at 1100x760
// (branch prototype/ui-clean-status, `?variant=D&tab=status`).
const PROTOTYPE_BENTO = [
  { x: 32, y: 122, width: 333, height: 178 },
  { x: 377, y: 122, width: 222, height: 178 },
  { x: 612, y: 122, width: 222, height: 178 },
  { x: 846, y: 122, width: 222, height: 178 },
  { x: 32, y: 312, width: 333, height: 178 },
  { x: 377, y: 312, width: 222, height: 178 },
  { x: 612, y: 312, width: 222, height: 178 },
  { x: 846, y: 312, width: 222, height: 178 },
];

test("lays the cards out as the prototype's 4x2 bento", async ({ page }) => {
  await page.keyboard.press("Meta+2");
  const cards = page.getByRole("tabpanel", { name: "Status" }).locator(".grid-bento > *");
  await expect(cards).toHaveCount(8);

  const boxes = await cards.evaluateAll((elements) =>
    elements.map((el) => {
      const { x, y, width, height } = el.getBoundingClientRect();
      return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
    }),
  );
  expect(boxes).toEqual(PROTOTYPE_BENTO);
  await expect(card(page, "Health")).toHaveJSProperty("offsetLeft", 32);
});

test("lists the top processes by CPU under the bento", async ({ page }) => {
  await page.keyboard.press("Meta+2");
  await sendStatus(page, snapshot());

  const table = page.getByRole("table", { name: "Top processes" });
  await expect(table.getByRole("row")).toHaveCount(6);
  await expect(table.getByRole("row").nth(1)).toHaveText(/Safari\s*140%\s*1\.24 GB\s*512/);
  await expect(table.getByRole("columnheader", { name: "CPU" })).toHaveAttribute("aria-sort", "descending");
  await table.getByRole("columnheader", { name: "Memory" }).click();
  await expect(table.getByRole("row").nth(1)).toContainText("Safari");
});

test("keeps the process table at least 220px tall in a short window", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 420 });
  await page.keyboard.press("Meta+2");
  await sendStatus(page, snapshot());

  const table = page.getByRole("table", { name: "Top processes" }).locator("..");
  expect((await table.boundingBox())?.height).toBeGreaterThanOrEqual(220);
});

test("dims the last values while the collector restarts, then recovers", async ({ page }) => {
  await page.keyboard.press("Meta+2");
  await sendStatus(page, snapshot());
  const dimmed = card(page, "CPU").locator("xpath=ancestor::div[contains(@class, 'transition-opacity')]");
  await expect(dimmed).toHaveCSS("opacity", "1");

  await sendStatus(page, snapshot({ collector: "retrying" }));
  await expect(page.getByRole("status")).toHaveText("Status paused, retrying…");
  await expect(card(page, "CPU")).toContainText("30%");
  await expect(page.getByRole("table", { name: "Top processes" })).toContainText("Safari");
  await expect(dimmed).toHaveCSS("opacity", "0.5");

  await sendStatus(page, snapshot({ cpu: { usage: 55 } }));
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(card(page, "CPU")).toContainText("55%");
  await expect(dimmed).toHaveCSS("opacity", "1");
});

test("keeps the retrying notice in view while scrolled to the process table", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 420 });
  await page.keyboard.press("Meta+2");
  await sendStatus(page, snapshot({ collector: "retrying" }));

  await page.getByRole("table", { name: "Top processes" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("status")).toBeInViewport();
});
