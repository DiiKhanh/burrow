import type { MeasureResult, SpaceItem } from "../mygo";
import { strings } from "../strings";
import { ItemSection } from "./ItemSection";
import { Total } from "./Total";

type Props = { result: MeasureResult; onOpen: (item: SpaceItem) => void };

/** One measured folder: its total, then what it holds. */
export function Folder({ result, onOpen }: Props) {
  return (
    <>
      <Total bytes={result.totalBytes} label={strings.space.folder.total} />
      {result.items.length > 0 ? (
        <ItemSection
          title={strings.space.folder.contents}
          hint={strings.space.count(result.items.length)}
          items={result.items}
          onOpen={onOpen}
        />
      ) : (
        <p className="px-1 text-ink-muted text-note">{strings.space.folder.empty}</p>
      )}
    </>
  );
}
