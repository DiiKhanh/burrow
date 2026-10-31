import type { MeasureResult, SpaceItem } from "../mygo";
import { strings } from "../strings";
import { ItemSection } from "./ItemSection";
import { Total } from "./Total";
import { UnreadableNotice } from "./UnreadableNotice";

type Props = { result: MeasureResult; onOpen: (item: SpaceItem) => void };

/** The overview of the whole Mac: its total, the Insights, then the locations that add up to it. */
export function Overview({ result, onOpen }: Props) {
  return (
    <>
      <Total bytes={result.totalBytes} label={strings.space.overview.total} items={result.items} />
      <UnreadableNotice result={result} />
      {result.insights.length > 0 && (
        <ItemSection
          title={strings.space.overview.insights}
          hint={strings.space.overview.insightsHint}
          items={result.insights}
          onOpen={onOpen}
        />
      )}
      <ItemSection
        title={strings.space.overview.locations}
        hint={strings.space.count(result.items.length)}
        items={result.items}
        onOpen={onOpen}
      />
    </>
  );
}
