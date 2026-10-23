import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CleanProgress, CleanReport, ScanProgress, ScanResult } from "../mygo";
import { CleanTab, type StartClean, type StartScan } from "./CleanTab";
import type { OpenFullDiskAccess } from "./FullDiskAccessNotice";

describe("Clean Scan", () => {
  it("starts at the Scan call-to-action and enters Strata scanning", async () => {
    const never = new Promise<never>(() => {});
    const startScan: StartScan = vi.fn(() => ({ result: never, cancel: vi.fn() }));
    const user = userEvent.setup();

    render(<CleanTab startScan={startScan} />);
    expect(screen.getByRole("heading", { name: "Let's see what can go." })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Start scan" }));

    expect(screen.getByRole("status", { name: "Scan progress" })).toBeVisible();
    expect(screen.getByText("0 B found so far")).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
  });

  it("shows mapped progress, recomputed bytes, current path, and indeterminate state", async () => {
    const scan = controlledScan();
    const user = userEvent.setup();
    render(<CleanTab startScan={scan.start} />);
    await user.click(screen.getByRole("button", { name: "Start scan" }));

    act(() => {
      scan.emit({
        groupId: "app-caches",
        groupBytes: 400_000,
        foundBytes: 1_500_000,
        currentPath: "/Users/test/Library/Caches/Burrow",
        fraction: 0.25,
      });
    });
    expect(screen.getByText("1.5 MB found so far")).toBeVisible();
    expect(screen.getByText("/Users/test/Library/Caches/Burrow")).toBeVisible();
    expect(screen.getByRole("progressbar", { name: "App Caches scan progress" })).toHaveAttribute("value", "0.25");

    act(() => {
      scan.emit({
        groupId: "browsers",
        groupBytes: 0,
        foundBytes: 1_500_000,
        currentPath: "/Users/test/Library/Caches/Browser",
        fraction: null,
      });
    });
    expect(screen.getByText("400 KB")).toBeVisible();
    expect(screen.getByRole("progressbar", { name: "Browsers scan progress" })).not.toHaveAttribute("value");
  });

  it("cancels the channel and ignores late progress and results", async () => {
    const scan = controlledScan();
    const user = userEvent.setup();
    render(<CleanTab startScan={scan.start} />);
    await user.click(screen.getByRole("button", { name: "Start scan" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(scan.cancel).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Start scan" })).toBeVisible();

    await act(async () => {
      scan.emit({
        groupId: "device-firmware",
        groupBytes: 99_000_000_000,
        foundBytes: 99_000_000_000,
        currentPath: "/late.ipsw",
        fraction: 1,
      });
      scan.resolve({
        groups: [
          {
            id: "device-firmware",
            removalMethod: "move-to-trash",
            defaultSelected: false,
            items: [{ id: "late", path: "/late.ipsw", bytes: 99_000_000_000 }],
          },
        ],
        unreadable: [],
      });
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "Start scan" })).toBeVisible();
    expect(screen.queryByText("99 GB found")).not.toBeInTheDocument();
  });
});

describe("Clean Review", () => {
  it("opens with the default junk groups selected and their total", async () => {
    await review(REVIEW_RESULT);

    expect(screen.getByText(wholeText("1.65 GB selected"))).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "App Caches" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "App Leftovers" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Developer Tools" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Device Firmware" })).not.toBeChecked();
    expect(screen.getByText("Temporary files apps rebuild on next launch.")).toBeVisible();
    expect(screen.getByText("Downloaded iPhone and iPad firmware files.")).toBeVisible();
    expect(screen.queryByText("Device backups & firmware")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clean 3 items →" })).toBeEnabled();
  });

  it("selects and clears whole junk groups", async () => {
    const { user } = await review(REVIEW_RESULT);

    await user.click(screen.getByRole("checkbox", { name: "Developer Tools" }));
    expect(screen.getByRole("checkbox", { name: "Developer Tools" })).toBeChecked();
    expect(screen.getByText(wholeText("4.65 GB selected"))).toBeVisible();
    expect(screen.getByRole("button", { name: "Clean 4 items →" })).toBeVisible();

    await user.click(screen.getByRole("checkbox", { name: "App Caches" }));
    expect(screen.getByRole("checkbox", { name: "App Caches" })).not.toBeChecked();
    expect(screen.getByText(wholeText("3.25 GB selected"))).toBeVisible();
    expect(screen.getByRole("button", { name: "Clean 2 items →" })).toBeVisible();
  });

  it("labels the junk groups that move to Trash", async () => {
    await review(REVIEW_RESULT);
    const rows = screen.getAllByRole("listitem");

    const labelled = rows.filter((row) => row.textContent?.includes("moves to Trash"));
    expect(labelled.map((row) => row.querySelector("button[aria-expanded]")?.getAttribute("aria-label"))).toEqual([
      "App Leftovers items",
      "Device Firmware items",
    ]);
  });

  it("marks Scan done and Review current, and scans again from the footer", async () => {
    const { user, scan } = await review(REVIEW_RESULT);
    const steps = screen.getByRole("list", { name: "Clean progress" });

    expect(within(steps).getByText("Review").closest("li")).toHaveAttribute("aria-current", "step");
    expect(within(steps).getByText("Scan").closest("li")).toHaveTextContent("✓Scan");

    await user.click(screen.getByRole("button", { name: "← Scan again" }));
    expect(screen.getByRole("status", { name: "Scan progress" })).toBeVisible();
    expect(scan.starts).toBe(2);
  });

  it("splits the color bar by selected junk group", async () => {
    const { user } = await review(REVIEW_RESULT);

    // 1.4 GB and 250 MB of 1.65 GB, in percent of the bar.
    expect(barSegments()).toEqual([
      ["App Caches, 1.4 GB", "84.8"],
      ["App Leftovers, 250 MB", "15.2"],
    ]);

    await user.click(screen.getByRole("checkbox", { name: "Developer Tools" }));
    // 1.4 GB, 3 GB and 250 MB of 4.65 GB.
    expect(barSegments()).toEqual([
      ["App Caches, 1.4 GB", "30.1"],
      ["Developer Tools, 3 GB", "64.5"],
      ["App Leftovers, 250 MB", "5.4"],
    ]);

    await user.click(screen.getByRole("checkbox", { name: "App Caches" }));
    await user.click(screen.getByRole("checkbox", { name: "App Leftovers" }));
    await user.click(screen.getByRole("checkbox", { name: "Developer Tools" }));
    expect(barSegments()).toEqual([]);
    expect(screen.getByText(wholeText("0 B selected"))).toBeVisible();
    expect(screen.getByRole("button", { name: "Clean 0 items →" })).toBeDisabled();
  });

  it("keeps single junk items, leaving their group partly selected", async () => {
    const { user } = await review(REVIEW_RESULT);
    const group = screen.getByRole("checkbox", { name: "App Caches" });

    await user.click(screen.getByRole("button", { name: "App Caches items" }));
    const slack = screen.getByRole("checkbox", { name: "/Users/test/Library/Caches/com.tinyspeck.slackmacgap" });
    expect(slack).toBeChecked();
    expect(screen.getByText("400 MB")).toBeVisible();

    await user.click(slack);
    expect(slack).not.toBeChecked();
    expect(group).toHaveAttribute("aria-checked", "mixed");
    expect(screen.getByText("1/2")).toBeVisible();
    expect(screen.getByText(wholeText("1.25 GB selected"))).toBeVisible();

    await user.click(group);
    expect(group).toBeChecked();
    expect(slack).toBeChecked();
    expect(screen.getByText("2/2")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "App Caches items" }));
    expect(slack).not.toBeInTheDocument();
  });
});

