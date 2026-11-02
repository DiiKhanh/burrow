import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import type { SkipReason, TrashReport } from "../mygo";
import { burrowFolder, downloadsFolder, folderAt, overview } from "../testing/measures";
import { fakeGo, type TrashCall } from "../testing/mygo.fake";

const HOME = "/Users/test";
const GB = 1e9;

type User = ReturnType<typeof userEvent.setup>;

/** Opens Space with the overview measured. */
async function openOverview() {
  const user = userEvent.setup();
  render(<App />);
  await user.keyboard("{Meta>}3{/Meta}");
  await act(async () => fakeGo.measure.last.resolve(overview));
  return user;
}

/** Opens the row named name, settling a Measure only if the session has not measured it. */
async function open(user: User, name: string) {
  const measured = fakeGo.measure.calls.length;
  await user.click(screen.getByRole("button", { name: `Open ${name}` }));
  if (fakeGo.measure.calls.length === measured) return;
  await act(async () => fakeGo.measure.last.resolve(folderAt(fakeGo.measure.last.target)));
}

const goTo = (user: User, name: string) =>
  user.click(within(screen.getByRole("navigation", { name: "Folders" })).getByRole("button", { name }));

/** Down to the project, the deepest fake folder. */
async function openBurrow(user: User) {
  await open(user, "Home");
  await open(user, "Projects");
  await open(user, "burrow");
}

const pickBox = (name: string) => screen.getByRole("checkbox", { name: `Pick ${name}` });
const pick = (user: User, name: string) => user.click(pickBox(name));
const moveButton = () => screen.getByRole("button", { name: /^Move \d+ items? to Trash/ });
const moveButtonName = () => moveButton().textContent;
const row = (region: string, name: string) => {
  const found = within(screen.getByRole("region", { name: region }))
    .getAllByRole("listitem")
    .find((item) => item.textContent?.startsWith(name));
  if (!found) throw new Error(`no row ${name} in ${region}`);
  return found;
};

/** Moves what is picked and settles the run with settle. */
async function moveToTrash(user: User, settle: (trash: TrashCall) => void) {
  await user.click(moveButton());
  await act(async () => settle(fakeGo.moveToTrash.last));
}

const movedItem = (path: string, bytes: number, skipReason: SkipReason | null = null) => ({
  id: `id:${path}`,
  name: path.slice(path.lastIndexOf("/") + 1),
  path,
  bytes,
  skipReason,
});

const moved = (...items: ReturnType<typeof movedItem>[]): TrashReport => ({
  items,
  movedBytes: items.filter((item) => !item.skipReason).reduce((sum, item) => sum + item.bytes, 0),
});

const BURROW = `${HOME}/Projects/burrow`;

