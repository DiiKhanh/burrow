// PROTOTYPE: three candidate scan screens for variant C, switchable via ?scan=1|2|3.
import { useState } from "react";
import type { CleanFlow } from "../shared/useCleanFlow";
import { BurrowRings } from "../shared/Burrow";
import { SCAN_SECTIONS, TOTAL_BYTES } from "../mock/clean";
import { formatBytes, splitBytes } from "../mock/format";

// Share of the total junk each section contributes (mock), in SCAN_SECTIONS order.
const SECTION_SHARE = [0, 0.04, 0.13, 0.05, 0.02, 0.39, 0.03, 0.02, 0.28, 0.04];

function scanTally(pct: number) {
  const pos = pct * SCAN_SECTIONS.length;
  const active = Math.min(SCAN_SECTIONS.length - 1, Math.floor(pos));
  const perSection = SECTION_SHARE.map((share, i) =>
    i < active ? share * TOTAL_BYTES : i === active ? share * TOTAL_BYTES * (pos - active) : 0,
  );
  return { active, perSection, found: perSection.reduce((s, b) => s + b, 0) };
}

export const SCAN_VISUALS = [
  { key: "1", name: "Rings" },
  { key: "2", name: "Ledger" },
  { key: "3", name: "Strata" },
] as const;
type ScanKey = (typeof SCAN_VISUALS)[number]["key"];

export function useScanVisual() {
  const initial = new URLSearchParams(location.search).get("scan");
  const [key, setKey] = useState<ScanKey>(SCAN_VISUALS.some((v) => v.key === initial) ? (initial as ScanKey) : "1");
  const choose = (k: ScanKey) => {
    const params = new URLSearchParams(location.search);
    params.set("scan", k);
    history.replaceState(null, "", `?${params}`);
    setKey(k);
  };
  return [key, choose] as const;
}

export function ScanVisualPicker({ current, onChange }: { current: ScanKey; onChange: (k: ScanKey) => void }) {
  if (import.meta.env.PROD) return null;
  return (
    <div className="fixed bottom-14 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#ff2d78] px-2 py-1 font-mono text-xs text-white shadow-2xl">
      <span className="px-1 opacity-80">scan visual</span>
      {SCAN_VISUALS.map((v) => (
        <button key={v.key} onClick={() => onChange(v.key)} className={`rounded-full px-2 py-0.5 ${current === v.key ? "bg-white text-[#ff2d78]" : "hover:bg-white/20"}`}>
          {v.key} {v.name}
        </button>
      ))}
    </div>
  );
}

export function ScanVisual({ which, flow }: { which: ScanKey; flow: CleanFlow }) {
  const tally = scanTally(flow.scanPct);
  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center gap-6">
      {which === "1" && <Rings flow={flow} found={tally.found} />}
      {which === "2" && <Ledger flow={flow} tally={tally} />}
      {which === "3" && <Strata flow={flow} tally={tally} />}
      <button onClick={flow.cancelScan} className="text-sm text-size hover:underline">Cancel</button>
    </div>
  );
}

function FoundCounter({ bytes, className = "" }: { bytes: number; className?: string }) {
  const [v, u] = splitBytes(bytes);
  return (
    <p className={`tabular text-4xl font-bold ${className}`}>
      {v} <span className="text-xl text-ink-muted">{u} found so far</span>
    </p>
  );
}

/** 1: the rings breathe, a progress arc runs around them, the percentage sits in the middle. */
function Rings({ flow, found }: { flow: CleanFlow; found: number }) {
  return (
    <>
      <div className="relative">
        <BurrowRings tone="clean" active progress={flow.scanPct} size={200} />
        <span className="tabular absolute inset-0 grid place-items-center font-mono text-2xl font-semibold">
          {Math.round(flow.scanPct * 100)}%
        </span>
      </div>
      <FoundCounter bytes={found} />
      <p className="max-w-md truncate font-mono text-xs text-ink-faint">
        {flow.scanSection} · {flow.scanPath}
      </p>
    </>
  );
}

/** 2: a live ledger. Every section is a row that ticks off and shows what it found as it goes. */
function Ledger({ flow, tally }: { flow: CleanFlow; tally: ReturnType<typeof scanTally> }) {
  return (
    <div className="flex w-full flex-col gap-4">
      <FoundCounter bytes={tally.found} />
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-card border border-line bg-surface p-4">
        {SCAN_SECTIONS.map((sec, i) => {
          const state = i < tally.active ? "done" : i === tally.active ? "active" : "pending";
          return (
            <li key={sec} className={`flex items-center gap-2 py-1 text-sm transition-colors ${state === "pending" ? "text-ink-faint" : "text-ink"}`}>
              <span className={`grid size-4 place-items-center rounded-full text-[10px] ${state === "done" ? "bg-ok text-pill-ink" : state === "active" ? "animate-pulse bg-size" : "border border-line-strong"}`}>
                {state === "done" ? "✓" : ""}
              </span>
              <span className="flex-1 truncate">{sec}</span>
              <span className="tabular font-mono text-xs text-size">
                {state === "pending" ? "" : tally.perSection[i] > 0 ? formatBytes(tally.perSection[i]) : "clean"}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="truncate font-mono text-xs text-ink-faint">{flow.scanPath}</p>
    </div>
  );
}

/** 3: digging down through the Mac. Sections are soil layers; the layer being dug glows, dug layers keep their find. */
function Strata({ flow, tally }: { flow: CleanFlow; tally: ReturnType<typeof scanTally> }) {
  return (
    <div className="flex w-full flex-col gap-4">
      <FoundCounter bytes={tally.found} />
      <div className="relative overflow-hidden rounded-card border border-line">
        {SCAN_SECTIONS.map((sec, i) => {
          const state = i < tally.active ? "done" : i === tally.active ? "active" : "pending";
          const depth = 0.04 + i * 0.022;
          return (
            <div
              key={sec}
              className="relative flex h-7 items-center justify-between px-4 text-xs transition-colors duration-500"
              style={{
                background:
                  state === "pending"
                    ? `rgb(0 0 0 / ${depth + 0.12})`
                    : state === "active"
                      ? "color-mix(in oklab, var(--color-size) 22%, transparent)"
                      : `color-mix(in oklab, var(--color-disk) ${8 + i * 2}%, transparent)`,
              }}
            >
              {state === "active" && (
                <span className="absolute inset-y-0 left-0 bg-size/25" style={{ width: `${((flow.scanPct * SCAN_SECTIONS.length) % 1) * 100}%` }} />
              )}
              <span className={`relative ${state === "pending" ? "text-ink-faint" : "text-ink"}`}>{sec}</span>
              <span className="tabular relative font-mono text-size">
                {state === "pending" ? "" : tally.perSection[i] > 0 ? formatBytes(tally.perSection[i]) : "–"}
              </span>
            </div>
          );
        })}
      </div>
      <p className="truncate font-mono text-xs text-ink-faint">{flow.scanPath}</p>
    </div>
  );
}
