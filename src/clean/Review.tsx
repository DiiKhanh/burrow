import { useState } from "react";
import { bytesParts, formatBytes } from "../format";
import type { JunkGroup, JunkGroupID, ScanResult } from "../mygo";
import { PillButton } from "../shell/PillButton";
import { strings } from "../strings";
import { junkGroupCatalog } from "./catalog";
import { SelectionBar } from "./SelectionBar";
import {
  defaultSelection,
  groupBytes,
  groupState,
  type Selection,
  selectedBytes,
  selectedIn,
  setGroup,
  toggleItem,
} from "./selection";
import { TriCheckbox } from "./TriCheckbox";

type Props = {
  result: ScanResult;
  onScanAgain: () => void;
  /** Starts Clean with the selected junk item ids. */
  onClean: (ids: string[]) => void;
};

/** Step 2: pick the junk groups and junk items to clean. */
export function Review({ result, onScanAgain, onClean }: Props) {
  const [selection, setSelection] = useState<Selection>(() => defaultSelection(result));
  const [hovered, setHovered] = useState<JunkGroupID | null>(null);
  const shares = result.groups.map((group) => ({ id: group.id, bytes: selectedBytes(group, selection) }));
  const total = shares.reduce((sum, share) => sum + share.bytes, 0);
  const { value, unit } = bytesParts(total);

  return (
    <>
      <div className="w-full">
        <p className="tabular font-bold text-metric leading-10">
          {value} <span className="text-ink-muted text-subhead">{strings.clean.review.selected(unit)}</span>
        </p>
        <SelectionBar shares={shares} total={total} hovered={hovered} onHover={setHovered} />
      </div>
      <ul
        aria-label={strings.clean.review.groups}
        className="w-full flex-1 divide-y divide-line overflow-y-auto rounded-card border border-line bg-surface"
      >
        {result.groups.map((group) => (
          <GroupRow
            key={group.id}
            group={group}
            selection={selection}
            hovered={hovered === group.id}
            onHover={setHovered}
            onSelectGroup={(on) => setSelection((current) => setGroup(current, group, on))}
            onToggleItem={(itemId) => setSelection((current) => toggleItem(current, itemId))}
          />
        ))}
      </ul>
      <div className="flex w-full items-center justify-between">
        <button type="button" onClick={onScanAgain} className="text-ink-muted text-note hover:text-ink">
          {strings.clean.review.scanAgain}
        </button>
        <PillButton disabled={selection.size === 0} onClick={() => onClean([...selection])}>
          {strings.clean.review.clean(selection.size)}
        </PillButton>
      </div>
    </>
  );
}

type GroupRowProps = {
  group: JunkGroup;
  selection: Selection;
  hovered: boolean;
  onHover: (id: JunkGroupID | null) => void;
  onSelectGroup: (on: boolean) => void;
  onToggleItem: (itemId: string) => void;
};

function GroupRow({ group, selection, hovered, onHover, onSelectGroup, onToggleItem }: GroupRowProps) {
  const [open, setOpen] = useState(false);
  const { name, description, dot } = junkGroupCatalog[group.id];
  return (
    <li
      onMouseEnter={() => onHover(group.id)}
      onMouseLeave={() => onHover(null)}
      className={hovered ? "bg-surface-raised" : undefined}
    >
      {/* The expand button stretches over the whole row; the checkbox sits above it. */}
      <div className="relative flex items-center gap-3 px-4 py-3">
        <span className="relative z-10 flex">
          <TriCheckbox label={name} state={groupState(group, selection)} onChange={onSelectGroup} />
        </span>
        <button
          type="button"
          aria-label={strings.clean.review.showItems(name)}
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left after:absolute after:inset-0"
        >
          <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dot}`} />
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-note">
              {name}{" "}
              <span className="tabular ml-1 font-mono text-caption text-ink-faint">
                {strings.clean.review.count(selectedIn(group, selection).length, group.items.length)}
              </span>
              {group.removalMethod === "move-to-trash" && (
                <span className="ml-2 font-normal text-caption text-ink-muted">
                  {strings.clean.review.movesToTrash}
                </span>
              )}
            </span>
            <span className="block truncate text-caption text-ink-faint">{description}</span>
          </span>
          <span className="tabular font-mono text-note text-size">{formatBytes(groupBytes(group))}</span>
          <span
            aria-hidden="true"
            className={`text-ink-faint motion-safe:transition-transform ${open ? "rotate-90" : ""}`}
          >
            {strings.clean.review.chevron}
          </span>
        </button>
      </div>
      {open && (
        <ul className="pb-2">
          {group.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-1 pr-10 pl-12 text-caption">
              <input
                type="checkbox"
                aria-label={item.path}
                checked={selection.has(item.id)}
                onChange={() => onToggleItem(item.id)}
                className="accent-pill"
              />
              <span className="flex-1 truncate font-mono text-ink-muted">{item.path}</span>
              <span className="tabular font-mono text-ink-faint">{formatBytes(item.bytes)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