describe("Space items that cannot be picked", () => {
  it("says Reveal only outside Home, with no checkbox", async () => {
    await openOverview();

    const applications = row("Locations", "Applications");
    expect(applications).toHaveTextContent("ApplicationsReveal onlyReveal19.7 GB");
    expect(within(applications).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(applications).getByText("Reveal only")).toHaveAttribute(
      "title",
      "Outside your home folder: Burrow only shows it in Finder",
    );
  });

  it("says why for Home and its first-level folders, with no checkbox", async () => {
    const user = await openOverview();
    const home = row("Locations", "Home");
    expect(within(home).getByText("Top level")).toHaveAttribute(
      "title",
      "Burrow leaves the top of your home folder alone: pick inside a folder instead",
    );
    expect(within(home).queryByRole("checkbox")).not.toBeInTheDocument();

    await open(user, "Home");

    for (const name of ["Projects", "Movies", "Downloads", "Documents", "notes.txt"]) {
      expect(within(row("Contents", name)).getByText("Top level")).toBeVisible();
      expect(within(row("Contents", name)).queryByRole("checkbox")).not.toBeInTheDocument();
    }
  });

  it("offers no checkbox for what Clean handles, which its tag already says", async () => {
    await openOverview();

    const homebrew = row("Insights", "Homebrew Cache");
    expect(within(homebrew).getByRole("button", { name: "Clean handles this" })).toBeVisible();
    expect(within(homebrew).queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("offers no checkbox for what a Measure could not read: its size is unknown", async () => {
    const user = await openOverview();
    await open(user, "User Library");

    expect(within(row("Contents", "Mail")).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(pickBox("Developer")).toBeEnabled();
  });

  it("offers a checkbox for what lies inside a first-level folder", async () => {
    const user = await openOverview();
    await open(user, "Home");

    expect(pickBox("Trip 2025.mov")).not.toBeChecked();
  });

  it("offers a checkbox for an Insight in Home", async () => {
    await openOverview();

    expect(pickBox("Docker Data")).not.toBeChecked();
  });
});

describe("Space picks", () => {
  it("shows no footer until something is picked", async () => {
    await openOverview();

    expect(screen.queryByRole("button", { name: /to Trash/ })).not.toBeInTheDocument();
  });

  it("shows the picked total and what the button will do", async () => {
    const user = await openOverview();

    await pick(user, "Docker Data");

    expect(pickBox("Docker Data")).toBeChecked();
    expect(screen.getByText("21.6 GB picked")).toBeVisible();
    expect(moveButtonName()).toBe("Move 1 item to Trash (21.6 GB)");
  });

  it("takes a pick back", async () => {
    const user = await openOverview();
    await pick(user, "Docker Data");

    await pick(user, "Docker Data");

    expect(pickBox("Docker Data")).not.toBeChecked();
    expect(screen.queryByRole("button", { name: /to Trash/ })).not.toBeInTheDocument();
  });

  it("keeps picks from several folders while moving around", async () => {
    const user = await openOverview();
    await pick(user, "Docker Data");
    await openBurrow(user);
    await pick(user, "node_modules");
    await goTo(user, "Home");
    await pick(user, "Trip 2025.mov");

    expect(moveButtonName()).toBe("Move 3 items to Trash (36.2 GB)");
    await goTo(user, "This Mac");
    expect(pickBox("Docker Data")).toBeChecked();
    await openBurrow(user);
    expect(pickBox("node_modules")).toBeChecked();
    expect(moveButtonName()).toBe("Move 3 items to Trash (36.2 GB)");
  });

  it("keeps picks when switching tabs", async () => {
    const user = await openOverview();
    await pick(user, "Docker Data");

    await user.keyboard("{Meta>}2{/Meta}");
    await user.keyboard("{Meta>}3{/Meta}");

    expect(pickBox("Docker Data")).toBeChecked();
    expect(moveButtonName()).toBe("Move 1 item to Trash (21.6 GB)");
  });

  it("counts a file listed twice in a folder once, ticked in both lists", async () => {
    const user = await openOverview();
    await open(user, "Home");
    await open(user, "Projects");
    const name = `quote"and'apostrophe.zip`;

    const [contents, largest] = screen.getAllByRole("checkbox", { name: `Pick ${name}` });
    await user.click(contents ?? document.body);

    expect(contents).toBeChecked();
    expect(largest).toBeChecked();
    expect(moveButtonName()).toBe("Move 1 item to Trash (3.1 GB)");
  });

  it("covers what lies in a picked folder, and frees it again", async () => {
    const user = await openOverview();
    await open(user, "Home");
    await open(user, "Projects");
    await pick(user, "burrow");

    await open(user, "burrow");

    for (const name of ["node_modules", "dist", "release", "src"]) {
      expect(pickBox(name)).toBeChecked();
      expect(pickBox(name)).toBeDisabled();
    }
    expect(moveButtonName()).toBe("Move 1 item to Trash (12.1 GB)");

    await goTo(user, "Projects");
    await pick(user, "burrow");
    await open(user, "burrow");

    expect(pickBox("node_modules")).not.toBeChecked();
    expect(pickBox("node_modules")).toBeEnabled();
  });

  it("covers a deep largest file its folder holds", async () => {
    const user = await openOverview();
    await open(user, "Home");
    await open(user, "Projects");

    await pick(user, "burrow");

    expect(pickBox("Burrow.dmg")).toBeChecked();
    expect(pickBox("Burrow.dmg")).toBeDisabled();
  });

  it("picks a folder over what was picked inside it, never the same bytes twice", async () => {
    const user = await openOverview();
    await openBurrow(user);
    await pick(user, "node_modules");
    await pick(user, "dist");
    await goTo(user, "Projects");
    expect(pickBox("burrow")).toBePartiallyChecked();

    await pick(user, "burrow");

    expect(pickBox("burrow")).toBeChecked();
    expect(moveButtonName()).toBe("Move 1 item to Trash (12.1 GB)");
    await user.click(moveButton());
    expect(fakeGo.moveToTrash.last.ids).toEqual([`id:${BURROW}`]);
  });

  it("keeps a pick through Measure again, at its new size", async () => {
    const user = await openOverview();
    await openBurrow(user);
    await pick(user, "dist");

    await user.click(screen.getByRole("button", { name: "Measure again" }));
    const items = burrowFolder.items.map((item) => (item.name === "dist" ? { ...item, bytes: 2 * GB } : item));
    await act(async () =>
      fakeGo.measure.last.resolve({ ...burrowFolder, items, measuredAt: new Date(Date.now() + 60_000).toISOString() }),
    );

    expect(pickBox("dist")).toBeChecked();
    expect(moveButtonName()).toBe("Move 1 item to Trash (2 GB)");
  });

  it("lets go of a pick a Measure no longer lists", async () => {
    const user = await openOverview();
    await openBurrow(user);
    await pick(user, "dist");

    await user.click(screen.getByRole("button", { name: "Measure again" }));
    const items = burrowFolder.items.filter((item) => item.name !== "dist");
    await act(async () => fakeGo.measure.last.resolve({ ...burrowFolder, items }));

    expect(screen.queryByRole("button", { name: /to Trash/ })).not.toBeInTheDocument();
  });
});

describe("Space Move to Trash", () => {
  it("moves by id at once, with no dialog, showing how far it got", async () => {
    const user = await openOverview();
    await openBurrow(user);
    await pick(user, "node_modules");
    await pick(user, "dist");

    await user.click(moveButton());

    expect(fakeGo.moveToTrash.last.ids).toEqual([`id:${BURROW}/node_modules`, `id:${BURROW}/dist`]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => fakeGo.moveToTrash.last.emit({ total: 2, processed: 1, movedBytes: 6.4 * GB }));
    const progress = screen.getByRole("status", { name: "Move to Trash progress" });
    expect(progress).toHaveTextContent("Moving to Trash… 1 / 2");
    expect(progress).toHaveTextContent("6.4 GB moved so far");
    expect(within(progress).getByRole("progressbar")).toHaveAttribute("value", "1");
    expect(screen.queryByRole("button", { name: /^Move \d/ })).not.toBeInTheDocument();
  });

  it("says what moved and that the space comes back with an emptied Trash", async () => {
    const user = await openOverview();
    await openBurrow(user);
    await pick(user, "node_modules");
    await pick(user, "dist");

    await moveToTrash(user, (trash) =>
      trash.resolve(moved(movedItem(`${BURROW}/dist`, 3.3 * GB), movedItem(`${BURROW}/node_modules`, 6.4 * GB))),
    );

    const result = screen.getByRole("region", { name: "Move to Trash result" });
    expect(result).toHaveTextContent("9.7 GB moved to Trash · 2 moved");
    expect(result).not.toHaveTextContent("skipped");
    expect(result).toHaveTextContent("Disk space comes back when the Trash is emptied.");
  });

  it("says each skipped item with its reason", async () => {
    const user = await openOverview();
    await openBurrow(user);
    await pick(user, "node_modules");
    await pick(user, "dist");
    await pick(user, "src");

    await moveToTrash(user, (trash) =>
      trash.resolve(
        moved(
          movedItem(`${BURROW}/dist`, 3.3 * GB),
          movedItem(`${BURROW}/node_modules`, 6.4 * GB, "in_use"),
          movedItem(`${BURROW}/src`, 1.2 * GB, "permission_denied"),
        ),
      ),
    );

    expect(screen.getByRole("region", { name: "Move to Trash result" })).toHaveTextContent(
      "3.3 GB moved to Trash · 1 moved · 2 skipped: node_modules (in use), src (permission denied)",
    );
  });

  it("does not promise space back when nothing moved", async () => {
    const user = await openOverview();
    await openBurrow(user);
    await pick(user, "dist");

    await moveToTrash(user, (trash) => trash.resolve(moved(movedItem(`${BURROW}/dist`, 3.3 * GB, "protected"))));

    const result = screen.getByRole("region", { name: "Move to Trash result" });
    expect(result).toHaveTextContent("0 B moved to Trash · 0 moved · 1 skipped: dist (protected)");
    expect(result).not.toHaveTextContent("Disk space comes back");
  });

  it("clears the picks, and the result with Done or the next pick", async () => {
    const user = await openOverview();
    await openBurrow(user);
    await pick(user, "dist");
    await moveToTrash(user, (trash) => trash.resolve(moved(movedItem(`${BURROW}/dist`, 3.3 * GB))));

    expect(screen.queryByRole("button", { name: /^Move \d/ })).not.toBeInTheDocument();
    await pick(user, "src");
    expect(screen.queryByRole("region", { name: "Move to Trash result" })).not.toBeInTheDocument();
    expect(moveButtonName()).toBe("Move 1 item to Trash (1.2 GB)");

    await moveToTrash(user, (trash) => trash.resolve(moved(movedItem(`${BURROW}/src`, 1.2 * GB))));
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("region", { name: "Move to Trash result" })).not.toBeInTheDocument();
  });

  it("keeps a pick made while moving, and still says how the run went", async () => {
    const user = await openOverview();
    await openBurrow(user);
    await pick(user, "dist");
    await user.click(moveButton());

    await pick(user, "src");
    await act(async () => fakeGo.moveToTrash.last.resolve(moved(movedItem(`${BURROW}/dist`, 3.3 * GB, "in_use"))));

    expect(pickBox("src")).toBeChecked();
    expect(moveButtonName()).toBe("Move 1 item to Trash (1.2 GB)");
    expect(screen.getByRole("region", { name: "Move to Trash result" })).toHaveTextContent("dist (in use)");
  });

  it("says a failed run could not finish and keeps the picks to try again", async () => {
    const user = await openOverview();
    await openBurrow(user);
    await pick(user, "dist");

    await moveToTrash(user, (trash) => trash.reject());

    expect(screen.getByText("Move to Trash could not finish. Measure again to see what is left.")).toBeVisible();
    expect(pickBox("dist")).toBeChecked();
    await user.click(moveButton());
    expect(fakeGo.moveToTrash.calls).toHaveLength(2);
    expect(screen.queryByText(/could not finish/)).not.toBeInTheDocument();
  });
});

describe("Space sizes after Move to Trash", () => {
  async function moveNodeModules(user: User) {
    await openBurrow(user);
    await pick(user, "node_modules");
    await moveToTrash(user, (trash) => trash.resolve(moved(movedItem(`${BURROW}/node_modules`, 6.4 * GB))));
  }

  it("drops the moved item and takes its size off the total, largest first", async () => {
    const user = await openOverview();

    await moveNodeModules(user);

    expect(screen.queryByRole("button", { name: "Open node_modules" })).not.toBeInTheDocument();
    expect(screen.getByText("5.7")).toBeVisible();
    const rows = within(screen.getByRole("region", { name: "Contents" })).getAllByRole("listitem");
    expect(rows.map((item) => item.textContent)).toEqual([
      "distRegenerableReveal3.3 GB›",
      "releaseReveal1.2 GB›",
      "srcReveal1.2 GB›",
    ]);
  });

  it("takes its size off every folder above, without measuring again", async () => {
    const user = await openOverview();
    await moveNodeModules(user);
    const measured = fakeGo.measure.calls.length;

    await goTo(user, "Projects");
    expect(screen.getByText("15")).toBeVisible();
    expect(row("Contents", "burrow")).toHaveTextContent("5.7 GB");

    await goTo(user, "Home");
    expect(screen.getByText("39.9")).toBeVisible();
    expect(row("Contents", "Projects")).toHaveTextContent("15 GB");

    await goTo(user, "This Mac");
    expect(screen.getByText("140")).toBeVisible();
    expect(row("Locations", "Home")).toHaveTextContent("39.9 GB");
    expect(row("Locations", "User Library")).toHaveTextContent("73.1 GB");
    expect(fakeGo.measure.calls).toHaveLength(measured);
  });

  it("does not mark the results as measured before anything", async () => {
    const user = await openOverview();

    await moveNodeModules(user);

    expect(screen.queryByRole("region", { name: "Measured before last clean" })).not.toBeInTheDocument();
  });

  it("drops a moved folder's largest files, and a moved largest file from the folder above", async () => {
    const user = await openOverview();
    await open(user, "Home");
    await open(user, "Projects");
    await pick(user, "burrow");

    await moveToTrash(user, (trash) => trash.resolve(moved(movedItem(BURROW, 12.1 * GB))));

    expect(screen.queryByRole("checkbox", { name: "Pick Burrow.dmg" })).not.toBeInTheDocument();
    await goTo(user, "Home");
    expect(screen.queryByText("Burrow.dmg")).not.toBeInTheDocument();
  });

  it("goes back to the deepest folder left when the one on screen moved", async () => {
    const user = await openOverview();
    await open(user, "Home");
    await open(user, "Projects");
    await pick(user, "burrow");
    await open(user, "burrow");
    const measured = fakeGo.measure.calls.length;

    await moveToTrash(user, (trash) => trash.resolve(moved(movedItem(BURROW, 12.1 * GB))));

    const trail = within(screen.getByRole("navigation", { name: "Folders" }));
    expect(trail.getAllByRole("button").map((crumb) => crumb.textContent)).toEqual(["This Mac", "Home", "Projects"]);
    expect(screen.getByText("9.3")).toBeVisible();
    expect(screen.queryByText("This folder is empty.")).not.toBeInTheDocument();
    expect(fakeGo.measure.calls).toHaveLength(measured);
  });

  it("stays in the folder on screen when a folder elsewhere moved", async () => {
    const user = await openOverview();
    await pick(user, "Docker Data");
    await openBurrow(user);

    await moveToTrash(user, (trash) =>
      trash.resolve(moved(movedItem(`${HOME}/Library/Containers/com.docker.docker/Data`, 21.6 * GB))),
    );

    const trail = within(screen.getByRole("navigation", { name: "Folders" }));
    expect(trail.getAllByRole("button").map((crumb) => crumb.textContent)).toEqual([
      "This Mac",
      "Home",
      "Projects",
      "burrow",
    ]);
  });

  it("drops an Insight inside what moved, and shrinks the ones around it", async () => {
    const user = await openOverview();
    await open(user, "User Library");
    await pick(user, "Developer");

    await moveToTrash(user, (trash) => trash.resolve(moved(movedItem(`${HOME}/Library/Developer`, 25.1 * GB))));
    await goTo(user, "This Mac");

    expect(screen.queryByRole("button", { name: "Open Xcode Simulators" })).not.toBeInTheDocument();
    expect(row("Locations", "User Library")).toHaveTextContent("48 GB");
  });

  it("leaves Home's row alone for what moved out of ~/Library, which it does not count", async () => {
    const user = await openOverview();
    await open(user, "User Library");
    await pick(user, "Developer");

    await moveToTrash(user, (trash) => trash.resolve(moved(movedItem(`${HOME}/Library/Developer`, 25.1 * GB))));
    await goTo(user, "This Mac");

    expect(row("Locations", "Home")).toHaveTextContent("46.3 GB");
  });

  it("shrinks Old Downloads for an old item", async () => {
    const user = await openOverview();
    await open(user, "Old Downloads (90d+)");
    await user.click(screen.getAllByRole("checkbox", { name: "Pick Xcode_16.xip" })[0] ?? document.body);

    await moveToTrash(user, (trash) => trash.resolve(moved(movedItem(`${HOME}/Downloads/Xcode_16.xip`, 2.1 * GB))));

    expect(screen.getByText("920")).toBeVisible();
    await goTo(user, "This Mac");
    expect(row("Insights", "Old Downloads (90d+)")).toHaveTextContent("920 MB");
    expect(row("Locations", "Home")).toHaveTextContent("44.2 GB");
  });

  it("leaves Old Downloads alone for an item it does not count", async () => {
    const user = await openOverview();
    await open(user, "Old Downloads (90d+)");
    await goTo(user, "This Mac");
    await open(user, "Home");
    await open(user, "Downloads");
    expect(fakeGo.measure.last.target).toEqual(downloadsFolder.target);
    await pick(user, "macOS.ipsw");

    await moveToTrash(user, (trash) => trash.resolve(moved(movedItem(`${HOME}/Downloads/macOS.ipsw`, 4.58 * GB))));
    await goTo(user, "This Mac");

    expect(row("Insights", "Old Downloads (90d+)")).toHaveTextContent("3.02 GB");
  });

  it("leaves a skipped item and its size in place", async () => {
    const user = await openOverview();
    await openBurrow(user);
    await pick(user, "dist");

    await moveToTrash(user, (trash) => trash.resolve(moved(movedItem(`${BURROW}/dist`, 3.3 * GB, "in_use"))));

    expect(row("Contents", "dist")).toHaveTextContent("3.3 GB");
    expect(screen.getByText("12.1")).toBeVisible();
    expect(pickBox("dist")).not.toBeChecked();
  });

  it("drops an item already gone, since nothing is left to show", async () => {
    const user = await openOverview();
    await openBurrow(user);
    await pick(user, "dist");

    await moveToTrash(user, (trash) => trash.resolve(moved(movedItem(`${BURROW}/dist`, 3.3 * GB, "already_gone"))));

    expect(screen.queryByRole("button", { name: "Open dist" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Move to Trash result" })).toHaveTextContent(
      "0 moved · 1 skipped: dist (already gone)",
    );
  });
});
