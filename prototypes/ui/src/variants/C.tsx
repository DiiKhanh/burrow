// Variant C "Guided": one narrow column, a stepper and a storage bar; Status focuses on one big chart.
import { useState } from "react";
import type { VariantProps } from "./types";
import { PillTabs, Window, Label, PillButton } from "../shared/Shell";
import { TriCheckbox } from "../shared/TriCheckbox";
import { AreaSpark, BarSpark, MeterBar, Sparkline } from "../shared/charts";
import { formatBytes, splitBytes } from "../mock/format";
import { JUNK_GROUPS, groupBytes } from "../mock/clean";
import type { CleanFlow, Phase } from "../shared/useCleanFlow";
import type { StatusState } from "../mock/status";
import { ProcessTable } from "./A";
import { ScanVisual, ScanVisualPicker, useScanVisual } from "./CScan";
import type { JunkGroup } from "../mock/clean";

export const name = "Guided: stepper + storage bar";

const GROUP_COLORS = ["var(--color-size)", "var(--color-gpu)", "var(--color-cpu)", "var(--color-mem)", "var(--color-disk)", "var(--color-danger)", "var(--color-ok)"];

export function VariantC({ tab, setTab, flow, status }: VariantProps) {
  return (
    <Window tab={tab}>
      <header className="flex justify-center pt-12">
        <PillTabs tab={tab} onChange={setTab} />
      </header>
      {tab === "clean" ? <CleanGuided flow={flow} /> : <StatusFocus s={status} />}
    </Window>
  );
}

const STEPS: { label: string; phases: Phase[] }[] = [
  { label: "Scan", phases: ["idle", "scanning"] },
  { label: "Review", phases: ["found", "review"] },
  { label: "Clean", phases: ["cleaning"] },
  { label: "Done", phases: ["done"] },
];

function Stepper({ phase }: { phase: Phase }) {
  const at = STEPS.findIndex((s) => s.phases.includes(phase));
  return (
    <ol className="flex items-center gap-2 font-mono text-xs">
      {STEPS.map((s, i) => (
        <li key={s.label} className="flex items-center gap-2">
          <span className={`grid size-5 place-items-center rounded-full ${i < at ? "bg-ok text-pill-ink" : i === at ? "bg-pill text-pill-ink" : "border border-line-strong text-ink-faint"}`}>{i < at ? "✓" : i + 1}</span>
          <span className={i === at ? "text-ink" : "text-ink-faint"}>{s.label}</span>
          {i < STEPS.length - 1 && <span className="h-px w-8 bg-line-strong" />}
        </li>
      ))}
    </ol>
  );
}

function CleanGuided({ flow }: { flow: CleanFlow }) {
  const reviewing = flow.phase === "found" || flow.phase === "review";
  const [scanVisual, setScanVisual] = useScanVisual();
  return (
    <main className="mx-auto flex min-h-0 w-full max-w-[680px] flex-1 flex-col items-center gap-6 px-6 pt-8 pb-16">
      <Stepper phase={flow.phase} />
      {flow.phase === "idle" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <h1 className="text-3xl font-bold">Let's see what can go.</h1>
          <p className="text-sm text-ink-muted">Burrow looks through caches, logs and leftovers. Nothing is removed until step 3.</p>
          <PillButton onClick={flow.startScan}>Start scan</PillButton>
        </div>
      )}
      {flow.phase === "scanning" && <ScanVisual which={scanVisual} flow={flow} />}
      {(flow.phase === "idle" || flow.phase === "scanning") && <ScanVisualPicker current={scanVisual} onChange={setScanVisual} />}
      {reviewing && <Review flow={flow} />}
      {(flow.phase === "cleaning" || flow.phase === "done") && <Progress flow={flow} />}
    </main>
  );
}

function Review({ flow }: { flow: CleanFlow }) {
  const [focus, setFocus] = useState<string | null>(null);
  const [v, u] = splitBytes(flow.selectedBytes);
  return (
    <>
      <div className="w-full">
        <p className="tabular text-4xl font-bold">{v} <span className="text-xl text-ink-muted">{u} selected</span></p>
        <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-surface-sunken">
          {JUNK_GROUPS.map((g, i) => {
            const b = g.items.filter((it) => flow.selected.has(it.id)).reduce((s, it) => s + it.bytes, 0);
            return <div key={g.id} title={g.name} onMouseEnter={() => setFocus(g.id)} onMouseLeave={() => setFocus(null)} className="h-full transition-[width] duration-300" style={{ width: `${(b / flow.selectedBytes || 0) * 100}%`, background: GROUP_COLORS[i % GROUP_COLORS.length], opacity: focus && focus !== g.id ? 0.35 : 1 }} />;
          })}
        </div>
      </div>
      <ul className="w-full flex-1 divide-y divide-line overflow-y-auto rounded-card border border-line bg-surface">
        {JUNK_GROUPS.map((g, i) => (
          <GroupRow key={g.id} g={g} color={GROUP_COLORS[i % GROUP_COLORS.length]} flow={flow} focused={focus === g.id} onFocus={setFocus} />
        ))}
      </ul>
      <div className="flex w-full items-center justify-between">
        <button onClick={flow.startScan} className="text-sm text-ink-muted hover:text-ink">← Scan again</button>
        <PillButton onClick={flow.startClean}>Clean {flow.selectedCount} items →</PillButton>
      </div>
    </>
  );
}

type GroupRowProps = { g: JunkGroup; color: string; flow: CleanFlow; focused: boolean; onFocus: (id: string | null) => void };

