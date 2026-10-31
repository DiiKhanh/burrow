import { useId } from "react";
import { TriCheckbox } from "../clean/TriCheckbox";
import { formatBytes } from "../format";
import { Space, type SpaceItem, type Tag } from "../mygo";
import { useSelectTab } from "../shell/activeTab";
import { strings } from "../strings";
import type { PickState } from "./picks";

/** How rows read and change what is picked. */
export type Picker = {
  stateOf: (item: SpaceItem) => PickState;
  onPick: (item: SpaceItem, on: boolean) => void;
};

type Props = {
  title: string;
  hint: string;
  items: readonly SpaceItem[];
  onOpen: (item: SpaceItem) => void;
  picker: Picker;
  /** A line under an item's name, such as where a largest file lies; none when it returns "". */
  detail?: (item: SpaceItem) => string;
};

/** One list of Space items, each bar a share of the section's largest. */
export function ItemSection({ title, hint, items, onOpen, picker, detail }: Props) {
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
            picker={picker}
          />
        ))}
      </ul>
    </section>
  );
}

type RowProps = {
  item: SpaceItem;
  share: number;
  detail: string;
  onOpen: (item: SpaceItem) => void;
  picker: Picker;
};

/**
 * A folder's row opens it from anywhere but its controls: the open button's
 * ::after covers the row, the checkbox rises above it, and the controls after
 * it sit above. A file's row holds the chevron's place so sizes line up, and
 * a row that cannot be picked holds the checkbox's so names do.
 */
function ItemRow({ item, share, detail, onOpen, picker }: RowProps) {
  // Its "Clean handles this" tag already says the third reason.
  const blocked = item.blocked === "clean-handles" ? null : item.blocked;
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
      <PickBox item={item} picker={picker} />
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
      {(item.tags.length > 0 || blocked) && (
        <span className="relative flex shrink-0 gap-1">
          {item.tags.map((tag) => (
            <TagLabel key={tag} tag={tag} />
          ))}
          {blocked && <BlockedLabel reason={blocked} />}
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
      <ItemSize item={item} />
      <span aria-hidden="true" className="relative w-2 text-ink-faint text-note">
        {item.opens && strings.space.chevron}
      </span>
    </li>
  );
}

/**
 * The row's checkbox; a Space item a folder above covers shows ticked and
 * stays put. One a Measure could not read has no size to promise in the
 * button, whatever the engine would let through.
 */
function PickBox({ item, picker }: { item: SpaceItem; picker: Picker }) {
  if (item.blocked || item.readState === "unavailable")
    return <span aria-hidden="true" className="relative size-4.5 shrink-0" />;
  const state = picker.stateOf(item);
  return (
    <span className="relative z-10 flex">
      <TriCheckbox
        label={strings.space.pick(item.name)}
        state={state === "covered" ? "all" : state}
        disabled={state === "covered"}
        onChange={(on) => picker.onPick(item, on)}
      />
    </span>
  );
}

const READ_NOTE = "relative shrink-0 whitespace-nowrap text-caption text-warn";

/** The item's size, a size that may be low, or in place of one, why there is none. */
function ItemSize({ item }: { item: SpaceItem }) {
  if (item.readState === "unavailable") {
    return <span className={READ_NOTE}>{strings.fullDiskAccess.unavailable}</span>;
  }
  return (
    <>
      {item.readState === "partial" && <span className={READ_NOTE}>{strings.space.partlyUnreadable}</span>}
      <span className="tabular relative font-mono text-note text-size">{formatBytes(item.bytes)}</span>
    </>
  );
}

const TAG_TONE: Record<Tag, string> = {
  insight: "border-size/40 text-size",
  regenerable: "border-ok/40 text-ok",
  "clean-handles": "border-line-strong text-ink-muted",
};

const TAG_SHAPE = "whitespace-nowrap rounded-full border px-1.5 py-px font-mono text-label uppercase";

/** Why a row has no checkbox: outside Home or at its top level. */
function BlockedLabel({ reason }: { reason: Exclude<SpaceItem["blocked"], "clean-handles" | null> }) {
  const { label, why } = strings.space.blocked[reason];
  return (
    <span title={why} className={`${TAG_SHAPE} border-line-strong text-ink-muted`}>
      {label}
    </span>
  );
}

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