describe("Clean and Done", () => {
  it("cleans the selection as one Strata layer per selected junk group", async () => {
    const { user, clean } = await review(REVIEW_RESULT);

    await user.click(screen.getByRole("button", { name: "Clean 3 items →" }));

    expect(clean.ids).toEqual(["spotify", "slack", "notion"]);
    const strata = screen.getByRole("status", { name: "Cleaning" });
    expect(layerNames(strata)).toEqual(["App Caches", "App Leftovers"]);
    expect(within(strata).getByText(wholeText("0 B freed so far"))).toBeVisible();
    const steps = screen.getByRole("list", { name: "Clean progress" });
    expect(within(steps).getByText("Clean").closest("li")).toHaveAttribute("aria-current", "step");

    act(() => clean.emit({ groupId: "app-caches", selected: 2, cleaned: 1, skipped: 0, freedBytes: 1_000_000_000 }));
    expect(within(strata).getByText(wholeText("1 GB freed so far"))).toBeVisible();
    expect(layer(strata, "App Caches")).toHaveTextContent("1 / 2");
    expect(screen.getByRole("progressbar", { name: "App Caches clean progress" })).toHaveAttribute("value", "0.5");
    expect(layer(strata, "App Leftovers")).toHaveTextContent("0 / 1");

    act(() => clean.emit({ groupId: "app-caches", selected: 2, cleaned: 1, skipped: 1, freedBytes: 1_000_000_000 }));
    expect(layer(strata, "App Caches")).toHaveTextContent("1 skipped");
    expect(layer(strata, "App Caches")).toHaveTextContent("1 / 2");
  });

  it("ends on Done with what was removed and skipped, then Finish starts over", async () => {
    const { user, clean } = await review(REVIEW_RESULT);
    await user.click(screen.getByRole("button", { name: "Clean 3 items →" }));

    await act(async () => {
      clean.emit({ groupId: "app-caches", selected: 2, cleaned: 1, skipped: 1, freedBytes: 1_000_000_000 });
      clean.emit({ groupId: "app-leftovers", selected: 1, cleaned: 1, skipped: 0, freedBytes: 1_250_000_000 });
      clean.resolve({
        items: [
          {
            id: "spotify",
            path: "/Users/test/Library/Caches/com.spotify.client",
            bytes: 1_000_000_000,
            method: "delete",
            skipReason: null,
          },
          {
            id: "slack",
            path: "/Users/test/Library/Caches/com.tinyspeck.slackmacgap",
            bytes: 400_000_000,
            method: "delete",
            skipReason: "in_use",
          },
          {
            id: "notion",
            path: "/Users/test/Library/Application Support/Notion",
            bytes: 250_000_000,
            method: "delete",
            skipReason: null,
          },
        ],
        freedBytes: 1_250_000_000,
      });
      await Promise.resolve();
    });

    const steps = screen.getByRole("list", { name: "Clean progress" });
    expect(within(steps).getByText("Done").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText(wholeText("1.25 GB freed"))).toBeVisible();
    expect(screen.getByText("2 removed · 1 skipped")).toBeVisible();
    expect(screen.getByText("/Users/test/Library/Caches/com.tinyspeck.slackmacgap (in use)")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(screen.getByRole("heading", { name: "Let's see what can go." })).toBeVisible();
  });

  it("names every skip reason", async () => {
    const { user, clean } = await review(REVIEW_RESULT);
    await user.click(screen.getByRole("button", { name: "Clean 3 items →" }));

    await act(async () => {
      clean.resolve({
        items: [
          { id: "a", path: "/Users/test/a", bytes: 1, method: "delete", skipReason: "in_use" },
          { id: "b", path: "/Users/test/b", bytes: 1, method: "delete", skipReason: "permission_denied" },
          { id: "c", path: "/Users/test/c", bytes: 1, method: "delete", skipReason: "protected" },
          { id: "d", path: "/Users/test/d", bytes: 1, method: "delete", skipReason: "already_gone" },
        ],
        freedBytes: 0,
      });
      await Promise.resolve();
    });

    expect(screen.getByText("0 removed · 4 skipped")).toBeVisible();
    for (const line of [
      "/Users/test/a (in use)",
      "/Users/test/b (permission denied)",
      "/Users/test/c (protected)",
      "/Users/test/d (already gone)",
    ]) {
      expect(screen.getByText(line)).toBeVisible();
    }
  });

  it("returns to the start with a message when Clean fails", async () => {
    const { user, clean } = await review(REVIEW_RESULT);
    await user.click(screen.getByRole("button", { name: "Clean 3 items →" }));

    await act(async () => {
      clean.reject(new Error("busy"));
      await Promise.resolve();
    });

    expect(screen.getByText("Clean could not finish. Scan again to see what is left.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Start scan" })).toBeVisible();
  });
});

