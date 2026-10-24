// PROTOTYPE (#55), throwaway: the few pieces every variant shows the same
// way (footer, notices, tags), so the variants only disagree on layout.
import type { ReactNode } from "react";
import { TriCheckbox } from "../clean/TriCheckbox";
import { bytesParts, formatBytes } from "../format";
import { PillButton } from "../shell/PillButton";
import { BLOCKED_NOTE, type Blocked, blocked, cleanHandles, type Entry, tildify } from "./model";
import type { Space } from "./useSpace";

export function Tag({ tone, children }: { tone: "insight" | "regen" | "clean" | "warn"; children: ReactNode }) {
  const cls = {
    insight: "border-size/40 text-size",
    regen: "border-ok/40 text-ok",
    clean: "border-line-strong text-ink-muted",
    warn: "border-warn/40 text-warn",
  }[tone];
  return (
    <span className={`whitespace-nowrap rounded-full border px-1.5 py-px font-mono text-label uppercase ${cls}`}>
      {children}
    </span>
  );
}

/** The tags a Space item carries. */
export function EntryTags({ entry, home, max = 9 }: { entry: Entry; home: string; max?: number }) {
  const tags = [
    entry.insight && (
      <Tag key="i" tone="insight">
        Insight
      </Tag>
    ),
    entry.cleanable && (
      <Tag key="r" tone="regen">
        Regenerable
      </Tag>
    ),
    cleanHandles(entry.path) && (
      <Tag key="c" tone="clean">
        Clean handles this
      </Tag>
    ),
    entry.scan_status === "partial" && (
      <Tag key="p" tone="warn">
        Partly unreadable
      </Tag>
    ),
    !entry.path.startsWith(`${home}/`) && entry.path !== home && (
      <Tag key="o" tone="clean">
        Reveal only
      </Tag>
    ),
  ].filter(Boolean);
  return <>{tags.slice(0, max)}</>;
}

/** A Space item's checkbox, or nothing when ADR 0004 forbids picking it. */
export function PickBox({ space, entry }: { space: Space; entry: Entry }) {
  const why: Blocked = blocked(entry.path, space.home);
  if (why) return <span title={BLOCKED_NOTE[why]} className="block size-4.5 shrink-0" />;
  const covered = space.coveredBy(entry.path);
  return (
    <TriCheckbox
      label={entry.name}
      state={space.picked[entry.path] || covered ? "all" : "none"}
      disabled={!!covered}
      onChange={() => space.toggle({ path: entry.path, name: entry.name, size: entry.size })}
    />
  );
}

export function Size({ entry }: { entry: Entry }) {
  if (entry.scan_status === "unavailable")
    return <span className="whitespace-nowrap text-caption text-warn">Protected access unavailable</span>;
  return <span className="tabular whitespace-nowrap font-mono text-body">{formatBytes(entry.size)}</span>;
}

export function Crumbs({ space }: { space: Space }) {
  return (
    <nav className="flex min-w-0 flex-wrap items-center gap-1 font-mono text-caption text-ink-muted">
      {space.stack.map((p, i) => (
        <span key={p.path ?? "overview"} className="flex items-center gap-1">
          {i > 0 && <span className="text-ink-faint">/</span>}
          <button
            type="button"
            onClick={() => space.goTo(i)}
            className={i === space.stack.length - 1 ? "text-ink" : "hover:text-ink"}
          >
            {p.title}
          </button>
        </span>
      ))}
    </nav>
  );
}

/** Measuring: indeterminate, since Mole prints no progress. */
export function Measuring({ space }: { space: Space }) {
  const p = space.view.place;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <p className="font-bold text-title">Measuring…</p>
      <p className="font-mono text-caption text-ink-muted">
        {p.path ? tildify(p.path, space.home) : "Applications, Library, your home folder and insights"}
      </p>
      <progress className="scan-layer-progress h-1.5 w-72 rounded-full" />
      <p className="max-w-sm text-caption text-ink-faint">
        The first Measure of the whole Mac can take a minute; later ones come from Mole's cache.
      </p>
    </div>
  );
}

export function Notices({ space }: { space: Space }) {
  const v = space.view;
  if (v.state !== "done") return null;
  const unreadable = v.entries.some((e) => e.scan_status !== "complete");
  return (
    <div className="flex flex-col gap-2">
      {v.stale && (
        <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-3 py-2 text-caption">
          <span className="text-warn">Measured before last clean</span>
          <button type="button" onClick={space.measureAgain} className="font-semibold text-ink hover:underline">
            Measure again
          </button>
        </div>
      )}
      {unreadable && (
        <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-3 py-2 text-caption">
          <span className="text-ink-muted">Some folders could not be read in full. Sizes may be low.</span>
          <button type="button" className="whitespace-nowrap font-semibold text-ink hover:underline">
            Open Full Disk Access
          </button>
        </div>
      )}
    </div>
  );
}

/** The basket: what is picked across folders, and the one action. */
export function TrashFooter({ space, extra }: { space: Space; extra?: ReactNode }) {
  const n = space.pickedList.length;
  const { value, unit } = bytesParts(space.pickedBytes);
  return (
    <footer className="flex items-center justify-between gap-4 border-line border-t bg-surface-sunken px-6 py-3">
      <div className="flex min-w-0 items-center gap-3 text-caption text-ink-muted">
        <span className="tabular font-bold text-ink text-subhead">
          {value} <span className="text-note text-ink-muted">{unit}</span>
        </span>
        <span>{n === 0 ? "Pick items to move to the Trash" : `${n} picked · you can Put Back from the Trash`}</span>
        {n > 0 && (
          <button type="button" onClick={space.clearPicked} className="hover:text-ink">
            Clear
          </button>
        )}
        {extra}
      </div>
      <PillButton disabled={n === 0} onClick={space.moveToTrash}>
        {n === 0
          ? "Move to Trash"
          : `Move ${n} ${n === 1 ? "item" : "items"} to Trash (${formatBytes(space.pickedBytes)})`}
      </PillButton>
    </footer>
  );
}

export function Report({ space }: { space: Space }) {
  const r = space.report;
  if (!r) return null;
  const bytes = r.moved.reduce((s, i) => s + i.size, 0);
  return (
    <div className="absolute top-24 left-1/2 z-50 w-[30rem] -translate-x-1/2 rounded-card border border-line-strong bg-space-bottom p-4 shadow-pill">
      <p className="font-semibold">
        {formatBytes(bytes)} moved to Trash · {r.moved.length} moved
        {r.skipped.length > 0 && ` · ${r.skipped.length} skipped`}
      </p>
      {r.skipped.map((s) => (
        <p key={s.item.path} className="mt-1 truncate font-mono text-caption text-ink-muted">
          {s.item.name} ({s.reason})
        </p>
      ))}
      <p className="mt-2 text-caption text-ink-faint">
        Disk space comes back when the Trash is emptied. (Prototype: nothing was moved.)
      </p>
      <button type="button" onClick={space.dismissReport} className="mt-3 font-semibold text-caption hover:underline">
        Done
      </button>
    </div>
  );
}
