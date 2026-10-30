import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import { folderAt, homeFolder, overview } from "../testing/measures";
import { fakeGo } from "../testing/mygo.fake";

async function openSpace() {
  const user = userEvent.setup();
  render(<App />);
  await user.keyboard("{Meta>}3{/Meta}");
  return user;
}

describe("Space Measure", () => {
  it("measures nothing until Space opens", () => {
    render(<App />);
    expect(fakeGo.measure.calls).toHaveLength(0);
  });

  it("measures the overview once Space opens, showing what it measures", async () => {
    await openSpace();

    expect(fakeGo.measure.last.target).toEqual({ kind: "overview" });
    const progress = screen.getByRole("status", { name: "Measure progress" });
    expect(within(progress).getByText("Measuring…")).toBeVisible();
    expect(within(progress).getByText("Applications, Library, your home folder and insights")).toBeVisible();
    expect(within(progress).getByRole("progressbar")).not.toHaveAttribute("value");
  });

  it("cancels the Measure by closing its channel and ignores its late result", async () => {
    const user = await openSpace();
    const measure = fakeGo.measure.last;

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(measure.cancelled).toBe(true);
    expect(screen.getByRole("button", { name: "Measure this Mac" })).toBeVisible();

    await act(async () => measure.resolve(overview));
    expect(screen.queryByRole("region", { name: "Locations" })).not.toBeInTheDocument();
  });

  it("measures again from the cancelled state", async () => {
    const user = await openSpace();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "Measure this Mac" }));

    expect(fakeGo.measure.calls).toHaveLength(2);
    expect(screen.getByRole("status", { name: "Measure progress" })).toBeVisible();
  });

  it("says the Measure failed and offers to try again", async () => {
    const user = await openSpace();

    await act(async () => fakeGo.measure.last.reject());
    expect(screen.getByText("Measure could not finish. Try again.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Measure this Mac" }));
    expect(fakeGo.measure.calls).toHaveLength(2);
  });
});

describe("Space overview", () => {
  it("shows the total of the locations, Insights above them", async () => {
    await openSpace();
    await act(async () => fakeGo.measure.last.resolve(overview));

    expect(screen.getByText("146")).toBeVisible();
    expect(screen.getByText("GB measured on this Mac")).toBeVisible();
    expect(screen.getAllByRole("region")).toEqual([
      screen.getByRole("region", { name: "Insights" }),
      screen.getByRole("region", { name: "Locations" }),
    ]);
  });

  it("lists every Insight and location with its size, largest first", async () => {
    await openSpace();
    await act(async () => fakeGo.measure.last.resolve(overview));

    const rows = (name: string) =>
      within(screen.getByRole("region", { name }))
        .getAllByRole("listitem")
        .map((row) => row.textContent);
    expect(rows("Insights")).toEqual([
      "Docker Data21.6 GB›",
      "Xcode Simulators3.07 GB›",
      "Old Downloads (90d+)3.02 GB›",
      "Homebrew Cache181 MB›",
      "System Logs2.1 MB›",
    ]);
    expect(rows("Locations")).toEqual([
      "User Library73.1 GB›",
      "Home46.4 GB›",
      "Applications19.7 GB›",
      "System Library6.83 GB›",
    ]);
  });

  it("keeps the overview when switching tabs, without measuring again", async () => {
    const user = await openSpace();
    await act(async () => fakeGo.measure.last.resolve(overview));

    await user.keyboard("{Meta>}1{/Meta}");
    await user.keyboard("{Meta>}3{/Meta}");

    expect(screen.getByRole("region", { name: "Locations" })).toBeVisible();
    expect(fakeGo.measure.calls).toHaveLength(1);
  });
});

const HOME = "/Users/test";

/** Opens Space with the overview measured. */
async function openOverview() {
  const user = await openSpace();
  await act(async () => fakeGo.measure.last.resolve(overview));
  return user;
}

/** Opens the row named name and settles its Measure with the fake folder. */
async function openFolder(user: ReturnType<typeof userEvent.setup>, name: string, path: string) {
  await user.click(screen.getByRole("button", { name: `Open ${name}` }));
  expect(fakeGo.measure.last.target).toEqual({ kind: "folder", path });
  await act(async () => fakeGo.measure.last.resolve(folderAt(path)));
}

function crumbs() {
  return within(screen.getByRole("navigation", { name: "Folders" }))
    .getAllByRole("button")
    .map((crumb) => crumb.textContent);
}

