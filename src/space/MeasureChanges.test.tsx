import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { App } from "../App";
import type { MeasureResult } from "../mygo";
import { downloadsFolder, homeFolder, libraryFolder, oldDownloadsFolder, overview } from "../testing/measures";
import { fakeGo } from "../testing/mygo.fake";

const changes = "Since last Measure";
const button = (name: string) => screen.getByRole("button", { name });
const settle = (result: MeasureResult) => act(async () => fakeGo.measure.last.resolve(result));

async function openOverview() {
  const user = userEvent.setup();
  render(<App />);
  await user.keyboard("{Meta>}3{/Meta}");
  await settle(overview);
  return user;
}

it("shows the largest increase first while Contents still leads with the largest item", async () => {
  const user = await openOverview();
  await user.click(button("Open Home"));
  await settle(homeFolder);
  expect(screen.queryByRole("heading", { name: changes })).not.toBeInTheDocument();

  await user.click(button("Measure again"));
  await settle(resized(resized(homeFolder, "Downloads", 7.8e9), "Movies", 12.7e9));

  const table = within(screen.getByRole("table", { name: changes }));
  expect(table.getAllByRole("rowheader").map((cell) => cell.textContent)).toEqual(["Downloads", "Movies"]);
  expect(table.getByRole("row", { name: "Downloads 7.6 GB 7.8 GB +200 MB" })).toBeVisible();
  expect(table.getByRole("row", { name: "Movies 12.8 GB 12.7 GB -100 MB" })).toBeVisible();
  const contents = within(screen.getByRole("region", { name: "Contents" }));
  expect(contents.getAllByRole("listitem")[0]).toHaveTextContent("Projects");
});

type User = ReturnType<typeof userEvent.setup>;

async function measureAgain(user: User, result: MeasureResult) {
  await user.click(button("Measure again"));
  await settle(result);
}

function resized(result: MeasureResult, name: string, bytes: number): MeasureResult {
  const items = result.items.map((item) => (item.name === name ? { ...item, bytes } : item));
  return { ...result, items, totalBytes: items.reduce((total, item) => total + item.bytes, 0) };
}

it.each(["cancelled", "failed", "superseded"] as const)(
  "keeps the last two successful Measures after a %s attempt",
  async (outcome) => {
    const user = await openOverview();
    await user.click(button("Open Home"));
    await settle(homeFolder);
    await measureAgain(user, resized(homeFolder, "Downloads", 8e9));
    await user.click(button("Measure again"));
    const attempt = fakeGo.measure.last;
    if (outcome === "failed") {
      await act(async () => attempt.reject());
    } else {
      if (outcome === "cancelled") {
        await user.click(button("Cancel"));
      } else {
        await user.click(button("This Mac"));
        await user.click(button("Open Home"));
      }
      await act(async () => attempt.resolve(resized(homeFolder, "Downloads", 9e9)));
    }

    expect(screen.getByRole("row", { name: "Downloads 7.6 GB 8 GB +400 MB" })).toBeVisible();
    await measureAgain(user, resized(homeFolder, "Downloads", 8.1e9));
    expect(screen.getByRole("row", { name: "Downloads 8 GB 8.1 GB +100 MB" })).toBeVisible();
  },
);

it("keeps separate baselines for Downloads and its Old Downloads Insight", async () => {
  const user = await openOverview();
  await user.click(button("Open Old Downloads (90d+)"));
  await settle(oldDownloadsFolder);
  await user.click(button("This Mac"));
  await user.click(button("Open Home"));
  await settle(homeFolder);
  await user.click(button("Open Downloads"));
  await settle(resized(downloadsFolder, "Installers", 2e9));
  expect(screen.queryByRole("heading", { name: changes })).not.toBeInTheDocument();

  await user.click(button("This Mac"));
  await user.click(button("Open Old Downloads (90d+)"));
  await measureAgain(user, resized(oldDownloadsFolder, "Installers", 950e6));
  expect(screen.getByRole("row", { name: "Installers 900 MB 950 MB +50 MB" })).toBeVisible();
});

it("omits changes for missing or incomplete readings on either side", async () => {
  const user = await openOverview();
  await user.click(button("Open User Library"));
  await settle(libraryFolder);
  // The old partial and unavailable rows can now be read. Developer became partial.
  const items = libraryFolder.items.map((item) => ({
    ...item,
    bytes: 50e6,
    readState: item.name === "Developer" ? ("partial" as const) : ("complete" as const),
  }));
  const newFile = {
    id: "new",
    name: "new.txt",
    path: "/Users/test/Library/new.txt",
    bytes: 200,
    isDir: false,
    readState: "complete" as const,
    opens: null,
    blocked: null,
    tags: [],
  };
  await measureAgain(user, { ...libraryFolder, items: [...items, newFile], totalBytes: 150e6 + newFile.bytes });
  expect(screen.getByText("No size changes among items fully measured both times.")).toBeVisible();
  expect(screen.queryByRole("table", { name: changes })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open Developer" })).toBeVisible();
  expect(screen.getByText("Partly unreadable")).toBeVisible();
});

it("starts a new baseline when Burrow opens a new session", async () => {
  const first = await openOverview();
  await first.click(button("Open Home"));
  await settle(homeFolder);
  await measureAgain(first, resized(homeFolder, "Downloads", 8e9));
  expect(screen.getByRole("table", { name: changes })).toBeVisible();

  cleanup();
  const next = await openOverview();
  await next.click(button("Open Home"));
  await settle(resized(homeFolder, "Downloads", 9e9));
  expect(screen.getByRole("region", { name: "Contents" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: changes })).not.toBeInTheDocument();
});
