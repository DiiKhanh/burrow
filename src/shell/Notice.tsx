import type { ReactNode } from "react";

type Props = {
  label: string;
  action: string;
  onAction: () => void;
  /** The message's color token; muted unless it needs attention. */
  ink?: string;
  children: ReactNode;
};

/** A card with one message and the one thing to do about it. */
export function Notice({ label, action, onAction, ink = "text-ink-muted", children }: Props) {
  return (
    <section
      aria-label={label}
      className="flex w-full shrink-0 items-center gap-4 rounded-card border border-line bg-surface px-4 py-2.5"
    >
      <p role="status" className={`min-w-0 flex-1 text-balance text-caption ${ink}`}>
        {children}
      </p>
      <button
        type="button"
        onClick={onAction}
        className="shrink-0 rounded-full border border-line-strong px-3 py-1 text-caption text-ink hover:bg-surface-raised"
      >
        {action}
      </button>
    </section>
  );
}
