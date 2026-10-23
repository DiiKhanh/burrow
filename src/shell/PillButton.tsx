import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
};

/** The window's main action, e.g. "Start scan": a light pill floating on the gradient. */
export function PillButton({ children, onClick, disabled }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full bg-pill px-6 py-2.5 font-semibold text-button text-pill-ink shadow-pill motion-safe:transition hover:brightness-95 disabled:opacity-40 disabled:shadow-none disabled:hover:brightness-100"
    >
      {children}
    </button>
  );
}
