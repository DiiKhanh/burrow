import { coordinate } from "../charts/geometry";
import { formatBytes } from "../format";
import type { JunkGroupID } from "../mygo";
import { strings } from "../strings";
import { junkGroupCatalog } from "./catalog";

/** The bar's drawing box; the SVG stretches it to the element's size. */
const WIDTH = 100;
const HEIGHT = 1;

export type Share = { id: JunkGroupID; bytes: number };

type Props = {
  /** Selected bytes per junk group, in list order. */
  shares: readonly Share[];
  /** The group under the pointer, shown at full strength while the rest dim. */
  focus: JunkGroupID | null;
  onFocus: (id: JunkGroupID | null) => void;
};

/** How the selection splits across junk groups, one colored segment per group. */
export function SelectionBar({ shares, focus, onFocus }: Props) {
  const total = shares.reduce((sum, share) => sum + share.bytes, 0);
  const widths = shares
    .filter((share) => share.bytes > 0)
    .map((share) => ({ share, width: (share.bytes / total) * WIDTH }));
  // Each segment starts where the ones before it end.
  const segments = widths.map((segment, index) => ({
    ...segment,
    x: widths.slice(0, index).reduce((sum, before) => sum + before.width, 0),
  }));

  return (
    <svg
      role="img"
      aria-label={strings.clean.review.share}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="mt-4 block h-3 w-full overflow-hidden rounded-full bg-surface-sunken"
    >
      {segments.map(({ share, x, width }) => {
        const { name, fill } = junkGroupCatalog[share.id];
        const dimmed = focus !== null && focus !== share.id;
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: hover only mirrors the list row, which carries the controls.
          <rect
            key={share.id}
            x={coordinate(x)}
            y={0}
            width={coordinate(width)}
            height={HEIGHT}
            className={`${fill} motion-safe:transition-opacity ${dimmed ? "opacity-35" : ""}`}
            onMouseEnter={() => onFocus(share.id)}
            onMouseLeave={() => onFocus(null)}
          >
            <title>{strings.clean.review.segment(name, formatBytes(share.bytes))}</title>
          </rect>
        );
      })}
    </svg>
  );
}
