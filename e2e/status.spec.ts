import { expect, type Page, test } from "@playwright/test";
import type { Snapshot } from "../src/mygo";
import { snapshot } from "../src/testing/snapshots";

// Go's side of the page: the fake client's hook in `--mode fake`.
async function sendStatus(page: Page, s: Snapshot) {
  await page.evaluate((payload) => window.burrowFake?.emitStatus(payload), s);
}

function card(page: Page, name: string) {
  return page.getByRole("region", { name });
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
  const cards = page.getByRole("tabpanel", { name: "Status" }).locator(".rounded-card");
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