const GROUP_NAMES = ["App Caches", "Developer Tools", "App Leftovers", "Device Firmware"];

/** The Strata layers' junk group names, top to bottom. */
function layerNames(strata: HTMLElement) {
  return within(strata)
    .getAllByRole("listitem")
    .map((item) => GROUP_NAMES.find((name) => within(item).queryByText(name, { exact: true })));
}

/** The Strata layer showing the junk group name. */
function layer(strata: HTMLElement, name: string) {
  const found = within(strata)
    .getAllByRole("listitem")
    .find((item) => within(item).queryByText(name, { exact: true }));
  if (!found) throw new Error(`no Strata layer ${name}`);
  return found;
}

const REVIEW_RESULT: ScanResult = {
  groups: [
    {
      id: "app-caches",
      removalMethod: "delete",
      defaultSelected: true,
      items: [
        { id: "spotify", path: "/Users/test/Library/Caches/com.spotify.client", bytes: 1_000_000_000 },
        { id: "slack", path: "/Users/test/Library/Caches/com.tinyspeck.slackmacgap", bytes: 400_000_000 },
      ],
    },
    {
      id: "developer-tools",
      removalMethod: "delete",
      defaultSelected: false,
      items: [{ id: "derived", path: "/Users/test/Library/Developer/Xcode/DerivedData", bytes: 3_000_000_000 }],
    },
    {
      id: "app-leftovers",
      removalMethod: "move-to-trash",
      defaultSelected: true,
      items: [{ id: "notion", path: "/Users/test/Library/Application Support/Notion", bytes: 250_000_000 }],
    },
    {
      id: "device-firmware",
      removalMethod: "move-to-trash",
      defaultSelected: false,
      items: [{ id: "firmware", path: "/Users/test/Library/iTunes/iPhone15,2_18.1.ipsw", bytes: 7_000_000_000 }],
    },
  ],
  unreadable: [],
};