function GroupRow({ g, color, flow, focused, onFocus }: GroupRowProps) {
  const [open, setOpen] = useState(false);
  const n = g.items.filter((i) => flow.selected.has(i.id)).length;
  return (
    <li onMouseEnter={() => onFocus(g.id)} onMouseLeave={() => onFocus(null)} className={focused ? "bg-surface-raised" : ""}>
      <div role="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex cursor-default items-center gap-3 px-4 py-3">
        <TriCheckbox label={g.name} value={flow.groupSelection(g)} locked={!!g.lockedReason} onChange={(on) => flow.setGroup(g, on)} />
        <span className="size-2 rounded-full" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {g.name} <span className="tabular ml-1 font-mono text-xs text-ink-faint">{n}/{g.items.length}</span>
          </p>
          <p className={`truncate text-xs ${g.lockedReason ? "text-warn" : "text-ink-faint"}`}>{g.lockedReason ?? g.description}</p>
        </div>
        <span className="tabular font-mono text-sm text-size">{formatBytes(groupBytes(g))}</span>
        <span className={`text-ink-faint transition-transform ${open ? "rotate-90" : ""}`}>›</span>
      </div>
      {open && (
        <ul className="pb-2">
          {g.items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 py-1 pr-10 pl-12 text-xs">
              <input type="checkbox" disabled={!!g.lockedReason} checked={flow.selected.has(i.id)} onChange={() => flow.toggleItem(g, i)} className="accent-pill" />
              <span className="flex-1 truncate font-mono text-ink-muted">{i.path}</span>
              <span className="tabular font-mono text-ink-faint">{formatBytes(i.bytes)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Progress({ flow }: { flow: CleanFlow }) {
  const done = flow.phase === "done";
  return (
    <div className="flex w-full flex-1 flex-col gap-4">
      <p className="tabular text-4xl font-bold">
        {formatBytes(flow.freedBytes)} <span className="text-xl text-ink-muted">{done ? "freed" : "freed so far"}</span>
      </p>
      <MeterBar value={flow.cleaned.length / Math.max(1, flow.queue.length)} color="var(--color-ok)" />
      <ul className="flex-1 divide-y divide-line overflow-y-auto rounded-card border border-line bg-surface">
        {flow.queue.map(({ item }, idx) => {
          const c = flow.cleaned[idx];
          return (
            <li key={item.id} className="flex items-center gap-3 px-4 py-2 text-xs">
              <span className={`w-4 ${c?.outcome === "done" ? "text-ok" : c ? "text-warn" : "text-ink-faint"}`}>{c ? (c.outcome === "done" ? "✓" : "!") : idx === flow.cleaned.length ? "…" : "·"}</span>
              <span className="flex-1 truncate font-mono text-ink-muted">{item.path}</span>
              <span className="tabular font-mono text-ink-faint">{c?.outcome === "skipped" ? "in use, skipped" : formatBytes(item.bytes)}</span>
            </li>
          );
        })}
      </ul>
      {done && <PillButton variant="outline" onClick={flow.reset} className="self-center">Finish</PillButton>}
    </div>
  );
}

type MetricKey = "cpu" | "mem" | "gpu" | "net";

function StatusFocus({ s }: { s: StatusState }) {
  const [metric, setMetric] = useState<MetricKey>("cpu");
  const chips: { key: MetricKey; label: string; value: string; color: string }[] = [
    { key: "cpu", label: "CPU", value: `${Math.round(s.cpu.at(-1)!)}%`, color: "var(--color-cpu)" },
    { key: "mem", label: "Memory", value: `${Math.round(s.mem.at(-1)!)}%`, color: "var(--color-mem)" },
    { key: "gpu", label: "GPU", value: `${Math.round(s.gpu.at(-1)!)}%`, color: "var(--color-gpu)" },
    { key: "net", label: "Network", value: `${formatBytes(s.netDown.at(-1)!)}/s`, color: "var(--color-net)" },
  ];
  const cur = chips.find((c) => c.key === metric)!;
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-4 px-8 pt-8 pb-16">
      <div className="flex items-center justify-between">
        <p className="text-sm"><span className="font-semibold text-ok">● {s.health.score} {s.health.label}</span> <span className="text-ink-muted">· {s.health.note} · {s.chip} · {s.uptime}</span></p>
        <p className="tabular font-mono text-xs text-ink-muted">Disk {formatBytes(s.diskTotalBytes - s.diskUsedBytes)} free · Battery {s.battery.percent}% · Fan {s.fanRpm} RPM</p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {chips.map((c) => (
          <button key={c.key} onClick={() => setMetric(c.key)} className={`rounded-card border px-4 py-3 text-left transition ${metric === c.key ? "border-line-strong bg-surface-raised" : "border-line bg-surface hover:bg-surface-raised"}`}>
            <Label className="text-ink-muted"><span style={{ color: c.color }}>● </span>{c.label}</Label>
            <p className="tabular mt-1 font-mono text-2xl font-semibold">{c.value}</p>
          </button>
        ))}
      </div>
      <section className="rounded-card border border-line bg-surface p-4">
        <Label className="text-ink-faint">{cur.label} · last 60 s</Label>
        <div className="mt-3">
          {metric === "cpu" && <BarSpark data={s.cpu} color={cur.color} className="w-full" height={150} />}
          {metric === "mem" && <AreaSpark data={s.mem} max={100} color={cur.color} className="w-full" height={150} />}
          {metric === "gpu" && <Sparkline data={s.gpu} max={100} color={cur.color} className="w-full" height={150} />}
          {metric === "net" && <AreaSpark data={s.netDown} color={cur.color} className="w-full" height={150} />}
        </div>
      </section>
      <ProcessTable s={s} />
    </main>
  );
}
