import { useId } from "react";
import { formatBytes } from "../format";
import type { SpaceItem } from "../mygo";
import { strings } from "../strings";

type Props = {
  title: string;
  hint: string;
  items: readonly SpaceItem[];
  onOpen: (item: SpaceItem) => void;
};

/** One list of Space items, each bar a share of the section's largest. */
export function ItemSection({ title, hint, items, onOpen }: Props) {
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
          <ItemRow key={item.id} item={item} share={largest > 0 ? item.bytes / largest : 0} onOpen={onOpen} />
        ))}
      </ul>
    </section>
  );
}

type RowProps = { item: SpaceItem; share: number; onOpen: (item: SpaceItem) => void };

/** A folder's row is a button that opens it; a file's row holds the chevron's place so sizes line up. */
function ItemRow({ item, share, onOpen }: RowProps) {
  const content = (
    <>
      <span className="relative min-w-0 flex-1 truncate font-medium text-note">{item.name}</span>
      <span className="tabular relative font-mono text-note text-size">{formatBytes(item.bytes)}</span>
      <span aria-hidden="true" className="relative w-2 text-ink-faint text-note">
        {item.opens && strings.space.chevron}
      </span>
    </>
  );
  return (
    <li className="relative">
      <svg aria-hidden="true" className="absolute inset-0 size-full" preserveAspectRatio="none">
        <rect width={`${share * 100}%`} height="100%" className="fill-size opacity-10" />
      </svg>
      {item.opens ? (
        <button
          type="button"
          aria-label={strings.space.open(item.name)}
          onClick={() => onOpen(item)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-raised"
        >
          {content}
        </button>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3">{content}</div>
      )}
    </li>
  );
}
