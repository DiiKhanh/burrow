import * as Checkbox from "@radix-ui/react-checkbox";
import type { GroupSelection } from "./useCleanFlow";

type Props = {
  value: GroupSelection;
  onChange: (on: boolean) => void;
  locked?: boolean;
  label: string;
};

export function TriCheckbox({ value, onChange, locked, label }: Props) {
  const checked = value === "all" ? true : value === "some" ? "indeterminate" : false;
  return (
    <Checkbox.Root
      aria-label={label}
      checked={checked}
      disabled={locked}
      onCheckedChange={(c) => onChange(c === true)}
      onClick={(e) => e.stopPropagation()}
      className="grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-line-strong bg-surface-sunken outline-none transition-colors focus-visible:ring-2 focus-visible:ring-size data-[state=checked]:border-pill data-[state=checked]:bg-pill data-[state=indeterminate]:border-pill data-[state=indeterminate]:bg-pill disabled:opacity-60"
    >
      {locked ? (
        <LockIcon />
      ) : (
        <Checkbox.Indicator className="text-pill-ink">
          {checked === "indeterminate" ? <DashIcon /> : <CheckIcon />}
        </Checkbox.Indicator>
      )}
    </Checkbox.Root>
  );
}

const CheckIcon = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 6.2 5 8.6l4.5-5" />
  </svg>
);
const DashIcon = () => (
  <svg width="10" height="10" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M3 6h6" />
  </svg>
);
const LockIcon = () => (
  <svg width="10" height="11" viewBox="0 0 10 12" fill="currentColor" className="text-ink-muted">
    <path d="M2.5 5V3.5a2.5 2.5 0 0 1 5 0V5h.5a1 1 0 0 1 1 1v4.5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h.5Zm1.2 0h2.6V3.5a1.3 1.3 0 0 0-2.6 0V5Z" />
  </svg>
);
