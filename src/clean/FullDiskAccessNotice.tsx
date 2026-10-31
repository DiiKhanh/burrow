import { useState } from "react";
import { Privacy, type SettingsPane } from "../mygo";
import { Notice } from "../shell/Notice";
import { strings } from "../strings";

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

/**
 * Shown when a Scan could not read some junk groups. Burrow cannot tell
 * whether Full Disk Access is on, so it only sends the user where to grant it.
 */
export function FullDiskAccessNotice() {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const open = () => {
    Privacy.openFullDiskAccess().then(setOutcome, () => setOutcome("failed"));
  };
  return (
    <Notice
      label={strings.clean.fullDiskAccess.label}
      action={strings.clean.fullDiskAccess.action}
      onAction={open}
      ink={outcome ? OUTCOME_INK[outcome] : undefined}
    >
      {/* The next step replaces the explanation, so the notice never grows past two lines. */}
      {outcome ? NEXT_STEP[outcome] : strings.clean.fullDiskAccess.explanation}
    </Notice>
  );
}
