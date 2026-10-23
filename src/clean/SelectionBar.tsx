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
  /** All selected bytes: the sum of shares. */
  total: number;
  /** The group under the pointer, shown at full strength while the rest dim. */
  hovered: JunkGroupID | null;
  onHover: (id: JunkGroupID | null) => void;
};

/**
 * How the selection splits across junk groups, one colored segment per
 * group. Unselected groups keep a zero-width segment, so segments grow and
 * shrink rather than pop in and out.
 */
export function SelectionBar({ shares, total, hovered, onHover }: Props) {
  const widths = shares.map((share) => (total > 0 ? (share.bytes / total) * WIDTH : 0));

  return (
    <svg
      role="img"
      aria-label={strings.clean.review.breakdown}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="mt-4 block h-3 w-full overflow-hidden rounded-full bg-surface-sunken"
    >
      {shares.map((share, index) => {
        const { name, fill } = junkGroupCatalog[share.id];
        const dimmed = hovered !== null && hovered !== share.id;
        // Each segment starts where the ones before it end.
        const x = widths.slice(0, index).reduce((sum, width) => sum + width, 0);
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: hover only mirrors the list row, which carries the controls.
          <rect
            key={share.id}
            x={coordinate(x)}
            y={0}
            width={coordinate(widths[index] ?? 0)}
            height={HEIGHT}
            className={`selection-segment ${fill} ${dimmed ? "opacity-35" : ""}`}
            onMouseEnter={() => onHover(share.id)}
            onMouseLeave={() => onHover(null)}
          >
            <title>{strings.clean.review.segment(name, formatBytes(share.bytes))}</title>
          </rect>
        );
      })}
    </svg>
  );
}
