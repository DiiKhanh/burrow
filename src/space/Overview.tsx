import { useId } from "react";
import { bytesParts, formatBytes } from "../format";
import type { MeasureResult, SpaceItem } from "../mygo";
import { strings } from "../strings";

/** The overview of the whole Mac: its total, the Insights, then the locations that add up to it. */
export function Overview({ result }: { result: MeasureResult }) {
  const { value, unit } = bytesParts(result.totalBytes);
  return (
    <>
      <p className="tabular font-bold text-metric leading-10">
        {value} <span className="text-ink-muted text-subhead">{strings.space.overview.total(unit)}</span>
      </p>
      {result.insights.length > 0 && (
        <ItemSection
          title={strings.space.overview.insights}
          hint={strings.space.overview.insightsHint}
          items={result.insights}
        />
      )}
      <ItemSection
        title={strings.space.overview.locations}
        hint={strings.space.overview.count(result.items.length)}
        items={result.items}
      />
    </>
  );
}

type SectionProps = { title: string; hint: string; items: readonly SpaceItem[] };

/** One list of Space items, each bar a share of the section's largest. */
function ItemSection({ title, hint, items }: SectionProps) {
  const headingId = useId();
  const largest = Math.max(0, ...items.map((item) => item.bytes));
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 className="flex items-baseline justify-between px-1">
        <span id={headingId} className="font-mono font-semibold text-label text-ink-muted uppercase tracking-label">
          {title}
        </span>
        <span className="text-caption text-ink-faint">{hint}</span>
      </h2>
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {items.map((item) => (
          <ItemRow key={item.id} item={item} share={largest > 0 ? item.bytes / largest : 0} />
        ))}
      </ul>
    </section>
  );
}

function ItemRow({ item, share }: { item: SpaceItem; share: number }) {
  return (
    <li className="relative flex items-center gap-3 px-4 py-3">
      <svg aria-hidden="true" className="absolute inset-0 size-full" preserveAspectRatio="none">
        <rect width={`${share * 100}%`} height="100%" className="fill-size opacity-10" />
      </svg>
      <span className="relative min-w-0 flex-1 truncate font-medium text-note">{item.name}</span>
      <span className="tabular relative font-mono text-note text-size">{formatBytes(item.bytes)}</span>
    </li>
  );
}
