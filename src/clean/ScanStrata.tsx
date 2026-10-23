import { formatBytes } from "../format";
import type { JunkGroupID, ScanProgress } from "../mygo";
import { strings } from "../strings";
import { JUNK_GROUP_ORDER, junkGroupCatalog } from "./catalog";

type Props = {
  progress: ScanProgress | null;
  groupBytes: Partial<Record<JunkGroupID, number>>;
};

const PENDING_OPACITY = [
  "opacity-95",
  "opacity-90",
  "opacity-85",
  "opacity-80",
  "opacity-75",
  "opacity-70",
  "opacity-65",
  "opacity-60",
] as const;

export function ScanStrata({ progress, groupBytes }: Props) {
  return (
    <div className="w-full overflow-hidden rounded-card border border-line bg-surface-sunken">
      {JUNK_GROUP_ORDER.map((id, index) => (
        <StrataLayer key={id} id={id} index={index} bytes={groupBytes[id]} progress={progress} />
      ))}
    </div>
  );
}

function StrataLayer({
  id,
  index,
  bytes,
  progress,
}: {
  id: JunkGroupID;
  index: number;
  bytes: number | undefined;
  progress: ScanProgress | null;
}) {
  const active = progress?.groupId === id;
  return (
    <div
      className={`relative flex h-9 items-center gap-3 border-line px-4 text-body not-last:border-b motion-safe:transition-colors ${
        active ? "bg-surface-raised" : `bg-surface-sunken ${PENDING_OPACITY[index]}`
      }`}
    >
      {active && (
        <progress
          aria-label={strings.clean.groupProgress(junkGroupCatalog[id].name)}
          className="scan-layer-progress absolute inset-0 h-full w-full"
          max={1}
          value={progress.fraction ?? undefined}
        />
      )}
      <span className={`relative flex-1 ${active || bytes !== undefined ? "text-ink" : "text-ink-faint"}`}>
        {junkGroupCatalog[id].name}
      </span>
      <span className="tabular relative font-mono text-label text-size">
        {bytes === undefined ? strings.clean.pendingSize : formatBytes(bytes)}
      </span>
    </div>
  );
}
