// PROTOTYPE (#55) variant B, "Treemap": the folder as a squarified map that
// fills the window; a right sidebar holds insights, largest files and the
// basket with the one action.
import { useLayoutEffect, useRef, useState } from "react";
import { bytesParts, formatBytes } from "../format";
import { PillButton } from "../shell/PillButton";
import { blocked, cleanHandles, type Entry } from "./model";
import { Crumbs, EntryTags, Measuring, Notices, PickBox, Size } from "./shared";
import type { Space } from "./useSpace";

export const nameB = "Treemap + basket";

type Rect = { x: number; y: number; w: number; h: number };

/** Squarified treemap (Bruls et al.), values sorted descending. */
function squarify(values: number[], r: Rect): Rect[] {
  const out: Rect[] = [];
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0) return values.map(() => ({ x: r.x, y: r.y, w: 0, h: 0 }));
  const scale = (r.w * r.h) / total;
  let rest = values.map((v) => v * scale);
  let box = { ...r };
  while (rest.length) {
    const side = Math.min(box.w, box.h);
    let row: number[] = [];
    let i = 0;
    const at = (k: number) => rest[k] as number;
    const worst = (rw: number[]) => {
      const s = rw.reduce((a, b) => a + b, 0);
      return Math.max(...rw.map((a) => Math.max((side * side * a) / (s * s), (s * s) / (side * side * a))));
    };
    while (i < rest.length && (row.length === 0 || worst([...row, at(i)]) <= worst(row))) {
      row = [...row, at(i)];
      i++;
    }
    const sum = row.reduce((a, b) => a + b, 0);
    const thick = sum / side;
    let offset = 0;
    for (const a of row) {
      const len = a / thick;
      out.push(
        box.w >= box.h
          ? { x: box.x, y: box.y + offset, w: thick, h: len }
          : { x: box.x + offset, y: box.y, w: len, h: thick },
      );
      offset += len;
    }
    box =
      box.w >= box.h
        ? { x: box.x + thick, y: box.y, w: box.w - thick, h: box.h }
        : { x: box.x, y: box.y + thick, w: box.w, h: box.h - thick };
    rest = rest.slice(i);
  }
  return out;
}

function tone(entry: Entry, home: string) {
  if (cleanHandles(entry.path)) return "bg-ink-faint/15";
  if (entry.insight) return "bg-size/30";
  if (entry.cleanable) return "bg-ok/25";
  if (blocked(entry.path, home) === "outside-home") return "bg-disk/15";
  return "bg-net/20";
}

