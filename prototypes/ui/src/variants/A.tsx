// Variant A "Faithful": Mole for Mac's structure. Hero screen, full-window review overlay, bento Status.
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { VariantProps } from "./types";
import { PillButton, PillTabs, Window, Label } from "../shared/Shell";
import { BurrowRings } from "../shared/Burrow";
import { TriCheckbox } from "../shared/TriCheckbox";
import { AreaSpark, BarSpark, MeterBar, Ring, Sparkline } from "../shared/charts";
import { formatBytes, splitBytes } from "../mock/format";
import { JUNK_GROUPS, groupBytes, type JunkGroup } from "../mock/clean";
import type { CleanFlow } from "../shared/useCleanFlow";
import type { StatusState } from "../mock/status";

export const name = "Faithful: hero + overlay + bento";

export function VariantA({ tab, setTab, flow, status }: VariantProps) {
  return (
    <Window tab={tab}>
      <header className="flex justify-center pt-12">
        <PillTabs tab={tab} onChange={setTab} />
      </header>
      {tab === "clean" ? <CleanHero flow={flow} /> : <StatusBento s={status} />}
    </Window>
  );
}

function BigBytes({ bytes, suffix }: { bytes: number; suffix?: string }) {
  const [v, u] = splitBytes(bytes);
  return (
    <h1 className="tabular text-hero font-bold tracking-tight">
      {v}
      <span className="ml-2 text-[0.55em] text-ink-muted">{u}</span>
      {suffix && <span className="ml-3 text-[0.55em] font-semibold">{suffix}</span>}
    </h1>
  );
}

function CleanHero({ flow }: { flow: CleanFlow }) {
  const [showDetails, setShowDetails] = useState(false);
  const total = JUNK_GROUPS.reduce((s, g) => s + groupBytes(g), 0);
  const itemCount = JUNK_GROUPS.reduce((s, g) => s + g.items.length, 0);
  const cleaning = flow.phase === "cleaning";
  const progress =
    flow.phase === "scanning" ? flow.scanPct : cleaning ? flow.cleaned.length / Math.max(1, flow.queue.length) : undefined;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 pb-16">
      <BurrowRings tone="clean" active={flow.phase === "scanning" || cleaning} progress={progress} />

      {flow.phase === "idle" && (
        <>
          <p className="max-w-xs text-center font-serif text-sm text-ink-muted italic">
            Dig out what your Mac no longer needs.
          </p>
          <PillButton onClick={flow.startScan}>Scan your Mac</PillButton>
        </>
      )}

      {flow.phase === "scanning" && (
        <div className="flex flex-col items-center gap-3">
          <h1 className="tabular text-hero font-bold">{Math.round(flow.scanPct * 100)}%</h1>
          <p className="max-w-md truncate font-mono text-xs text-ink-muted">
            {flow.scanSection} · {flow.scanPath}
          </p>
          <button onClick={flow.cancelScan} className="text-sm text-size hover:underline">Cancel</button>
        </div>
      )}

      {(flow.phase === "found" || flow.phase === "review") && (
        <div className="flex flex-col items-center gap-3">
          <BigBytes bytes={total} suffix="found" />
          <p className="text-sm text-ink-muted">
            {itemCount} items in {JUNK_GROUPS.length} groups ·{" "}
            <button onClick={flow.startScan} className="text-size hover:underline">Scan again</button>
          </p>
          <PillButton onClick={flow.openReview} className="mt-4 px-12">Review results</PillButton>
        </div>
      )}

      {cleaning && <Cleaning flow={flow} />}

      {flow.phase === "done" && (
        <div className="flex flex-col items-center gap-3">
          <BigBytes bytes={flow.freedBytes} suffix="freed" />
          <button onClick={() => setShowDetails((v) => !v)} className="text-sm text-ink-muted hover:text-ink">
            {flow.cleaned.length - flow.skippedCount} cleaned · {flow.skippedCount} skipped ›
          </button>
          {showDetails && <ResultList flow={flow} />}
          <PillButton variant="outline" onClick={flow.reset} className="mt-4">Back to start</PillButton>
        </div>
      )}

      <ReviewOverlay flow={flow} />
    </main>
  );
}

function Cleaning({ flow }: { flow: CleanFlow }) {
  const current = flow.queue[flow.cleaned.length] ?? flow.queue.at(-1);
  return (
    <div className="flex w-[440px] flex-col items-center gap-3">
      <BigBytes bytes={flow.freedBytes} />
      <p className="flex items-center gap-2 text-sm text-ink-muted">
        <span className="size-1.5 rounded-full bg-ok" />
        {current?.group.name}
        <span className="tabular font-mono">{flow.cleaned.length}/{flow.queue.length}</span>
      </p>
      <ResultList flow={flow} />
    </div>
  );
}

