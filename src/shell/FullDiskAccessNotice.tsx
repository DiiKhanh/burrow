import { useState } from "react";
import { Privacy, type SettingsPane } from "../mygo";
import { strings } from "../strings";
import { Notice } from "./Notice";

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
    <Notice
      label={strings.fullDiskAccess.label}
      action={strings.fullDiskAccess.action}
      onAction={open}
      ink={outcome ? OUTCOME_INK[outcome] : undefined}
    >
      {/* The next step replaces the explanation, so the notice never grows past two lines. */}
      {outcome ? NEXT_STEP[outcome](retryStep) : strings.fullDiskAccess.explanation}
    </Notice>
  );
}
