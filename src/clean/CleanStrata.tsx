import type { CleanProgress, JunkGroupID } from "../mygo";
import { strings } from "../strings";
import { junkGroupCatalog } from "./catalog";
import { pendingOpacity, STRATA_LAYER } from "./strata";

/** One Strata layer of a Clean: a junk group and how many of its items were selected. */
export type CleanLayer = { id: JunkGroupID; selected: number };

type Props = {
  layers: readonly CleanLayer[];
  progress: Partial<Record<JunkGroupID, CleanProgress>>;
  /** The group being cleaned, or null once Clean is done. */
  active: JunkGroupID | null;
};

type LayerState = "pending" | "active" | "done";

/** Clean's Strata: one layer per selected junk group, emptied top to bottom. */
export function CleanStrata({ layers, progress, active }: Props) {
  return (
    <ol className="w-full overflow-hidden rounded-card border border-line bg-surface-sunken">
      {layers.map((layer, index) => (
        <Layer
          key={layer.id}
          layer={layer}
          progress={progress[layer.id]}
          state={layerState(layer, progress[layer.id], active)}
          index={index}
        />
      ))}
    </ol>
  );
}

function layerState(layer: CleanLayer, progress: CleanProgress | undefined, active: JunkGroupID | null): LayerState {
  if (progress && progress.cleaned + progress.skipped >= layer.selected) return "done";
  return layer.id === active ? "active" : "pending";
}

const LAYER_STYLE: Record<LayerState, string> = {
  pending: "bg-surface-sunken",
  active: "bg-surface-raised",
  done: "bg-surface",
};

function Layer({
  layer,
  progress,
  state,
  index,
}: {
  layer: CleanLayer;
  progress: CleanProgress | undefined;
  state: LayerState;
  index: number;
}) {
  const { name } = junkGroupCatalog[layer.id];
  const cleaned = progress?.cleaned ?? 0;
  const skipped = progress?.skipped ?? 0;
  const fade = state === "pending" ? pendingOpacity(index) : "";
  return (
    <li className={`${STRATA_LAYER} ${LAYER_STYLE[state]} ${fade}`}>
      {state === "active" && (
        <progress
          aria-label={strings.clean.cleaning.groupProgress(name)}
          className="clean-layer-progress absolute inset-0 h-full w-full"
          max={1}
          value={(cleaned + skipped) / layer.selected}
        />
      )}
      <span aria-hidden="true" className="relative w-3 text-caption text-ok">
        {state === "done" && strings.clean.cleaning.layerDone}
      </span>
      <span className={`relative flex-1 ${state === "pending" ? "text-ink-faint" : "text-ink"}`}>{name}</span>
      {skipped > 0 && (
        <span className="relative text-caption text-warn">{strings.clean.cleaning.skipped(skipped)}</span>
      )}
      <span className="tabular relative font-mono text-label text-size">
        {strings.clean.cleaning.count(cleaned, layer.selected)}
      </span>
    </li>
  );
}
