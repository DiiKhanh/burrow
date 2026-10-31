import type { MeasureResult, SpaceItem } from "../mygo";
import { strings } from "../strings";
import { ItemSection } from "./ItemSection";
import { Total } from "./Total";
import { UnreadableNotice } from "./UnreadableNotice";

type Props = { name: string; result: MeasureResult; onOpen: (item: SpaceItem) => void };

/** One measured folder: its total, what it holds, then its largest files anywhere below. */
export function Folder({ name, result, onOpen }: Props) {
  const largestFiles = result.largestFiles ?? [];
  return (
    <>
      <Total bytes={result.totalBytes} label={strings.space.folder.total} items={result.items} />
      <UnreadableNotice result={result} />
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
      {largestFiles.length > 0 && (
        <ItemSection
          title={strings.space.folder.largestFiles(name)}
          hint={strings.space.folder.largestFilesHint}
          items={largestFiles}
          onOpen={onOpen}
          detail={(file) => relativeFolder(result.target.path ?? "", file.path)}
        />
      )}
    </>
  );
}

/** The folder path lies in, relative to folder: "Projects/app" for folder/Projects/app/file; "" when directly in it. */
function relativeFolder(folder: string, path: string): string {
  const prefix = folder.endsWith("/") ? folder : `${folder}/`;
  if (!path.startsWith(prefix)) return "";
  const rel = path.slice(prefix.length);
  const end = rel.lastIndexOf("/");
  return end < 0 ? "" : rel.slice(0, end);
}
