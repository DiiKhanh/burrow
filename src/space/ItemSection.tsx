import { useId } from "react";
import { formatBytes } from "../format";
import { Space, type SpaceItem, type Tag } from "../mygo";
import { useSelectTab } from "../shell/activeTab";
import { strings } from "../strings";

type Props = {
  title: string;
  hint: string;
  items: readonly SpaceItem[];
  onOpen: (item: SpaceItem) => void;
  /** A line under an item's name, such as where a largest file lies; none when it returns "". */
  detail?: (item: SpaceItem) => string;
};

/** One list of Space items, each bar a share of the section's largest. */
export function ItemSection({ title, hint, items, onOpen, detail }: Props) {
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
          <ItemRow
            key={item.id}
            item={item}
            share={largest > 0 ? item.bytes / largest : 0}
            detail={detail?.(item) ?? ""}
            onOpen={onOpen}
          />
        ))}
      </ul>
    </section>
  );
}

type RowProps = { item: SpaceItem; share: number; detail: string; onOpen: (item: SpaceItem) => void };

/**
 * A folder's row opens it from anywhere but its tags and Reveal: the open
 * button's ::after covers the row, and the controls after it sit above. A
 * file's row holds the chevron's place so sizes line up.
 */
function ItemRow({ item, share, detail, onOpen }: RowProps) {
  const name = (
    <>
      <span className="block truncate font-medium text-note">{item.name}</span>
      {detail && <span className="block truncate font-mono text-label text-ink-faint">{detail}</span>}
    </>
  );
  return (
    <li className={`group relative flex items-center gap-3 px-4 py-3 ${item.opens ? "hover:bg-surface-raised" : ""}`}>
      <svg aria-hidden="true" className="absolute inset-0 size-full" preserveAspectRatio="none">
        <rect width={`${share * 100}%`} height="100%" className="fill-size opacity-10" />
      </svg>
      {item.opens ? (
        <button
          type="button"
          aria-label={strings.space.open(item.name)}
          onClick={() => onOpen(item)}
          className="min-w-0 flex-1 text-left outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-size focus-visible:after:ring-inset"
        >
          {name}
        </button>
      ) : (
        <span className="relative min-w-0 flex-1">{name}</span>
      )}
      {item.tags.length > 0 && (
        <span className="relative flex shrink-0 gap-1">
          {item.tags.map((tag) => (
            <TagLabel key={tag} tag={tag} />
          ))}
        </span>
      )}
      <button
        type="button"
        aria-label={strings.space.revealIn(item.name)}
        // Go logged why it could not reveal the item; the row has nothing to show for it.
        onClick={() => void Space.reveal(item.id).catch(() => {})}
        className="relative shrink-0 text-caption text-ink-muted opacity-0 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
      >
        {strings.space.reveal}
      </button>
      <span className="tabular relative font-mono text-note text-size">{formatBytes(item.bytes)}</span>
      <span aria-hidden="true" className="relative w-2 text-ink-faint text-note">
        {item.opens && strings.space.chevron}
      </span>
    </li>
  );
}

const TAG_TONE: Record<Tag, string> = {
  insight: "border-size/40 text-size",
  regenerable: "border-ok/40 text-ok",
  "clean-handles": "border-line-strong text-ink-muted",
};

const TAG_SHAPE = "whitespace-nowrap rounded-full border px-1.5 py-px font-mono text-label uppercase";

/** A tag's label; "Clean handles this" is a link to the Clean tab, where that junk is removed. */
function TagLabel({ tag }: { tag: Tag }) {
  const selectTab = useSelectTab();
  if (tag !== "clean-handles") {
    return <span className={`${TAG_SHAPE} ${TAG_TONE[tag]}`}>{strings.space.tags[tag]}</span>;
  }
  return (
    <button
      type="button"
      title={strings.space.openClean}
      onClick={() => selectTab("clean")}
      className={`${TAG_SHAPE} ${TAG_TONE[tag]} hover:border-ink-muted hover:text-ink`}
    >
      {strings.space.tags[tag]}
    </button>
  );
}