function ResultList({ flow }: { flow: CleanFlow }) {
  return (
    <ul className="fade-top flex h-40 w-[440px] flex-col-reverse overflow-hidden">
      {[...flow.cleaned].reverse().map(({ item, outcome }) => (
        <li key={item.id} className="flex items-center gap-2 py-1 text-xs">
          <span className={outcome === "done" ? "text-ok" : "text-warn"}>{outcome === "done" ? "✓" : "–"}</span>
          <span className="flex-1 truncate font-mono text-ink-muted">{item.path}</span>
          <span className="tabular font-mono text-ink-faint">{outcome === "done" ? formatBytes(item.bytes) : "in use"}</span>
        </li>
      ))}
    </ul>
  );
}

function ReviewOverlay({ flow }: { flow: CleanFlow }) {
  return (
    <Dialog.Root open={flow.phase === "review"} onOpenChange={(o) => !o && flow.closeReview()}>
      <Dialog.Portal>
        <Dialog.Content className="fixed inset-0 z-50 flex flex-col bg-linear-to-b from-clean-top to-clean-bottom outline-none">
          <div className="flex items-start justify-between px-10 pt-14 pb-6">
            <div>
              <Dialog.Title className="text-3xl font-bold">Ready to clean</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-muted">
                {formatBytes(flow.selectedBytes)} selected · {flow.selectedCount} items · Google Chrome is holding cache ·{" "}
                <span className="text-size">Quit</span>
              </Dialog.Description>
            </div>
            <Dialog.Close className="grid size-8 place-items-center rounded-full bg-surface-raised text-ink-muted hover:text-ink" aria-label="Close">✕</Dialog.Close>
          </div>
          <div className="flex-1 space-y-2.5 overflow-y-auto px-10 pb-6">
            {JUNK_GROUPS.map((g) => <GroupCard key={g.id} g={g} flow={flow} />)}
          </div>
          <footer className="flex items-center justify-between border-t border-line bg-surface-sunken px-10 py-4">
            <div className="flex items-center gap-4 text-sm">
              <span className="tabular font-mono text-ink-muted">{flow.selectedCount} selected</span>
              <button onClick={flow.selectAll} className="text-ink-muted hover:text-ink">All</button>
              <button onClick={flow.selectNone} className="text-ink-muted hover:text-ink">None</button>
              <button onClick={flow.selectRecommended} className="text-ink-muted hover:text-ink">Recommended</button>
            </div>
            <PillButton onClick={flow.startClean}>Clean · {formatBytes(flow.selectedBytes)}</PillButton>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function GroupCard({ g, flow }: { g: JunkGroup; flow: CleanFlow }) {
  const [open, setOpen] = useState(false);
  const sel = flow.groupSelection(g);
  const n = g.items.filter((i) => flow.selected.has(i.id)).length;
  const selBytes = g.items.filter((i) => flow.selected.has(i.id)).reduce((s, i) => s + i.bytes, 0);
  return (
    <section className="rounded-card border border-line bg-surface">
      <div role="button" onClick={() => setOpen((o) => !o)} className="flex cursor-default items-center gap-4 px-5 py-4">
        <TriCheckbox label={g.name} value={sel} locked={!!g.lockedReason} onChange={(on) => flow.setGroup(g, on)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h3 className="font-semibold">{g.name}</h3>
            <span className="tabular font-mono text-xs text-ink-faint">{n}/{g.items.length} selected</span>
            {!g.recommended && <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] text-warn">review</span>}
          </div>
          <p className="mt-0.5 text-sm text-ink-muted">{g.lockedReason ? `${g.lockedReason}. Quit it to clean.` : g.description}</p>
        </div>
        <span className="tabular font-mono text-sm text-size">
          {formatBytes(selBytes)} <span className="text-ink-faint">/ {formatBytes(groupBytes(g))}</span>
        </span>
        <span className={`text-ink-faint transition-transform ${open ? "rotate-90" : ""}`}>›</span>
      </div>
      {open && (
        <ul className="border-t border-line px-5 py-2">
          {g.items.map((i) => (
            <li key={i.id} className="flex items-center gap-4 py-1.5 pl-9 text-xs">
              <input type="checkbox" disabled={!!g.lockedReason} checked={flow.selected.has(i.id)} onChange={() => flow.toggleItem(g, i)} className="accent-pill" />
              <span className="flex-1 truncate font-mono text-ink-muted">{i.path}</span>
              <span className="tabular font-mono text-ink-faint">{formatBytes(i.bytes)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Card({ label, icon, color, badge, children, foot, className = "" }: { label: string; icon: string; color: string; badge?: string; children: React.ReactNode; foot?: string; className?: string }) {
  return (
    <section className={`flex min-w-0 flex-col gap-3 rounded-card border border-line bg-surface p-4 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <Label className="flex shrink-0 items-center gap-1.5"><span style={{ color }}>{icon}</span>{label}</Label>
        {badge && <span className="tabular truncate rounded-full bg-surface-raised px-2 py-0.5 font-mono text-[11px] text-ink-muted">{badge}</span>}
      </div>
      <div className="flex flex-1 flex-col justify-between gap-2">{children}</div>
      {foot && <p className="tabular truncate text-xs text-ink-faint">{foot}</p>}
    </section>
  );
}

function Metric({ value, unit }: { value: string | number; unit: string }) {
  return (
    <p className="tabular text-metric font-bold">
      {value}<span className="ml-1 text-base font-semibold text-ink-muted">{unit}</span>
    </p>
  );
}

export function StatusBento({ s }: { s: StatusState }) {
  const cpu = Math.round(s.cpu.at(-1)!);
  const [down, downU] = splitBytes(s.netDown.at(-1)!);
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-8 pt-8 pb-16">
      <div className="grid shrink-0 grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))] grid-rows-[178px_178px] gap-3">
        <Card label="Health" icon="◉" color="var(--color-ok)" badge={`${s.chip} · ${s.ramTotal}`} foot={s.uptime}>
          <div className="flex items-end justify-between">
            <div>
              <Metric value={s.health.score} unit={s.health.label} />
              <p className="mt-1 text-sm text-ok">{s.health.note}</p>
            </div>
            <span className="tabular rounded-full bg-surface-raised px-2 py-0.5 font-mono text-[11px] text-ink-muted">{s.os}</span>
          </div>
        </Card>
        <Card label="CPU" icon="▦" color="var(--color-cpu)" badge={`${s.tempC}°C`} foot={`Load ${s.load} / ${s.cores} cores`}>
          <Metric value={cpu} unit="%" />
          <BarSpark data={s.cpu} color="var(--color-cpu)" className="w-full" height={34} />
        </Card>
        <Card label="GPU" icon="◆" color="var(--color-gpu)" badge="20-core" foot="Mostly idle">
          <Metric value={Math.round(s.gpu.at(-1)!)} unit="%" />
          <Sparkline data={s.gpu} max={100} color="var(--color-gpu)" className="w-full" height={34} />
        </Card>
        <Card label="Memory" icon="▤" color="var(--color-mem)" badge={`Pressure ${Math.round(s.mem.at(-1)! - 40)}%`} foot={`${formatBytes(s.memUsedBytes)} · ${formatBytes(s.swapBytes)} swap`}>
          <Metric value={Math.round(s.mem.at(-1)!)} unit="%" />
          <AreaSpark data={s.mem} max={100} color="var(--color-mem)" className="w-full" height={34} />
        </Card>
        <Card label="Battery" icon="⚡" color="var(--color-ok)" badge={`${s.battery.healthPct}% Health`} foot={`${s.battery.cycles} cycles · Top drain: Google Chrome`}>
          <div className="flex items-end justify-between">
            <Metric value={s.battery.percent} unit={`% ${s.battery.charging ? `Charging ${s.battery.watts}W` : ""}`} />
            <div className="flex gap-2">
              <Ring value={0.92} color="var(--color-ok)" />
              <Ring value={0.64} color="var(--color-ok)" />
              <Ring value={0.31} color="var(--color-warn)" />
            </div>
          </div>
        </Card>
        <Card label="Disk" icon="◐" color="var(--color-disk)" badge={formatBytes(s.diskTotalBytes)} foot={`${formatBytes(s.diskUsedBytes)} used · ${Math.round((s.diskUsedBytes / s.diskTotalBytes) * 100)}%`}>
          <Metric value={formatBytes(s.diskTotalBytes - s.diskUsedBytes).split(" ")[0]} unit="GB free" />
          <MeterBar value={s.diskUsedBytes / s.diskTotalBytes} color="var(--color-disk)" />
        </Card>
        <Card label="Network" icon="⇅" color="var(--color-net)" badge="Wi-Fi" foot={`↑ ${formatBytes(s.netUp.at(-1)!)}/s`}>
          <Metric value={down} unit={`${downU}/s`} />
          <Sparkline data={s.netDown} color="var(--color-net)" className="w-full" height={34} />
        </Card>
        <Card label="Fan" icon="✣" color="var(--color-ink-muted)" badge={`${s.fanRpm} RPM`} foot="Managed by macOS">
          <Metric value={s.fanRpm} unit="RPM" />
        </Card>
      </div>
      <ProcessTable s={s} className="min-h-[220px]" />
    </main>
  );
}

export function ProcessTable({ s, className = "" }: { s: StatusState; className?: string }) {
  return (
    <section className={`min-h-0 flex-1 overflow-hidden rounded-card border border-line bg-surface ${className}`}>
      <table className="w-full text-sm">
        <thead className="text-ink-faint">
          <tr className="border-b border-line">
            <th className="px-4 py-2 text-left"><Label>Process</Label></th>
            <th className="px-4 py-2 text-right"><Label>CPU ▾</Label></th>
            <th className="px-4 py-2 text-right"><Label>Memory</Label></th>
            <th className="px-4 py-2 text-right"><Label>PID</Label></th>
          </tr>
        </thead>
        <tbody>
          {s.processes.map((p) => (
            <tr key={p.pid} className="border-b border-line last:border-0 hover:bg-surface">
              <td className="px-4 py-1.5">{p.name}</td>
              <td className="tabular px-4 py-1.5 text-right font-mono">{p.cpu.toFixed(1)}%</td>
              <td className="tabular px-4 py-1.5 text-right font-mono text-ink-muted">{formatBytes(p.memBytes)}</td>
              <td className="tabular px-4 py-1.5 text-right font-mono text-ink-faint">{p.pid}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
