import { useState } from "react";
import { Privacy, type SettingsPane } from "../mygo";
import { strings } from "../strings";

/** What the user still has to do after the button, by what opened. */
type Outcome = SettingsPane | "failed";

const NEXT_STEP: Record<Outcome, (retryStep: string) => string> = {
  "full-disk-access": strings.fullDiskAccess.opened,
  "privacy-security": strings.fullDiskAccess.fallback,
  failed: () => strings.fullDiskAccess.failed,
};

const OUTCOME_INK: Record<Outcome, string> = {
  "full-disk-access": "text-ink",
  "privacy-security": "text-ink",
  failed: "text-danger",
};

type Props = {
  /** What to do once access is on, ending the next step: "scan again". */
  retryStep: string;
};

/**
 * Shown when a Scan or a Measure could not read something. Burrow cannot tell
 * whether Full Disk Access is on, so it only sends the user where to grant it.
 */
export function FullDiskAccessNotice({ retryStep }: Props) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const open = () => {
    Privacy.openFullDiskAccess().then(setOutcome, () => setOutcome("failed"));
  };
  return (
    <section
      aria-label={strings.fullDiskAccess.label}
      className="flex w-full shrink-0 items-center gap-4 rounded-card border border-line bg-surface px-4 py-2.5"
    >
      {/* The next step replaces the explanation, so the notice never grows past two lines. */}
      <p
        role="status"
        className={`min-w-0 flex-1 text-balance text-caption ${outcome ? OUTCOME_INK[outcome] : "text-ink-muted"}`}
      >
        {outcome ? NEXT_STEP[outcome](retryStep) : strings.fullDiskAccess.explanation}
      </p>
      <button
        type="button"
        onClick={open}
        className="shrink-0 rounded-full border border-line-strong px-3 py-1 text-caption text-ink hover:bg-surface-raised"
      >
        {strings.fullDiskAccess.action}
      </button>
    </section>
  );
}