describe("Space folders", () => {
  it("measures the folder a row opens, showing which", async () => {
    const user = await openOverview();

    await user.click(screen.getByRole("button", { name: "Open Home" }));

    expect(fakeGo.measure.last.target).toEqual({ kind: "folder", path: HOME });
    const progress = screen.getByRole("status", { name: "Measure progress" });
    expect(within(progress).getByText(HOME)).toBeVisible();
  });

  it("lists the folder's contents with its total, largest first", async () => {
    const user = await openOverview();
    await openFolder(user, "Home", HOME);

    expect(screen.getByText("46.3")).toBeVisible();
    expect(screen.getByText("GB in this folder")).toBeVisible();
    const rows = within(screen.getByRole("region", { name: "Contents" }))
      .getAllByRole("listitem")
      .map((row) => row.textContent);
    expect(rows).toEqual([
      "Projects21.4 GB›",
      "Movies12.8 GB›",
      "Downloads7.6 GB›",
      "Documents4.5 GB›",
      "notes.txt12 KB",
    ]);
    expect(screen.queryByRole("button", { name: "Open notes.txt" })).not.toBeInTheDocument();
  });

  it("shows the trail from This Mac to the folder, current last", async () => {
    const user = await openOverview();
    await openFolder(user, "Home", HOME);
    await openFolder(user, "Projects", `${HOME}/Projects`);

    expect(crumbs()).toEqual(["This Mac", "Home", "Projects"]);
    const current = within(screen.getByRole("navigation", { name: "Folders" })).getByRole("button", {
      name: "Projects",
    });
    expect(current).toHaveAttribute("aria-current", "page");
  });

  it("goes back up any number of levels without measuring again", async () => {
    const user = await openOverview();
    await openFolder(user, "Home", HOME);
    await openFolder(user, "Projects", `${HOME}/Projects`);

    await user.click(screen.getByRole("button", { name: "This Mac" }));
    expect(screen.getByRole("region", { name: "Locations" })).toBeVisible();
    expect(crumbs()).toEqual(["This Mac"]);

    await user.click(screen.getByRole("button", { name: "Open Home" }));
    expect(screen.getByRole("region", { name: "Contents" })).toBeVisible();
    expect(fakeGo.measure.calls).toHaveLength(3);
  });

  it("measures the folder on screen again and shows the new result", async () => {
    const user = await openOverview();
    await openFolder(user, "Home", HOME);

    await user.click(screen.getByRole("button", { name: "Measure again" }));
    expect(fakeGo.measure.calls).toHaveLength(3);
    expect(fakeGo.measure.last.target).toEqual({ kind: "folder", path: HOME });
    expect(screen.getByRole("status", { name: "Measure progress" })).toBeVisible();

    await act(async () =>
      fakeGo.measure.last.resolve({ ...homeFolder, items: homeFolder.items.slice(1), totalBytes: 24.9e9 }),
    );
    expect(screen.getByText("24.9")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Open Projects" })).not.toBeInTheDocument();
  });

  it("measures the overview again from This Mac", async () => {
    const user = await openOverview();

    await user.click(screen.getByRole("button", { name: "Measure again" }));

    expect(fakeGo.measure.calls).toHaveLength(2);
    expect(fakeGo.measure.last.target).toEqual({ kind: "overview" });
  });

  it("goes back to the folder it came from when a folder's Measure is cancelled", async () => {
    const user = await openOverview();
    await user.click(screen.getByRole("button", { name: "Open Home" }));
    const measure = fakeGo.measure.last;

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(measure.cancelled).toBe(true);
    expect(crumbs()).toEqual(["This Mac"]);
    expect(screen.getByRole("region", { name: "Locations" })).toBeVisible();
    await act(async () => measure.resolve(homeFolder));
    expect(screen.queryByRole("region", { name: "Contents" })).not.toBeInTheDocument();
  });

  it("keeps the last result when Measure again is cancelled", async () => {
    const user = await openOverview();
    await openFolder(user, "Home", HOME);
    await user.click(screen.getByRole("button", { name: "Measure again" }));

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(crumbs()).toEqual(["This Mac", "Home"]);
    expect(screen.getByRole("region", { name: "Contents" })).toBeVisible();
  });

  it("cancels a folder's Measure when the trail goes back up", async () => {
    const user = await openOverview();
    await user.click(screen.getByRole("button", { name: "Open Home" }));
    const measure = fakeGo.measure.last;

    await user.click(screen.getByRole("button", { name: "This Mac" }));

    expect(measure.cancelled).toBe(true);
    expect(screen.getByRole("region", { name: "Locations" })).toBeVisible();
  });

  it("says a folder's Measure failed and offers to measure it again", async () => {
    const user = await openOverview();
    await user.click(screen.getByRole("button", { name: "Open Home" }));

    await act(async () => fakeGo.measure.last.reject());

    expect(screen.getByText("Measure could not finish. Try again.")).toBeVisible();
    expect(crumbs()).toEqual(["This Mac", "Home"]);
    await user.click(screen.getByRole("button", { name: "Measure again" }));
    expect(fakeGo.measure.last.target).toEqual({ kind: "folder", path: HOME });
  });

  it("says an empty folder is empty", async () => {
    const user = await openOverview();
    await user.click(screen.getByRole("button", { name: "Open Applications" }));
    await act(async () => fakeGo.measure.last.resolve(folderAt("/Applications")));

    expect(screen.getByText("This folder is empty.")).toBeVisible();
  });
});
