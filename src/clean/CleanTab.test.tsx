import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ScanProgress, ScanResult } from "../mygo";
import { CleanTab, type StartScan } from "./CleanTab";

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
      });
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "Start scan" })).toBeVisible();
    expect(screen.queryByText("99 GB found")).not.toBeInTheDocument();
  });

  it("finishes with translated junk groups and their recomputed sizes", async () => {
    const scan = controlledScan();
    const user = userEvent.setup();
    render(<CleanTab startScan={scan.start} />);
    await user.click(screen.getByRole("button", { name: "Start scan" }));

    await act(async () => {
      scan.resolve({
        groups: [
          {
            id: "app-caches",
            removalMethod: "delete",
            defaultSelected: true,
            items: [{ id: "cache", path: "/Users/test/Library/Caches/Burrow", bytes: 1_200_000_000 }],
          },
          {
            id: "device-firmware",
            removalMethod: "move-to-trash",
            defaultSelected: false,
            items: [{ id: "firmware", path: "/Users/test/Library/iTunes/Burrow.ipsw", bytes: 7_000_000_000 }],
          },
        ],
      });
      await Promise.resolve();
    });

    expect(screen.getByText("8.2 GB found")).toBeVisible();
    expect(screen.getByText("Temporary files apps rebuild on next launch.")).toBeVisible();
    expect(screen.getByText("Downloaded iPhone and iPad firmware files.")).toBeVisible();
    expect(screen.getByText("1.2 GB")).toBeVisible();
    expect(screen.getByText("7 GB")).toBeVisible();
    expect(screen.queryByText("Device backups & firmware")).not.toBeInTheDocument();
  });
});

function controlledScan() {
  let listener: (progress: ScanProgress) => void = () => {};
  let resolve: (result: ScanResult) => void = () => {};
  const result = new Promise<ScanResult>((done) => {
    resolve = done;
  });
  const cancel = vi.fn();
  const start: StartScan = (onProgress) => {
    listener = onProgress;
    return { result, cancel };
  };
  return { start, emit: (progress: ScanProgress) => listener(progress), resolve, cancel };
}
