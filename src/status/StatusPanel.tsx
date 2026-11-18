import { type ReactNode, useEffect, useState } from "react";
import { BarSpark } from "../charts/BarSpark";
import { formatBytes, formatPercent, formatSpeed } from "../format";
import { type Snapshot, Status } from "../mygo";
import { strings } from "../strings";
import { formatProcessCPU, formatTemperature } from "./format";
import type { MetricKey } from "./MenuPreferences";
import { useStatusSnapshot } from "./useStatusSnapshot";

const t = strings.status.menu;
const tones = { cpu: "fill-cpu", memory: "fill-mem", network: "fill-net", thermal: "fill-warn" };
function percent(v: number | null | undefined) {
  return v == null ? strings.unavailable : formatPercent(v) + strings.units.percent;
}
function temp(v: number | null | undefined) {
  return v == null ? strings.unavailable : t.degree(formatTemperature(v));
}
function Row({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 border-line border-b py-0.5 text-body">
      <span title={name} className="min-w-0 truncate">
        {name}
      </span>
      <span className="tabular shrink-0 font-mono">{value}</span>
    </div>
  );
}
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-3">
      <h2 className="mb-1 font-semibold text-caption text-ink-muted">{title}</h2>
      {children}
    </section>
  );
}
function useRanking<T>(ask: () => Promise<T[]>) {
  const [rows, setRows] = useState<T[] | null>(null);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    async function read() {
      const started = performance.now();
      try {
        const next = await ask();
        if (live) setRows(next ?? []);
      } catch {
        if (live) setRows([]);
      } finally {
        if (live) timer = setTimeout(read, Math.max(0, 1000 - (performance.now() - started)));
      }
    }
    void read();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [ask]);
  return rows;
}
function Memory({ s }: { s: Snapshot }) {
  const rows = useRanking(Status.residentProcesses);
  return (
    <>
      <Row name={t.used} value={formatBytes(s.memory.used)} />
      <Row name={t.cached} value={formatBytes(s.details.cached)} />
      <Row name={t.available} value={formatBytes(s.details.available)} />
      <Row
        name={strings.status.memory.pressure}
        value={s.memory.pressure ? strings.status.memory.pressures[s.memory.pressure] : t.unavailable}
      />
      <Group title={t.rss}>
        {rows?.length
          ? rows.map((p) => <Row key={p.pid} name={p.name ?? strings.unavailable} value={formatBytes(p.memoryBytes)} />)
          : rows
            ? t.unavailable
            : t.pending}
      </Group>
    </>
  );
}
function Network({ s }: { s: Snapshot }) {
  const rows = useRanking(Status.applicationTraffic);
  return (
    <>
      <Group title={t.apps}>
        {rows?.length
          ? rows.map((p) => (
              <Row key={p.name} name={p.name} value={t.directions(formatSpeed(p.sent), formatSpeed(p.received))} />
            ))
          : rows
            ? t.unavailable
            : t.pending}
      </Group>
      <Group title={t.interfaces}>
        {s.details.interfaces?.length
          ? s.details.interfaces.map((n) => (
              <Row
                key={n.interface}
                name={n.interface ?? strings.unavailable}
                value={t.directions(formatSpeed(n.uploadBytesPerSecond), formatSpeed(n.downloadBytesPerSecond))}
              />
            ))
          : t.unavailable}
      </Group>
    </>
  );
}
function CPU({ s }: { s: Snapshot }) {
  return (
    <>
      <Row name={t.user} value={percent(s.details.user)} />
      <Row name={t.system} value={percent(s.details.system)} />
      <Group title={t.cores}>
        <div className="grid grid-cols-2 gap-x-4">
          {s.details.perCore?.length
            ? s.details.perCore.map((v, i) => <Row key={i} name={t.core(i + 1)} value={percent(v)} />)
            : t.unavailable}
        </div>
      </Group>
      <Group title={t.processes}>
        {s.processes?.length
          ? s.processes.map((p) => (
              <Row key={p.pid} name={p.name ?? strings.unavailable} value={formatProcessCPU(p.cpu)} />
            ))
          : t.unavailable}
        <p className="mt-1 text-caption text-ink-muted">{t.unitCPU}</p>
      </Group>
    </>
  );
}
export function StatusPanel({ metric }: { metric: MetricKey }) {
  const { snapshot: s, failed: readFailed } = useStatusSnapshot();
  const [now, setNow] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const age = s ? Math.max(0, Math.floor(now / 1000) - s.sampleSecond) : 0;
  const stale = s && s.collector !== "running";
  function history(samples: (number | null)[] | undefined) {
    return [...(samples ?? []), ...Array<null>(Math.min(60, age)).fill(null)].slice(-60);
  }
  const values = s && {
    cpu: percent(s.cpu.usage),
    memory: percent(s.memory.usedPercent),
    thermal: temp(s.thermal.cpuCelsius),
    network: s.network.interface ?? strings.unavailable,
  };
  const series = s && {
    cpu: s.series.cpu,
    memory: s.series.memory,
    thermal: s.series.thermalCPU,
    network: s.series.networkUpload,
  };
  const upload = history(s?.series.networkUpload);
  const download = history(s?.series.networkDownload);
  const networkMax = Math.max(1, ...upload.map((v) => v ?? 0), ...download.map((v) => v ?? 0));
  return (
    <main className="flex h-full flex-col bg-status-bottom text-ink">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-3">
        <header className="flex items-baseline justify-between">
          <h1 className="font-semibold text-subhead">{t.labels[metric]}</h1>
          <strong className="tabular text-subhead">{values?.[metric] ?? strings.unavailable}</strong>
        </header>
        {stale && (
          <p role="status" className="text-caption text-warn">
            {t.stale}
          </p>
        )}
        <Group title={t.minute}>
          {metric === "network" && <Row name={t.send} value={formatSpeed(s?.network.uploadBytesPerSecond ?? null)} />}
          <BarSpark
            data={metric === "network" ? upload : history(series?.[metric])}
            max={metric === "network" ? networkMax : metric === "cpu" || metric === "memory" ? 100 : undefined}
            className={`h-10 w-full ${tones[metric]}`}
          />
          {metric === "network" && (
            <>
              <Row name={t.receive} value={formatSpeed(s?.network.downloadBytesPerSecond ?? null)} />
              <BarSpark data={download} max={networkMax} className="h-10 w-full fill-net" />
            </>
          )}
        </Group>
        {!s ? (
          readFailed ? (
            t.unavailable
          ) : (
            t.pending
          )
        ) : metric === "cpu" ? (
          <CPU s={s} />
        ) : metric === "memory" ? (
          <Memory s={s} />
        ) : metric === "network" ? (
          <Network s={s} />
        ) : (
          <>
            <Row name={t.source} value={s.details.thermalSource || t.unavailable} />
            <Group title={t.sensors}>
              {s.details.sensors?.length
                ? s.details.sensors.map((v) => <Row key={v.name} name={v.name} value={temp(v.celsius)} />)
                : t.unavailable}
            </Group>
          </>
        )}
      </div>
      <footer className="border-line border-t p-3">
        <button
          type="button"
          onClick={() => Status.showWindow().catch(() => setFailed(true))}
          className="w-full rounded-full bg-pill py-2 font-semibold text-body text-pill-ink"
        >
          {t.open}
        </button>
        {failed && <span role="alert">{t.showError}</span>}
      </footer>
    </main>
  );
}
