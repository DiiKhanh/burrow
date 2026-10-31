import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../App";
import {
  downloadsFolder,
  folderAt,
  homeFolder,
  libraryFolder,
  oldDownloadsFolder,
  overview,
  unreadableOverview,
} from "../testing/measures";
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
      "Docker DataInsightReveal21.6 GB›",
      "Xcode SimulatorsInsightReveal3.07 GB›",
      "Old Downloads (90d+)InsightReveal3.02 GB›",
      "Homebrew CacheInsightClean handles thisReveal181 MB›",
      "System LogsInsightClean handles thisReveal2.1 MB›",
    ]);
    expect(rows("Locations")).toEqual([
      "User LibraryReveal73.1 GB›",
      "HomeReveal46.3 GB›",
      "ApplicationsReveal19.7 GB›",
      "System LibraryReveal6.83 GB›",
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
  await act(async () => fakeGo.measure.last.resolve(folderAt({ kind: "folder", path })));
}

const HOME_TARGET = { kind: "folder", path: HOME, excludeLibrary: true };

/** Opens Home from the overview and settles its Measure. */
async function openHome(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Open Home" }));
  expect(fakeGo.measure.last.target).toEqual(HOME_TARGET);
  await act(async () => fakeGo.measure.last.resolve(homeFolder));
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

    expect(fakeGo.measure.last.target).toEqual(HOME_TARGET);
    const progress = screen.getByRole("status", { name: "Measure progress" });
    expect(within(progress).getByText(HOME)).toBeVisible();
  });

  it("lists the folder's contents with its total, largest first", async () => {
    const user = await openOverview();
    await openHome(user);

    expect(screen.getByText("46.3")).toBeVisible();
    const rows = within(screen.getByRole("region", { name: "Contents" }))
      .getAllByRole("listitem")
      .map((row) => row.textContent);
    expect(rows).toEqual([
      "ProjectsReveal21.4 GB›",
      "MoviesReveal12.8 GB›",
      "DownloadsReveal7.6 GB›",
      "DocumentsReveal4.5 GB›",
      "notes.txtReveal12 KB",
    ]);
    expect(screen.queryByRole("button", { name: "Open notes.txt" })).not.toBeInTheDocument();
  });

  it("shows the trail from This Mac to the folder, current last", async () => {
    const user = await openOverview();
    await openHome(user);
    await openFolder(user, "Projects", `${HOME}/Projects`);

    expect(crumbs()).toEqual(["This Mac", "Home", "Projects"]);
    const current = within(screen.getByRole("navigation", { name: "Folders" })).getByRole("button", {
      name: "Projects",
    });
    expect(current).toHaveAttribute("aria-current", "page");
  });

  it("goes back up any number of levels without measuring again", async () => {
    const user = await openOverview();
    await openHome(user);
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
    await openHome(user);

    await user.click(screen.getByRole("button", { name: "Measure again" }));
    expect(fakeGo.measure.calls).toHaveLength(3);
    expect(fakeGo.measure.last.target).toEqual(HOME_TARGET);
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
    await openHome(user);
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
    expect(fakeGo.measure.last.target).toEqual(HOME_TARGET);
  });

  it("says an empty folder is empty", async () => {
    const user = await openOverview();
    await user.click(screen.getByRole("button", { name: "Open Applications" }));
    await act(async () => fakeGo.measure.last.resolve(folderAt({ kind: "folder", path: "/Applications" })));

    expect(screen.getByText("This folder is empty.")).toBeVisible();
  });
});

