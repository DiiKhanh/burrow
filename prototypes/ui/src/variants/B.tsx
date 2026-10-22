// Variant B "Workspace": no hero, no overlay. Persistent two-pane layout like a Finder-style tool.
import { useState } from "react";
import type { VariantProps } from "./types";
import { PillTabs, Window, Label, PillButton } from "../shared/Shell";
import { TriCheckbox } from "../shared/TriCheckbox";
import { AreaSpark, BarSpark, MeterBar, Sparkline } from "../shared/charts";
import { formatBytes } from "../mock/format";
import { JUNK_GROUPS, SCAN_SECTIONS, groupBytes } from "../mock/clean";
import type { CleanFlow } from "../shared/useCleanFlow";
import type { StatusState } from "../mock/status";
import { ProcessTable } from "./A";

export const name = "Workspace: two panes, always visible";

export function VariantB({ tab, setTab, flow, status }: VariantProps) {
  return (
    <Window tab={tab}>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-line pr-5 pl-24">
        <PillTabs tab={tab} onChange={setTab} />
        {tab === "clean" && flow.phase !== "idle" && flow.phase !== "scanning" && (
          <button onClick={flow.startScan} className="text-sm text-size hover:underline">↻ Scan again</button>
        )}
      </header>
      {tab === "clean" ? <CleanWorkspace flow={flow} /> : <StatusColumns s={status} />}
    </Window>
  );
}

