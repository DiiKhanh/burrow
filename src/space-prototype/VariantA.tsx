// PROTOTYPE (#55) variant A, "Ledger": one column like Clean's Review. Rows
// with a share bar behind them; insights first in the overview; largest
// files under the folder list.
import { bytesParts } from "../format";
import type { Entry } from "./model";
import { Crumbs, EntryTags, Measuring, Notices, PickBox, Size, TrashFooter } from "./shared";
import type { Space } from "./useSpace";

export const nameA = "Ledger list";

export function VariantA({ space }: { space: Space }) {
  const v = space.view;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-clean flex-col gap-5 px-6 pt-6 pb-10">
          <Crumbs space={space} />
          {v.state === "measuring" && <Measuring space={space} />}
          {v.state === "error" && <p className="text-danger">{v.message}</p>}
          {v.state === "done" && (
            <>
              <Hero bytes={v.total} label={v.place.path ? "in this folder" : "measured on this Mac"} />
              <Notices space={space} />
              {v.insights.length > 0 && (
                <Section title="Insights" hint="Places that quietly grow">
                  {v.insights.map((e) => (
                    <Row key={e.path} space={space} entry={e} max={v.insights[0]?.size ?? 1} />
                  ))}
                </Section>
              )}
              <Section title={v.place.path ? "Contents" : "Locations"} hint={`${v.locations.length} items`}>
                {v.locations.map((e) => (
                  <Row key={e.path} space={space} entry={e} max={v.locations[0]?.size ?? 1} />
                ))}
              </Section>
              {v.largeFiles.length > 0 && (
                <Section title={`Largest files in ${v.place.title}`} hint="anywhere below this folder">
                  {v.largeFiles.slice(0, 8).map((f) => (
                    <Row
                      key={f.path}
                      space={space}
                      entry={{ ...f, is_dir: false, scan_status: "complete" }}
                      max={v.largeFiles[0]?.size ?? 1}
                      showPath
                    />
                  ))}
                </Section>
              )}
            </>
          )}
        </div>
      </div>
      <TrashFooter space={space} />
    </div>
  );
}

function Hero({ bytes, label }: { bytes: number; label: string }) {
  const { value, unit } = bytesParts(bytes);
  return (
    <p className="tabular font-bold text-metric leading-10">
      {value}{" "}
      <span className="text-ink-muted text-subhead">
        {unit} {label}
      </span>
    </p>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="flex items-baseline justify-between px-1 pb-1">
        <span className="font-mono font-semibold text-label text-ink-muted uppercase tracking-label">{title}</span>
        <span className="text-caption text-ink-faint">{hint}</span>
      </h2>
      <div className="overflow-hidden rounded-card border border-line bg-surface">{children}</div>
    </section>
  );
}

function Row({ space, entry, max, showPath }: { space: Space; entry: Entry; max: number; showPath?: boolean }) {
  const share = max > 0 ? entry.size / max : 0;
  return (
    <div className="group relative flex items-center gap-3 border-line border-b px-3 py-2.5 last:border-b-0">
      <div className="absolute inset-y-0 left-0 bg-size/10" style={{ width: `${share * 100}%` }} />
      <div className="relative">
        <PickBox space={space} entry={entry} />
      </div>
      <button
        type="button"
        disabled={!entry.is_dir}
        onClick={() => space.open(entry)}
        className="relative flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
      >
        <span className="text-caption">{entry.is_dir ? "▸" : "·"}</span>
        <span className="min-w-0">
          <span className="block truncate font-medium text-body">{entry.name}</span>
          {showPath && <span className="block truncate font-mono text-label text-ink-faint">{entry.path}</span>}
        </span>
        <span className="flex shrink-0 gap-1">
          <EntryTags entry={entry} home={space.home} />
        </span>
      </button>
      <span className="relative opacity-0 group-hover:opacity-100">
        <button type="button" title="Reveal in Finder" className="text-caption text-ink-muted hover:text-ink">
          Reveal
        </button>
      </span>
      <span className="relative w-24 text-right">
        <Size entry={entry} />
      </span>
    </div>
  );
}