export function VariantB({ space }: { space: Space }) {
  const v = space.view;
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const tiles = v.state === "done" ? v.locations.filter((e) => e.size > 0) : [];
  const rects = squarify(
    tiles.map((e) => e.size),
    { x: 0, y: 0, w: size.w, h: size.h },
  );

  return (
    <div className="flex min-h-0 flex-1 gap-4 px-6 pt-5 pb-6">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <Crumbs space={space} />
            {v.state === "done" && (
              <p className="tabular mt-1 font-bold text-title">
                {formatBytes(v.total)}{" "}
                <span className="text-ink-muted text-note">{v.place.path ? "in this folder" : "measured"}</span>
              </p>
            )}
          </div>
          <button type="button" onClick={space.measureAgain} className="text-caption text-ink-muted hover:text-ink">
            Measure again
          </button>
        </div>
        <Notices space={space} />
        <div
          ref={box}
          className="relative min-h-0 flex-1 overflow-hidden rounded-card border border-line bg-surface-sunken"
        >
          {v.state === "measuring" && <Measuring space={space} />}
          {v.state === "done" &&
            tiles.map((e, i) => {
              const r = rects[i] as Rect;
              const roomy = r.w > 90 && r.h > 44;
              const isPicked = !!space.picked[e.path] || !!space.coveredBy(e.path);
              return (
                <div
                  key={e.path}
                  className={`absolute overflow-hidden border border-surface-sunken p-2 motion-safe:transition-all duration-300 ${tone(e, space.home)} ${isPicked ? "outline-2 outline-pill -outline-offset-2" : ""} ${e.is_dir ? "cursor-pointer hover:brightness-125" : ""}`}
                  style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
                  title={`${e.name} · ${formatBytes(e.size)}`}
                  onClick={() => space.open(e)}
                >
                  {roomy && (
                    <div className="flex items-start gap-2">
                      {/* biome-ignore lint/a11y/noStaticElementInteractions: prototype */}
                      <span onClick={(ev) => ev.stopPropagation()}>
                        <PickBox space={space} entry={e} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-body">{e.name}</p>
                        <Size entry={e} />
                        {r.h > 96 && r.w > 200 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            <EntryTags entry={e} home={space.home} max={2} />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
        <Legend />
      </div>
      <Sidebar space={space} />
    </div>
  );
}

function Legend() {
  const items = [
    ["bg-net/20", "Your files"],
    ["bg-size/30", "Insight"],
    ["bg-ok/25", "Regenerable"],
    ["bg-ink-faint/15", "Clean handles this"],
    ["bg-disk/15", "Outside home (Reveal only)"],
  ];
  return (
    <div className="flex flex-wrap gap-4 text-caption text-ink-muted">
      {items.map(([c, l]) => (
        <span key={l} className="flex items-center gap-1.5">
          <span className={`size-2.5 rounded-sm ${c}`} />
          {l}
        </span>
      ))}
    </div>
  );
}

function Sidebar({ space }: { space: Space }) {
  const v = space.view;
  const n = space.pickedList.length;
  const { value, unit } = bytesParts(space.pickedBytes);
  return (
    <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-hidden rounded-card border border-line bg-surface p-4">
      {v.state === "done" && v.insights.length > 0 && (
        <div>
          <h3 className="mb-2 font-mono font-semibold text-label text-ink-muted uppercase tracking-label">Insights</h3>
          <div className="flex flex-col gap-1">
            {v.insights.map((e) => (
              <button
                key={e.path}
                type="button"
                onClick={() => space.open(e)}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-raised"
              >
                <span className="truncate text-body">{e.name}</span>
                <Size entry={e} />
              </button>
            ))}
          </div>
        </div>
      )}
      {v.state === "done" && v.largeFiles.length > 0 && (
        <div className="min-h-0">
          <h3 className="mb-2 font-mono font-semibold text-label text-ink-muted uppercase tracking-label">
            Largest files in {v.place.title}
          </h3>
          <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
            {v.largeFiles.slice(0, 10).map((f) => (
              <div key={f.path} className="flex items-center gap-2 px-2 py-1">
                <PickBox space={space} entry={{ ...f, is_dir: false, scan_status: "complete" }} />
                <span className="min-w-0 flex-1 truncate text-body" title={f.path}>
                  {f.name}
                </span>
                <span className="tabular font-mono text-caption">{formatBytes(f.size)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-auto flex min-h-0 flex-col gap-2 border-line border-t pt-3">
        <h3 className="flex items-baseline justify-between">
          <span className="font-mono font-semibold text-label text-ink-muted uppercase tracking-label">To Trash</span>
          <span className="tabular font-bold text-subhead">
            {value} <span className="text-caption text-ink-muted">{unit}</span>
          </span>
        </h3>
        <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
          {n === 0 && (
            <p className="text-caption text-ink-faint">
              Tick tiles in any folder. They stay picked as you move around.
            </p>
          )}
          {space.pickedList.map((i) => (
            <div key={i.path} className="flex items-center gap-2 text-caption">
              <button type="button" onClick={() => space.toggle(i)} className="text-ink-faint hover:text-danger">
                ✕
              </button>
              <span className="min-w-0 flex-1 truncate" title={i.path}>
                {i.name}
              </span>
              <span className="tabular font-mono">{formatBytes(i.size)}</span>
            </div>
          ))}
        </div>
        <PillButton disabled={n === 0} onClick={space.moveToTrash}>
          {n === 0 ? "Move to Trash" : `Move ${n} ${n === 1 ? "item" : "items"} to Trash`}
        </PillButton>
      </div>
    </aside>
  );
}