function CleanWorkspace({ flow }: { flow: CleanFlow }) {
  const [activeId, setActiveId] = useState(JUNK_GROUPS[0].id);
  const active = JUNK_GROUPS.find((g) => g.id === activeId)!;
  const hasResults = !["idle", "scanning"].includes(flow.phase);
  const busy = flow.phase === "cleaning";
  const outcome = new Map(flow.cleaned.map((c) => [c.item.id, c.outcome]));

  return (
    <main className="flex min-h-0 flex-1">
      <aside className="flex w-[330px] shrink-0 flex-col border-r border-line bg-surface-sunken">
        {flow.phase === "scanning" ? (
          <div className="flex-1 space-y-1 p-4">
            <Label className="text-ink-faint">Scanning {Math.round(flow.scanPct * 100)}%</Label>
            <MeterBar value={flow.scanPct} color="var(--color-size)" className="my-3" />
            {SCAN_SECTIONS.map((sec, i) => {
              const done = i < Math.floor(flow.scanPct * SCAN_SECTIONS.length);
              const now = sec === flow.scanSection;
              return (
                <p key={sec} className={`flex items-center gap-2 text-sm ${now ? "text-ink" : done ? "text-ink-muted" : "text-ink-faint"}`}>
                  <span className="w-3">{done ? "✓" : now ? "•" : ""}</span>{sec}
                </p>
              );
            })}
            <button onClick={flow.cancelScan} className="mt-4 text-sm text-size">Cancel</button>
          </div>
        ) : (
          <ul className="flex-1 overflow-y-auto p-2">
            {JUNK_GROUPS.map((g) => (
              <li key={g.id}>
                <div
                  role="button"
                  onClick={() => setActiveId(g.id)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${g.id === activeId && hasResults ? "bg-surface-raised" : "hover:bg-surface"} ${hasResults ? "" : "opacity-40"}`}
                >
                  <TriCheckbox label={g.name} value={hasResults ? flow.groupSelection(g) : "none"} locked={!!g.lockedReason} onChange={(on) => flow.setGroup(g, on)} />
                  <span className="flex-1 truncate text-sm font-medium">{g.name}</span>
                  <span className="tabular font-mono text-xs text-size">{hasResults ? formatBytes(groupBytes(g)) : "–"}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-3 border-t border-line p-4">
          {busy ? (
            <>
              <p className="tabular flex justify-between font-mono text-xs text-ink-muted">
                <span>Cleaning {flow.cleaned.length}/{flow.queue.length}</span><span>{formatBytes(flow.freedBytes)}</span>
              </p>
              <MeterBar value={flow.cleaned.length / Math.max(1, flow.queue.length)} color="var(--color-ok)" />
            </>
          ) : flow.phase === "done" ? (
            <>
              <p className="text-sm"><span className="font-semibold text-ok">{formatBytes(flow.freedBytes)} freed</span> · {flow.skippedCount} skipped</p>
              <PillButton variant="outline" onClick={flow.reset} className="w-full">Done</PillButton>
            </>
          ) : hasResults ? (
            <>
              <p className="flex gap-3 text-xs text-ink-muted">
                <button onClick={flow.selectAll}>All</button>
                <button onClick={flow.selectNone}>None</button>
                <button onClick={flow.selectRecommended}>Recommended</button>
              </p>
              <PillButton onClick={flow.startClean} className="w-full">Clean {flow.selectedCount} items · {formatBytes(flow.selectedBytes)}</PillButton>
            </>
          ) : null}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {!hasResults ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <h1 className="text-2xl font-bold">{flow.phase === "scanning" ? "Looking for junk…" : "Find reclaimable space"}</h1>
            <p className="max-w-sm text-sm text-ink-muted">
              {flow.phase === "scanning" ? <span className="font-mono text-xs">{flow.scanPath}</span> : "Nothing is removed until you review and confirm."}
            </p>
            {flow.phase === "idle" && <PillButton onClick={flow.startScan}>Scan your Mac</PillButton>}
          </div>
        ) : (
          <>
            <div className="border-b border-line px-6 py-5">
              <div className="flex items-baseline justify-between">
                <h2 className="text-xl font-bold">{active.name}</h2>
                <span className="tabular font-mono text-size">{formatBytes(groupBytes(active))}</span>
              </div>
              <p className={`mt-1 text-sm ${active.lockedReason ? "text-warn" : "text-ink-muted"}`}>
                {active.lockedReason ? `${active.lockedReason}. Quit it to clean.` : active.description}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-sunken text-ink-faint backdrop-blur">
                  <tr>
                    <th className="w-10" />
                    <th className="px-2 py-2 text-left"><Label>Path</Label></th>
                    <th className="px-6 py-2 text-right"><Label>Size</Label></th>
                    {flow.cleaned.length > 0 && <th className="px-6 py-2 text-right"><Label>Result</Label></th>}
                  </tr>
                </thead>
                <tbody>
                  {active.items.map((i) => {
                    const o = outcome.get(i.id);
                    return (
                      <tr key={i.id} className="border-b border-line hover:bg-surface">
                        <td className="pl-6"><input type="checkbox" disabled={!!active.lockedReason || busy} checked={flow.selected.has(i.id)} onChange={() => flow.toggleItem(active, i)} className="accent-pill" /></td>
                        <td className={`truncate px-2 py-2 font-mono text-xs ${o === "done" ? "text-ink-faint line-through" : "text-ink-muted"}`}>{i.path}</td>
                        <td className="tabular px-6 py-2 text-right font-mono text-xs">{formatBytes(i.bytes)}</td>
                        {flow.cleaned.length > 0 && (
                          <td className={`px-6 py-2 text-right text-xs ${o === "done" ? "text-ok" : o === "skipped" ? "text-warn" : "text-ink-faint"}`}>
                            {o === "done" ? "Removed" : o === "skipped" ? "In use" : "–"}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function Vital({ label, value, sub, color, chart }: { label: string; value: string; sub: string; color: string; chart: React.ReactNode }) {
  return (
    <div className="border-b border-line px-5 py-3.5">
      <div className="flex items-baseline justify-between">
        <Label className="text-ink-muted"><span style={{ color }}>● </span>{label}</Label>
        <span className="tabular font-mono text-lg font-semibold">{value}</span>
      </div>
      <div className="mt-2">{chart}</div>
      <p className="tabular mt-1 text-xs text-ink-faint">{sub}</p>
    </div>
  );
}

function StatusColumns({ s }: { s: StatusState }) {
  return (
    <main className="flex min-h-0 flex-1">
      <aside className="w-[380px] shrink-0 overflow-y-auto border-r border-line bg-surface-sunken pb-14">
        <div className="flex items-center gap-4 border-b border-line px-5 py-5">
          <span className="tabular grid size-14 place-items-center rounded-full border-2 border-ok text-xl font-bold">{s.health.score}</span>
          <div>
            <p className="font-semibold">{s.health.label} · <span className="text-ok">{s.health.note}</span></p>
            <p className="text-xs text-ink-muted">{s.chip} · {s.ramTotal} · {s.os} · {s.uptime}</p>
          </div>
        </div>
        <Vital label="CPU" color="var(--color-cpu)" value={`${Math.round(s.cpu.at(-1)!)}%`} sub={`${s.tempC}°C · Load ${s.load} / ${s.cores} cores`} chart={<BarSpark data={s.cpu} color="var(--color-cpu)" className="w-full" height={28} />} />
        <Vital label="Memory" color="var(--color-mem)" value={`${Math.round(s.mem.at(-1)!)}%`} sub={`${formatBytes(s.memUsedBytes)} used · ${formatBytes(s.swapBytes)} swap`} chart={<AreaSpark data={s.mem} max={100} color="var(--color-mem)" className="w-full" height={28} />} />
        <Vital label="GPU" color="var(--color-gpu)" value={`${Math.round(s.gpu.at(-1)!)}%`} sub="20-core GPU" chart={<Sparkline data={s.gpu} max={100} color="var(--color-gpu)" className="w-full" height={28} />} />
        <Vital label="Network" color="var(--color-net)" value={`${formatBytes(s.netDown.at(-1)!)}/s`} sub={`↑ ${formatBytes(s.netUp.at(-1)!)}/s · Wi-Fi`} chart={<Sparkline data={s.netDown} color="var(--color-net)" className="w-full" height={28} />} />
        <Vital label="Disk" color="var(--color-disk)" value={`${formatBytes(s.diskTotalBytes - s.diskUsedBytes)} free`} sub={`${formatBytes(s.diskUsedBytes)} of ${formatBytes(s.diskTotalBytes)}`} chart={<MeterBar value={s.diskUsedBytes / s.diskTotalBytes} color="var(--color-disk)" />} />
        <Vital label="Battery" color="var(--color-ok)" value={`${s.battery.percent}%`} sub={`Charging ${s.battery.watts}W · ${s.battery.cycles} cycles · ${s.battery.healthPct}% health`} chart={<MeterBar value={s.battery.percent / 100} color="var(--color-ok)" />} />
        <Vital label="Fan" color="var(--color-ink-muted)" value={`${s.fanRpm} RPM`} sub="Managed by macOS" chart={null} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col p-5 pb-14">
        <ProcessTable s={s} />
      </div>
    </main>
  );
}
