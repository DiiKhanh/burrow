// PROTOTYPE (#55) variant C, "Rings": a two-ring sunburst at the centre
// (inner ring: this folder; outer ring: inside its biggest folders, measured
// ahead), a synced list on the right, and the basket as a bottom drawer.
import { useEffect, useState } from "react";
import { bytesParts, formatBytes } from "../format";
import { PillButton } from "../shell/PillButton";
import { cleanHandles, type Entry, tildify } from "./model";
import { Crumbs, EntryTags, Measuring, Notices, PickBox, Size } from "./shared";
import type { Space } from "./useSpace";

export const nameC = "Rings + drawer";

const PALETTE = [
  "var(--color-group-app-caches)",
  "var(--color-group-browsers)",
  "var(--color-group-logs-saved-state)",
  "var(--color-group-trash)",
  "var(--color-group-developer-tools)",
  "var(--color-group-virtualization)",
  "var(--color-group-app-leftovers)",
  "var(--color-group-device-firmware)",
];
const AHEAD = 6;

function arc(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  const big = a1 - a0 > Math.PI ? 1 : 0;
  const p = (r: number, a: number) => `${cx + r * Math.sin(a)} ${cy - r * Math.cos(a)}`;
  return `M ${p(r1, a0)} A ${r1} ${r1} 0 ${big} 1 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 ${big} 0 ${p(r0, a0)} Z`;
}