describe("Space rows that count part of a folder", () => {
  const OLD_TARGET = { kind: "folder", path: `${HOME}/Downloads`, olderThanDays: 90 } as const;

  it("opens Home without Library, with the total of its row", async () => {
    const user = await openOverview();

    await openHome(user);

    expect(screen.getByText("46.3")).toBeVisible();
    expect(screen.getByText("GB in this folder, without Library")).toBeVisible();
  });

  it("opens Old Downloads as what is old, with the total of its row", async () => {
    const user = await openOverview();

    await user.click(screen.getByRole("button", { name: "Open Old Downloads (90d+)" }));
    expect(fakeGo.measure.last.target).toEqual(OLD_TARGET);
    await act(async () => fakeGo.measure.last.resolve(oldDownloadsFolder));

    expect(screen.getByText("3.02")).toBeVisible();
    expect(screen.getByText("GB older than 90 days")).toBeVisible();
    expect(rowsOf("Contents")).toEqual([
      "Xcode_16.xipReveal2.1 GB",
      "InstallersReveal900 MB›",
      "invoice.pdfReveal20 MB",
    ]);
  });

  it("does not call Downloads empty when nothing in it is old", async () => {
    const user = await openOverview();

    await user.click(screen.getByRole("button", { name: "Open Old Downloads (90d+)" }));
    await act(async () => fakeGo.measure.last.resolve({ ...oldDownloadsFolder, items: [], totalBytes: 0 }));

    expect(screen.getByText("Nothing here is older than 90 days.")).toBeVisible();
    expect(screen.queryByText("This folder is empty.")).not.toBeInTheDocument();
  });

  it("keeps Old Downloads and the whole of Downloads as two results", async () => {
    const user = await openOverview();
    await user.click(screen.getByRole("button", { name: "Open Old Downloads (90d+)" }));
    await act(async () => fakeGo.measure.last.resolve(oldDownloadsFolder));
    await user.click(screen.getByRole("button", { name: "This Mac" }));
    await openHome(user);

    await user.click(screen.getByRole("button", { name: "Open Downloads" }));
    expect(fakeGo.measure.last.target).toEqual({ kind: "folder", path: `${HOME}/Downloads` });
    await act(async () => fakeGo.measure.last.resolve(downloadsFolder));
    expect(screen.getByText("GB in this folder")).toBeVisible();

    const measured = fakeGo.measure.calls.length;
    await user.click(screen.getByRole("button", { name: "This Mac" }));
    await user.click(screen.getByRole("button", { name: "Open Old Downloads (90d+)" }));
    expect(screen.getByText("GB older than 90 days")).toBeVisible();
    expect(fakeGo.measure.calls).toHaveLength(measured);
  });
});

function rowsOf(region: string) {
  return within(screen.getByRole("region", { name: region }))
    .getAllByRole("listitem")
    .map((row) => row.textContent);
}

