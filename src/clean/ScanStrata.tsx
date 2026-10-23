import { formatBytes } from "../format";
import type { JunkGroupID, ScanProgress } from "../mygo";
import { strings } from "../strings";
import { JUNK_GROUP_ORDER, junkGroupCatalog } from "./catalog";
import { pendingOpacity, STRATA_LAYER } from "./strata";

type Props = {
  progress: ScanProgress | null;
  groupBytes: Partial<Record<JunkGroupID, number>>;
};

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
    <div className={`${STRATA_LAYER} ${active ? "bg-surface-raised" : `bg-surface-sunken ${pendingOpacity(index)}`}`}>
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
