import * as Checkbox from "@radix-ui/react-checkbox";
import type { GroupState } from "./selection";

type Props = {
  /** Names the checkbox for assistive technology, e.g. the group name. */
  label: string;
  state: GroupState;
  onChange: (on: boolean) => void;
};

const CHECKED: Record<GroupState, Checkbox.CheckedState> = { all: true, some: "indeterminate", none: false };

/** A junk group's checkbox: all, some or none of its items selected. Clicking a partial group selects all. */
export function TriCheckbox({ label, state, onChange }: Props) {
  return (
    <Checkbox.Root
      aria-label={label}
      checked={CHECKED[state]}
      onCheckedChange={(checked) => onChange(checked !== false)}
      className="grid size-4.5 shrink-0 place-items-center rounded-check border border-line-strong bg-surface-sunken outline-none motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-size ticked:border-pill ticked:bg-pill"
    >
      <Checkbox.Indicator className="text-pill-ink">
        {state === "some" ? <DashIcon /> : <CheckIcon />}
      </Checkbox.Indicator>
    </Checkbox.Root>
  );
}

function CheckIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 6.2 5 8.6l4.5-5" />
    </svg>
  );
}

function DashIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 12 12"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M3 6h6" />
    </svg>
  );
}
