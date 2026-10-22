import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "../mygo";
import { events } from "../testing/mygo.fake";
import { snapshot } from "../testing/snapshots";
import { StatusTab } from "./StatusTab";

function show(s: Snapshot) {
  act(() => events.status.emit(s));
}

function card(name: string) {
  return within(screen.getByRole("region", { name }));
}

// Uptime counts back from the clock to the day the Mac started.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 23, 12, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Status tab", () => {
  it("lays out the bento grid with Health and CPU first", () => {
    render(<StatusTab />);
    expect(screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"))).toEqual(["Health", "CPU"]);
  });

  it("shows dashes until the first snapshot arrives", () => {
    render(<StatusTab />);
    expect(card("Health").getByText("-", { selector: "p > span:first-child" })).toBeVisible();
    expect(card("CPU").getByText("-", { selector: "p > span:first-child" })).toBeVisible();
  });
});

describe("Health card", () => {
  it("shows the Health score, its level and the hardware", () => {
    render(<StatusTab />);
    show(snapshot());
    const health = card("Health");
    expect(health.getByText("78")).toBeVisible();
    expect(health.getByText("Good")).toBeVisible();
    expect(health.getByText("Apple M2 · 16.0 GB")).toBeVisible();
    expect(health.getByText("macOS 15.7.9")).toBeVisible();
    expect(health.getByText("up 21 days · since Oct 2")).toBeVisible();
  });

  it("explains the score with every reason, in the catalog's words", () => {
    render(<StatusTab />);
    show(
      snapshot({
        healthScore: { score: 41, level: "needs-attention", reasons: ["disk-almost-full", "restart-recommended"] },
      }),
    );
    const health = card("Health");
    expect(health.getByText("Needs Attention")).toBeVisible();
    expect(health.getByText("Disk almost full · Restart recommended")).toBeVisible();
  });

  it("says all checks passed when nothing lowered the score", () => {
    render(<StatusTab />);
    show(snapshot({ healthScore: { score: 96, level: "excellent", reasons: [] } }));
    expect(card("Health").getByText("All checks passed")).toBeVisible();
  });

  it.each([
    [59, "up 59 seconds · since Oct 23"],
    [60, "up 1 minute · since Oct 23"],
    [7_200, "up 2 hours · since Oct 23"],
    [86_400, "up 1 day · since Oct 22"],
  ])("shows %d seconds of uptime as %s", (uptimeSeconds, text) => {
    render(<StatusTab />);
    show(snapshot({ uptimeSeconds }));
    expect(card("Health").getByText(text)).toBeVisible();
  });

  it("shows a dash for each field Mole did not report", () => {
    render(<StatusTab />);
    show(
      snapshot({
        healthScore: { score: null, level: null, reasons: [] },
        hardware: { cpuModel: null, ram: null, osVersion: null },
        uptimeSeconds: null,
      }),
    );
    const health = card("Health");
    expect(health.getByText("-", { selector: "p > span:first-child" })).toBeVisible();
    expect(health.getByText("- · -")).toBeVisible();
    expect(health.queryByText("All checks passed")).not.toBeInTheDocument();
    expect(health.queryByText(/^up /)).not.toBeInTheDocument();
  });
});

describe("CPU card", () => {
  it("shows usage, load averages and the core split", () => {
    render(<StatusTab />);
    show(snapshot());
    const cpu = card("CPU");
    expect(cpu.getByText("30")).toBeVisible();
    expect(cpu.getByText("%")).toBeVisible();
    expect(cpu.getByText("Load 3.76 · 3.16 · 3.75")).toBeVisible();
    expect(cpu.getByText("4P + 4E cores")).toBeVisible();
  });

  it("draws one bar per sample in the series", () => {
    render(<StatusTab />);
    show(snapshot({ series: { cpu: [10, null, 30, 40] } }));
    expect(screen.getByRole("region", { name: "CPU" }).querySelectorAll("rect")).toHaveLength(3);
  });

  it("follows the latest snapshot", () => {
    render(<StatusTab />);
    show(snapshot());
    show(snapshot({ cpu: { usage: 87.6 } }));
    expect(card("CPU").getByText("88")).toBeVisible();
  });

  it("shows a dash for each field Mole did not report", () => {
    render(<StatusTab />);
    show(snapshot({ cpu: { usage: null, load1: null, load5: null, load15: null, pCores: null, eCores: null } }));
    const cpu = card("CPU");
    expect(cpu.getByText("-", { selector: "p > span:first-child" })).toBeVisible();
    expect(cpu.getByText("Load - · - · -")).toBeVisible();
    expect(cpu.queryByText(/cores$/)).not.toBeInTheDocument();
  });
});
