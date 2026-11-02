import type { ReactNode } from "react";
import type { MeasureResult, SpaceItem } from "../mygo";
import { strings } from "../strings";
import { ItemSection, type Picker } from "./ItemSection";
import { Total } from "./Total";
import { UnreadableNotice } from "./UnreadableNotice";

type Props = { result: MeasureResult; notice: ReactNode; onOpen: (item: SpaceItem) => void; picker: Picker };

/** The overview of the whole Mac: its total, the Insights, then the locations that add up to it. */
export function Overview({ result, notice, onOpen, picker }: Props) {
  return (
    <>
      <Total bytes={result.totalBytes} label={strings.space.overview.total} items={result.items} />
      {notice}
      <UnreadableNotice result={result} />
      {result.insights.length > 0 && (
        <ItemSection
          title={strings.space.overview.insights}
          hint={strings.space.overview.insightsHint}
          items={result.insights}
          onOpen={onOpen}
          picker={picker}
        />
      )}
      <ItemSection
        title={strings.space.overview.locations}
        hint={strings.space.count(result.items.length)}
        items={result.items}
        onOpen={onOpen}
        picker={picker}
      />
    </>
  );
}
