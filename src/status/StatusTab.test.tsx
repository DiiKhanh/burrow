import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "../mygo";
import { fakeGo } from "../testing/mygo.fake";
import { snapshot } from "../testing/snapshots";
import { StatusTab } from "./StatusTab";

function show(s: Snapshot) {
  act(() => fakeGo.status.emit(s));
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
    expect(screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"))).toEqual([
      "Health",
      "CPU",
      "Memory",
      "Network",
      "Battery",
      "Disk",
      "Disk I/O",
      "Thermal",
    ]);
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

describe("remaining Status cards", () => {
  it("shows memory, network, disk I/O and startup-disk readings", () => {
    render(<StatusTab />);
    show(snapshot());

    expect(card("Memory").getByText("83")).toBeVisible();
    expect(card("Memory").getByText("Normal")).toBeVisible();
    expect(card("Memory").getByText("14.2 GB / 17.2 GB")).toBeVisible();
    expect(card("Memory").getByText("15.9 GB swap")).toBeVisible();

    expect(card("Network").getByText("450")).toBeVisible();
    expect(card("Network").getByText("KB/s")).toBeVisible();
    expect(card("Network").getByText("en0")).toBeVisible();
    expect(card("Network").getByText("Upload 57 KB/s")).toBeVisible();

    expect(card("Disk").getByText("14")).toBeVisible();
    expect(card("Disk").getByText("GB free")).toBeVisible();
    expect(card("Disk").getByText("Used 231 GB")).toBeVisible();
    expect(card("Disk").getByText("Purgeable 191 MB")).toBeVisible();
    expect(card("Disk").getByText("Trash 42 MB")).toBeVisible();

    expect(card("Disk I/O").getByText("2.5")).toBeVisible();
    expect(card("Disk I/O").getByText("MB/s read")).toBeVisible();
    expect(card("Disk I/O").getByText("Write 400 KB/s")).toBeVisible();
  });

  it("shows Battery with charging details and Bluetooth device batteries", () => {
    render(<StatusTab />);
    show(snapshot());
    const battery = card("Battery");
    expect(battery.getByText("100")).toBeVisible();
    expect(battery.getByText("% Charged")).toBeVisible();
    expect(battery.getByText("83% capacity")).toBeVisible();
    expect(battery.getByText("0:00 remaining · 486 cycles")).toBeVisible();
    expect(battery.getByText("Magic Mouse 64%")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Power" })).not.toBeInTheDocument();
  });

  it("uses Power instead of Battery on a Mac without a battery", () => {
    render(<StatusTab />);
    show(snapshot({ battery: null, power: { systemWatts: 9.5, adapterWatts: 30 }, bluetooth: [] }));
    expect(screen.queryByRole("region", { name: "Battery" })).not.toBeInTheDocument();
    const power = card("Power");
    expect(power.getByText("9.5")).toBeVisible();
    expect(power.getByText("W system")).toBeVisible();
    expect(power.getByText("30 W adapter")).toBeVisible();
  });

  it("shows fan speed only when the Mac has a fan", () => {
    render(<StatusTab />);
    show(snapshot());
    expect(card("Thermal").queryByText(/RPM/)).not.toBeInTheDocument();

    show(snapshot({ thermal: { hasFan: true, fanRPM: 1_800 } }));
    expect(card("Thermal").getByText("1,800 RPM")).toBeVisible();
    expect(card("Thermal").getByText("53")).toBeVisible();
    expect(card("Thermal").getByText("°C")).toBeVisible();
    expect(card("Thermal").getByText("Power 12.9 W")).toBeVisible();
  });

  it("shows unavailable for every missing field without breaking a card", () => {
    render(<StatusTab />);
    show(
      snapshot({
        memory: { used: null, total: null, usedPercent: null, swapUsed: null, pressure: null },
        network: { downloadBytesPerSecond: null, uploadBytesPerSecond: null, interface: null },
        battery: { percent: null, state: null, timeRemaining: null, cycles: null, maximumCapacity: null },
        power: { systemWatts: null, adapterWatts: null },
        disk: { free: null, used: null, total: null, purgeable: null, trash: null },
        diskIO: { readBytesPerSecond: null, writeBytesPerSecond: null },
        thermal: { cpuCelsius: null, systemWatts: null, hasFan: null, fanRPM: null },
        bluetooth: [],
        series: { memory: [], networkDownload: [], diskRead: [], thermalCPU: [] },
      }),
    );

    for (const name of ["Memory", "Network", "Battery", "Disk", "Disk I/O", "Thermal"]) {
      expect(card(name).getAllByText("-").length).toBeGreaterThan(0);
    }
    expect(card("Disk").getByText("Trash Unavailable")).toBeVisible();
    expect(card("Thermal").getByText("Fan -")).toBeVisible();
  });
});

describe("Process table", () => {
  function rows() {
    const table = screen.getByRole("table", { name: "Top processes" });
    return within(table)
      .getAllByRole("row")
      .map((row) =>
        [...within(row).queryAllByRole("columnheader"), ...within(row).queryAllByRole("cell")].map(
          (cell) => cell.textContent,
        ),
      );
  }

  it("lists Mole's top 5 processes by CPU with memory and PID", () => {
    render(<StatusTab />);
    show(snapshot());
    expect(rows()).toEqual([
      ["Process", "CPU▾", "Memory", "PID"],
      ["Safari", "140%", "1.24 GB", "512"],
      ["WindowServer", "12.5%", "210 MB", "88"],
      ["Code Helper (Renderer)", "8.1%", "640 MB", "4210"],
      ["mds_stores", "3%", "90.5 MB", "412"],
      ["Dock", "0.4%", "52 MB", "97"],
    ]);
  });

  it("is only sorted by CPU and offers nothing to click", () => {
    render(<StatusTab />);
    show(snapshot());
    const table = within(screen.getByRole("table", { name: "Top processes" }));
    expect(table.getByRole("columnheader", { name: "CPU" })).toHaveAttribute("aria-sort", "descending");
    expect(table.queryAllByRole("button")).toEqual([]);
  });

  it("shows a dash for a name or memory Mole did not report", () => {
    render(<StatusTab />);
    show(snapshot({ processes: [{ pid: 7, name: null, cpu: 3, memoryBytes: null }] }));
    expect(rows()[1]).toEqual(["-", "3%", "-", "7"]);
  });

  it("keeps its header until the first snapshot arrives", () => {
    render(<StatusTab />);
    expect(rows()).toEqual([["Process", "CPU▾", "Memory", "PID"]]);
  });
});

describe("Status recovery", () => {
  it("says Status is retrying and keeps the last values while the collector restarts", () => {
    render(<StatusTab />);
    show(snapshot());
    show(snapshot({ collector: "retrying" }));
    expect(screen.getByRole("status")).toHaveTextContent("Status paused, retrying…");
    expect(card("CPU").getByText("30")).toBeVisible();
    expect(screen.getByRole("table", { name: "Top processes" })).toHaveTextContent("Safari");
  });

  it("goes back to live values once the collector sends again", () => {
    render(<StatusTab />);
    show(snapshot({ collector: "retrying" }));
    show(snapshot({ cpu: { usage: 55 } }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(card("CPU").getByText("55")).toBeVisible();
  });
});
