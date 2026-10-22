// PROTOTYPE mock of Burrow's Status Snapshot stream (1 Hz, 60 s history).
import { useEffect, useState } from "react";

export const HISTORY = 60;

export type Proc = { pid: number; name: string; cpu: number; memBytes: number };
export type StatusState = {
  cpu: number[]; // %
  gpu: number[];
  mem: number[]; // %
  netDown: number[]; // bytes/s
  netUp: number[];
  memUsedBytes: number;
  memTotalBytes: number;
  swapBytes: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
  battery: { percent: number; charging: boolean; watts: number; cycles: number; healthPct: number };
  fanRpm: number;
  tempC: number;
  load: number;
  cores: number;
  health: { score: number; label: string; note: string };
  uptime: string;
  chip: string;
  ramTotal: string;
  os: string;
  processes: Proc[];
};

const PROC_NAMES = [
  "WindowServer", "Google Chrome Helper", "Code Helper (Renderer)", "kernel_task", "Slack Helper",
  "Spotify", "mds_stores", "Figma Helper", "Finder", "Terminal", "Burrow", "coreaudiod",
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const walk = (prev: number, step: number, lo: number, hi: number) =>
  clamp(prev + (Math.random() - 0.5) * step, lo, hi);
const push = (arr: number[], v: number) => [...arr.slice(1), v];

function seed(base: number, step: number, lo: number, hi: number): number[] {
  const out: number[] = [];
  let v = base;
  for (let i = 0; i < HISTORY; i++) out.push((v = walk(v, step, lo, hi)));
  return out;
}

function initial(): StatusState {
  return {
    cpu: seed(18, 14, 2, 95),
    gpu: seed(9, 8, 0, 80),
    mem: seed(68, 3, 40, 92),
    netDown: seed(240e3, 300e3, 0, 4e6),
    netUp: seed(40e3, 60e3, 0, 1e6),
    memUsedBytes: 32.6e9,
    memTotalBytes: 48e9,
    swapBytes: 4.3e6,
    diskUsedBytes: 703e9,
    diskTotalBytes: 995e9,
    battery: { percent: 80, charging: true, watts: 60, cycles: 52, healthPct: 100 },
    fanRpm: 0,
    tempC: 47,
    load: 4.6,
    cores: 18,
    health: { score: 96, label: "Excellent", note: "All checks passed" },
    uptime: "up 13 hours · since Oct 21",
    chip: "M4 Pro",
    ramTotal: "48 GB",
    os: "macOS 26.1",
    processes: PROC_NAMES.map((name, i) => ({
      pid: 300 + i * 97,
      name,
      cpu: Math.max(0.1, 28 / (i + 1) + Math.random() * 3),
      memBytes: (2.4e9 / (i + 1)) * (0.6 + Math.random() * 0.8),
    })),
  };
}

function tick(s: StatusState): StatusState {
  const cpu = walk(s.cpu.at(-1)!, 14, 2, 95);
  const mem = walk(s.mem.at(-1)!, 2, 40, 92);
  return {
    ...s,
    cpu: push(s.cpu, cpu),
    gpu: push(s.gpu, walk(s.gpu.at(-1)!, 8, 0, 80)),
    mem: push(s.mem, mem),
    netDown: push(s.netDown, walk(s.netDown.at(-1)!, 300e3, 0, 4e6)),
    netUp: push(s.netUp, walk(s.netUp.at(-1)!, 60e3, 0, 1e6)),
    memUsedBytes: (mem / 100) * s.memTotalBytes,
    tempC: Math.round(walk(s.tempC, 2, 38, 78)),
    load: Number(walk(s.load, 0.6, 0.5, 14).toFixed(1)),
    processes: s.processes
      .map((p) => ({ ...p, cpu: clamp(walk(p.cpu, 3, 0.1, 99), 0.1, 99) }))
      .sort((a, b) => b.cpu - a.cpu),
  };
}

export function useStatus(): StatusState {
  const [state, setState] = useState(initial);
  useEffect(() => {
    const id = setInterval(() => setState(tick), 1000);
    return () => clearInterval(id);
  }, []);
  return state;
}