describe("Space largest files", () => {
  it("lists the largest files anywhere in the folder, with the folder each lies in", async () => {
    const user = await openOverview();
    await openHome(user);

    expect(screen.getAllByRole("region")).toEqual([
      screen.getByRole("region", { name: "Contents" }),
      screen.getByRole("region", { name: "Largest files in Home" }),
    ]);
    expect(rowsOf("Largest files in Home")).toEqual([
      "Trip 2025.movMoviesReveal8.2 GB",
      `quote"and'apostrophe.zipProjectsReveal3.1 GB`,
      "Burrow.dmgProjects/burrow/releaseReveal1.2 GB",
    ]);
  });

  it("names the folder the largest files lie in", async () => {
    const user = await openOverview();
    await openHome(user);
    await openFolder(user, "Projects", `${HOME}/Projects`);

    expect(rowsOf("Largest files in Projects")).toEqual([
      `quote"and'apostrophe.zipReveal3.1 GB`,
      "Burrow.dmgburrow/releaseReveal1.2 GB",
    ]);
  });

  it("shows no largest files for the overview or a folder without any", async () => {
    const user = await openOverview();
    expect(screen.queryByRole("region", { name: /^Largest files/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open Applications" }));
    await act(async () => fakeGo.measure.last.resolve(folderAt({ kind: "folder", path: "/Applications" })));
    expect(screen.queryByRole("region", { name: /^Largest files/ })).not.toBeInTheDocument();
  });
});

describe("Space tags", () => {
  it("labels folders their tools make again Regenerable", async () => {
    const user = await openOverview();
    await openHome(user);
    await openFolder(user, "Projects", `${HOME}/Projects`);
    await openFolder(user, "burrow", `${HOME}/Projects/burrow`);

    expect(rowsOf("Contents")).toEqual([
      "node_modulesRegenerableReveal6.4 GB›",
      "distRegenerableReveal3.3 GB›",
      "releaseReveal1.2 GB›",
      "srcReveal1.2 GB›",
    ]);
  });

  it("sends an Insight Clean empties to the Clean tab", async () => {
    const user = await openOverview();
    // Homebrew Cache and System Logs, in that order.
    const [homebrew, ...others] = within(screen.getByRole("region", { name: "Insights" })).getAllByRole("button", {
      name: "Clean handles this",
    });
    expect(others).toHaveLength(1);

    await user.click(homebrew ?? document.body);

    expect(screen.getByRole("tab", { name: "Clean" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Clean" })).toBeVisible();
    expect(fakeGo.measure.calls).toHaveLength(1);
  });
});

describe("Space Reveal in Finder", () => {
  it("reveals any row by its id, outside Home too, without opening it", async () => {
    const user = await openOverview();

    await user.click(screen.getByRole("button", { name: "Reveal Applications in Finder" }));

    expect(fakeGo.reveal.last.id).toBe("id:/Applications");
    expect(fakeGo.measure.calls).toHaveLength(1);
  });

  it("reveals a largest file", async () => {
    const user = await openOverview();
    await openHome(user);

    await user.click(screen.getByRole("button", { name: "Reveal Trip 2025.mov in Finder" }));

    expect(fakeGo.reveal.last.id).toBe(`id:${HOME}/Movies/Trip 2025.mov`);
  });

  it("stays put when Go could not reveal the item", async () => {
    const user = await openOverview();
    await user.click(screen.getByRole("button", { name: "Reveal Home in Finder" }));

    await act(async () => fakeGo.reveal.last.reject());

    expect(screen.getByRole("region", { name: "Locations" })).toBeVisible();
  });
});

describe("Space with what a Measure could not read", () => {
  async function openLibrary() {
    const user = await openOverview();
    await openFolder(user, "User Library", `${HOME}/Library`);
    return user;
  }

  it("shows Protected access unavailable in place of a size", async () => {
    await openLibrary();

    expect(rowsOf("Contents")).toEqual([
      "Application SupportRevealPartly unreadable41.2 GB›",
      "DeveloperReveal25.1 GB›",
      "MailRevealProtected access unavailable",
    ]);
  });

  it("offers nothing to open for a folder it could not read, but still reveals it", async () => {
    const user = await openLibrary();

    expect(screen.queryByRole("button", { name: "Open Mail" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reveal Mail in Finder" }));
    expect(fakeGo.reveal.last.id).toBe(`id:${HOME}/Library/Mail`);
  });

  it("still opens a folder read in part", async () => {
    await openLibrary();

    expect(screen.getByRole("button", { name: "Open Application Support" })).toBeVisible();
  });

  it("marks Insights and locations in the overview", async () => {
    await openSpace();
    await act(async () => fakeGo.measure.last.resolve(unreadableOverview));

    expect(rowsOf("Locations")[0]).toBe("User LibraryRevealPartly unreadable73.1 GB›");
    expect(rowsOf("Insights").at(-1)).toBe("iOS BackupsInsightRevealProtected access unavailable");
  });

  it("opens Full Disk Access and says to measure again", async () => {
    const user = await openLibrary();

    await user.click(screen.getByRole("button", { name: "Open System Settings" }));
    act(() => fakeGo.privacy.last.resolve("full-disk-access"));

    expect(await screen.findByText("Turn on Burrow in Full Disk Access, then measure again.")).toBeVisible();
  });

  it("walks the user to Full Disk Access when only Privacy & Security opened", async () => {
    const user = await openLibrary();

    await user.click(screen.getByRole("button", { name: "Open System Settings" }));
    act(() => fakeGo.privacy.last.resolve("privacy-security"));

    expect(
      await screen.findByText("In Privacy & Security, scroll to Full Disk Access, turn on Burrow, then measure again."),
    ).toBeVisible();
  });

  it("gives no total for a folder it could read nothing in", async () => {
    const user = await openOverview();
    await user.click(screen.getByRole("button", { name: "Open User Library" }));
    const items = libraryFolder.items.filter((item) => item.readState === "unavailable");

    await act(async () => fakeGo.measure.last.resolve({ ...libraryFolder, items, totalBytes: 0 }));

    expect(screen.queryByText(/in this folder/)).not.toBeInTheDocument();
    expect(rowsOf("Contents")).toEqual(["MailRevealProtected access unavailable"]);
    expect(screen.getByRole("button", { name: "Open System Settings" })).toBeVisible();
  });

  it("asks for Full Disk Access only when an item could not be read at all", async () => {
    const user = await openOverview();
    expect(screen.queryByRole("region", { name: "Full Disk Access" })).not.toBeInTheDocument();

    await openFolder(user, "System Library", "/Library");

    expect(rowsOf("Contents")[0]).toBe("Application SupportRevealPartly unreadable4.1 GB›");
    expect(screen.queryByRole("region", { name: "Full Disk Access" })).not.toBeInTheDocument();
  });
});