export function VariantC({ space }: { space: Space }) {
  const v = space.view;
  const [hover, setHover] = useState<Entry | null>(null);
  const [drawer, setDrawer] = useState(false);
  const entries = v.state === "done" ? v.locations.filter((e) => e.size > 0) : [];
  const ahead = entries.filter((e) => e.is_dir && e.scan_status !== "unavailable").slice(0, AHEAD);
  const aheadKey = ahead.map((e) => e.path).join("|");

  // biome-ignore lint/correctness/useExhaustiveDependencies: prototype, keyed on the folders to measure ahead
  useEffect(() => {
    for (const e of ahead) space.prefetch(e.path);
  }, [aheadKey]);

  const total = entries.reduce((s, e) => s + e.size, 0) || 1;
  const cx = 230;
  const cy = 230;
  let angle = 0;
  const segments = entries.map((e, i) => {
    const a0 = angle;
    angle += (e.size / total) * Math.PI * 2;
    return { e, a0, a1: angle, color: cleanHandles(e.path) ? "var(--color-ink-faint)" : PALETTE[i % PALETTE.length] };
  });
  const focus = hover ?? null;
  const center = focus ? bytesParts(focus.size) : bytesParts(v.state === "done" ? v.total : 0);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-4 px-6 pt-5">
        <Crumbs space={space} />
        <button type="button" onClick={space.measureAgain} className="text-caption text-ink-muted hover:text-ink">
          Measure again
        </button>
      </div>
      {v.state === "done" && v.insights.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-6 pt-3">
          {v.insights.map((e) => (
            <button
              key={e.path}
              type="button"
              onClick={() => space.open(e)}
              className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-caption hover:bg-surface-raised"
            >
              <span className="text-size">◆</span> {e.name}{" "}
              <span className="tabular font-mono text-ink-muted">{formatBytes(e.size)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="px-6 pt-3">
        <Notices space={space} />
      </div>
      {v.state === "measuring" && <Measuring space={space} />}
      {v.state === "done" && (
        <div className="flex min-h-0 flex-1 gap-6 px-6 pt-2 pb-20">
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <svg
              viewBox="0 0 460 460"
              className="aspect-square h-full max-h-[460px] w-auto"
              role="img"
              aria-label="Rings"
            >
              {segments.map((s) => {
                const sub = space.resultFor(s.e.path);
                const kids =
                  sub?.state === "done" ? space.adjust(sub.data.entries ?? []).filter((k) => k.size > 0) : [];
                const kidsTotal = kids.reduce((a, k) => a + k.size, 0);
                let ka = s.a0;
                const dim = focus && focus.path !== s.e.path;
                return (
                  <g key={s.e.path} opacity={dim ? 0.35 : 1} className="motion-safe:transition-opacity">
                    {/* biome-ignore lint/a11y/noStaticElementInteractions: prototype */}
                    <path
                      d={arc(cx, cy, 92, 160, s.a0, s.a1)}
                      fill={s.color}
                      fillOpacity={space.picked[s.e.path] ? 1 : 0.7}
                      stroke="var(--color-clean-bottom)"
                      strokeWidth={2}
                      className={s.e.is_dir ? "cursor-pointer" : ""}
                      onMouseEnter={() => setHover(s.e)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => space.open(s.e)}
                    />
                    {kidsTotal > 0 &&
                      kids.slice(0, 24).map((k) => {
                        const a0 = ka;
                        ka += (k.size / kidsTotal) * (s.a1 - s.a0);
                        return (
                          // biome-ignore lint/a11y/noStaticElementInteractions: prototype
                          <path
                            key={k.path}
                            d={arc(cx, cy, 164, 214, a0, ka)}
                            fill={s.color}
                            fillOpacity={space.picked[k.path] ? 0.95 : 0.35}
                            stroke="var(--color-clean-bottom)"
                            strokeWidth={1}
                            onMouseEnter={() => setHover(k)}
                            onMouseLeave={() => setHover(null)}
                          />
                        );
                      })}
                  </g>
                );
              })}
              <text x={cx} y={cy - 6} textAnchor="middle" className="fill-ink font-bold text-[30px]">
                {center.value} {center.unit}
              </text>
              <text x={cx} y={cy + 22} textAnchor="middle" className="fill-ink-muted text-[12px]">
                {focus ? focus.name.slice(0, 26) : v.place.title}
              </text>
            </svg>
          </div>
          <div className="flex w-96 shrink-0 flex-col overflow-hidden rounded-card border border-line bg-surface">
            <div className="border-line border-b px-3 py-2 text-caption text-ink-muted">
              {focus ? tildify(focus.path, space.home) : `${entries.length} items in ${v.place.title}`}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {entries.map((e, i) => (
                // biome-ignore lint/a11y/noStaticElementInteractions: prototype
                <div
                  key={e.path}
                  onMouseEnter={() => setHover(e)}
                  onMouseLeave={() => setHover(null)}
                  className={`flex items-center gap-2 border-line border-b px-3 py-2 ${hover?.path === e.path ? "bg-surface-raised" : ""}`}
                >
                  <PickBox space={space} entry={e} />
                  <span className="size-2 shrink-0 rounded-full" style={{ background: segments[i]?.color }} />
                  <button
                    type="button"
                    disabled={!e.is_dir}
                    onClick={() => space.open(e)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    <span className="truncate text-body">{e.name}</span>
                    <EntryTags entry={e} home={space.home} max={1} />
                  </button>
                  <Size entry={e} />
                </div>
              ))}
              {v.largeFiles.length > 0 && (
                <>
                  <div className="px-3 pt-3 pb-1 font-mono font-semibold text-label text-ink-muted uppercase tracking-label">
                    Largest files in {v.place.title}
                  </div>
                  {v.largeFiles.slice(0, 8).map((f) => (
                    <div key={f.path} className="flex items-center gap-2 px-3 py-1.5">
                      <PickBox space={space} entry={{ ...f, is_dir: false, scan_status: "complete" }} />
                      <span className="min-w-0 flex-1 truncate text-body" title={f.path}>
                        {f.name}
                      </span>
                      <span className="tabular font-mono text-caption">{formatBytes(f.size)}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}
      <Drawer space={space} open={drawer} onToggle={() => setDrawer((d) => !d)} />
    </div>
  );
}

function Drawer({ space, open, onToggle }: { space: Space; open: boolean; onToggle: () => void }) {
  const n = space.pickedList.length;
  const byFolder = Object.entries(
    space.pickedList.reduce<Record<string, typeof space.pickedList>>((acc, i) => {
      const dir = tildify(i.path.slice(0, i.path.lastIndexOf("/")), space.home);
      acc[dir] = [...(acc[dir] ?? []), i];
      return acc;
    }, {}),
  );
  return (
    <div className="absolute inset-x-6 bottom-4 z-20 overflow-hidden rounded-card border border-line-strong bg-surface-raised shadow-pill backdrop-blur">
      <div className="flex items-center justify-between gap-4 px-4 py-2.5">
        <button type="button" onClick={onToggle} disabled={n === 0} className="flex items-center gap-2 text-left">
          <span className="text-caption">{open ? "▾" : "▴"}</span>
          <span className="tabular font-bold">{formatBytes(space.pickedBytes)}</span>
          <span className="text-caption text-ink-muted">
            {n === 0
              ? "Nothing picked"
              : `${n} picked in ${byFolder.length} ${byFolder.length === 1 ? "folder" : "folders"}`}
          </span>
        </button>
        <PillButton disabled={n === 0} onClick={space.moveToTrash}>
          {n === 0 ? "Move to Trash" : `Move ${n} to Trash`}
        </PillButton>
      </div>
      {open && n > 0 && (
        <div className="max-h-56 overflow-y-auto border-line border-t px-4 py-2">
          {byFolder.map(([dir, items]) => (
            <div key={dir} className="py-1">
              <p className="font-mono text-label text-ink-faint">{dir}</p>
              {items.map((i) => (
                <div key={i.path} className="flex items-center gap-2 py-0.5 text-caption">
                  <button type="button" onClick={() => space.toggle(i)} className="text-ink-faint hover:text-danger">
                    ✕
                  </button>
                  <span className="min-w-0 flex-1 truncate">{i.name}</span>
                  <span className="tabular font-mono">{formatBytes(i.size)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
