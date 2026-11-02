import type { ReactNode } from "react";
import type { MeasureResult, MeasureTarget, SpaceItem } from "../mygo";
import { strings } from "../strings";
import { ItemSection, type Picker } from "./ItemSection";
import { Total } from "./Total";
import { UnreadableNotice } from "./UnreadableNotice";

type Props = {
  name: string;
  result: MeasureResult;
  notice: ReactNode;
  onOpen: (item: SpaceItem) => void;
  picker: Picker;
};

/** One measured folder: its total, what it holds, then its largest files anywhere below. */
export function Folder({ name, result, notice, onOpen, picker }: Props) {
  const largestFiles = result.largestFiles ?? [];
  const { olderThanDays } = result.target;
  return (
    <>
      <Total bytes={result.totalBytes} label={totalLabel(result.target)} items={result.items} />
      {notice}
      <UnreadableNotice result={result} />
      {result.items.length > 0 ? (
        <ItemSection
          title={strings.space.folder.contents}
          hint={strings.space.count(result.items.length)}
          items={result.items}
          onOpen={onOpen}
          picker={picker}
        />
      ) : (
        <p className="px-1 text-ink-muted text-note">
          {olderThanDays ? strings.space.folder.emptyOlderThan(olderThanDays) : strings.space.folder.empty}
        </p>
      )}
      {largestFiles.length > 0 && (
        <ItemSection
          title={strings.space.folder.largestFiles(name)}
          hint={strings.space.folder.largestFilesHint}
          items={largestFiles}
          onOpen={onOpen}
          picker={picker}
          detail={(file) => relativeFolder(result.target.path ?? "", file.path)}
        />
      )}
    </>
  );
}

/** What the big number counts: a target from the overview may list only part of its folder. */
function totalLabel({ excludeLibrary, olderThanDays }: MeasureTarget): (unit: string) => string {
  if (olderThanDays) return (unit) => strings.space.folder.totalOlderThan(unit, olderThanDays);
  return excludeLibrary ? strings.space.folder.totalWithoutLibrary : strings.space.folder.total;
}

/** The folder path lies in, relative to folder: "Projects/app" for folder/Projects/app/file; "" when directly in it. */
function relativeFolder(folder: string, path: string): string {
  const prefix = folder.endsWith("/") ? folder : `${folder}/`;
  if (!path.startsWith(prefix)) return "";
  const rel = path.slice(prefix.length);
  const end = rel.lastIndexOf("/");
  return end < 0 ? "" : rel.slice(0, end);
}