/** The color bar's segments as [label, width in percent], left to right. */
function barSegments() {
  const bar = screen.getByRole("img", { name: "Selection by junk group" });
  return [...bar.querySelectorAll("rect")]
    .map((segment) => [segment.textContent, segment.getAttribute("width")])
    .filter(([, width]) => width !== "0");
}

describe("Clean Review with protected access unavailable", () => {
  const UNREADABLE: ScanResult = {
    groups: [
      {
        id: "app-caches",
        removalMethod: "delete",
        defaultSelected: true,
        items: [{ id: "cache", path: "/Users/test/Library/Caches/Burrow", bytes: 1_000_000 }],
      },
    ],
    unreadable: ["app-caches", "trash"],
  };

  it("marks unreadable junk groups and still offers the readable items", async () => {
    await review(UNREADABLE);

    const groups = screen.getByRole("list", { name: "Junk groups" });
    const [caches, trash] = within(groups).getAllByRole("listitem") as [HTMLElement, HTMLElement];
    expect(within(caches).getByText("Protected access unavailable")).toBeVisible();
    expect(within(trash).getByText("Trash")).toBeVisible();
    expect(within(trash).getByText("Protected access unavailable")).toBeVisible();
    expect(within(trash).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "App Caches" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Clean 1 item →" })).toBeEnabled();
  });

  it("says nothing about Full Disk Access when the Scan read everything", async () => {
    await review({ ...UNREADABLE, unreadable: [] });

    expect(screen.queryByText("Protected access unavailable")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open System Settings" })).not.toBeInTheDocument();
  });

  it("opens Full Disk Access in System Settings", async () => {
    const openFullDiskAccess = vi.fn(async () => "full-disk-access" as const);
    const { user } = await review(UNREADABLE, openFullDiskAccess);

    await user.click(screen.getByRole("button", { name: "Open System Settings" }));

    expect(openFullDiskAccess).toHaveBeenCalledOnce();
    expect(await screen.findByText("Turn on Burrow in Full Disk Access, then scan again.")).toBeVisible();
  });

  it("walks the user to Full Disk Access when only Privacy & Security opened", async () => {
    const { user } = await review(UNREADABLE, async () => "privacy-security");

    await user.click(screen.getByRole("button", { name: "Open System Settings" }));

    expect(
      await screen.findByText("In Privacy & Security, scroll to Full Disk Access, turn on Burrow, then scan again."),
    ).toBeVisible();
  });

  it("gives the manual path when System Settings did not open", async () => {
    const { user } = await review(UNREADABLE, async () => {
      throw new Error("no application can open it");
    });

    await user.click(screen.getByRole("button", { name: "Open System Settings" }));

    expect(
      await screen.findByText(
        "System Settings did not open. Open it from the Apple menu, go to Privacy & Security › Full Disk Access, and turn on Burrow.",
      ),
    ).toBeVisible();
  });
});

/** Matches the one element whose whole text is text, even split across spans. */
function wholeText(text: string) {
  return (_: string, element: Element | null) =>
    element?.textContent === text && [...element.children].every((child) => child.textContent !== text);
}

/** Scans to completion and lands on Review with result. */
async function review(result: ScanResult, openFullDiskAccess?: OpenFullDiskAccess) {
  const scan = controlledScan();
  const clean = controlledClean();
  const user = userEvent.setup();
  render(<CleanTab startScan={scan.start} startClean={clean.start} openFullDiskAccess={openFullDiskAccess} />);
  await user.click(screen.getByRole("button", { name: "Start scan" }));
  await act(async () => {
    scan.resolve(result);
    await Promise.resolve();
  });
  return { scan, clean, user };
}

/** A Clean the test drives, settled by resolve or reject. */
function controlledClean() {
  let listener: (progress: CleanProgress) => void = () => {};
  let settle: { resolve: (report: CleanReport) => void; reject: (error: Error) => void } = {
    resolve: () => {},
    reject: () => {},
  };
  let ids: readonly string[] = [];
  const start: StartClean = (selection, onProgress) => {
    ids = selection;
    listener = onProgress;
    return new Promise<CleanReport>((resolve, reject) => {
      settle = { resolve, reject };
    });
  };
  return {
    start,
    emit: (progress: CleanProgress) => listener(progress),
    resolve: (report: CleanReport) => settle.resolve(report),
    reject: (error: Error) => settle.reject(error),
    get ids() {
      return ids;
    },
  };
}

/** A Scan the test drives: each start gets its own result, settled by resolve. */
function controlledScan() {
  let listener: (progress: ScanProgress) => void = () => {};
  let resolve: (result: ScanResult) => void = () => {};
  const cancel = vi.fn();
  let starts = 0;
  const start: StartScan = (onProgress) => {
    starts++;
    listener = onProgress;
    const result = new Promise<ScanResult>((done) => {
      resolve = done;
    });
    return { result, cancel };
  };
  return {
    start,
    emit: (progress: ScanProgress) => listener(progress),
    resolve: (result: ScanResult) => resolve(result),
    cancel,
    get starts() {
      return starts;
    },
  };
}
