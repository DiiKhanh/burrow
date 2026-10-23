import { useState } from "react";
import type { SettingsPane } from "../mygo";
import { strings } from "../strings";

export type OpenFullDiskAccess = () => Promise<SettingsPane>;

/** What the user still has to do after the button, by what opened. */
type Outcome = SettingsPane | "failed";

const NEXT_STEP: Record<Outcome, string> = {
  "full-disk-access": strings.clean.fullDiskAccess.opened,
  "privacy-security": strings.clean.fullDiskAccess.fallback,
  failed: strings.clean.fullDiskAccess.failed,
};

const OUTCOME_INK: Record<Outcome, string> = {
  "full-disk-access": "text-ink",
  "privacy-security": "text-ink",
  failed: "text-danger",
};

type Props = { openFullDiskAccess: OpenFullDiskAccess };

/**
 * Shown when a Scan could not read some junk groups. Burrow cannot tell
 * whether Full Disk Access is on, so it only sends the user where to grant it.
 */
export function FullDiskAccessNotice({ openFullDiskAccess }: Props) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const open = () => {
    openFullDiskAccess().then(setOutcome, () => setOutcome("failed"));
  };
  return (
    <section
      aria-label={strings.clean.fullDiskAccess.label}
      className="flex w-full shrink-0 items-center gap-4 rounded-card border border-line bg-surface px-4 py-2.5"
    >
      {/* The next step replaces the explanation, so the notice never grows past two lines. */}
      <p role="status" className={`min-w-0 flex-1 text-caption ${outcome ? OUTCOME_INK[outcome] : "text-ink-muted"}`}>
        {outcome ? NEXT_STEP[outcome] : strings.clean.fullDiskAccess.explanation}
      </p>
      <button
        type="button"
        onClick={open}
        className="shrink-0 rounded-full border border-line-strong px-3 py-1 text-caption text-ink hover:bg-surface-raised"
      >
        {strings.clean.fullDiskAccess.action}
      </button>
    </section>
  );
}
