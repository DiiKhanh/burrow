import * as Tabs from "@radix-ui/react-tabs";
import { strings } from "../strings";
import { BurrowMark } from "./BurrowMark";
import { TABS } from "./tabs";

/** The tab bar: Burrow's mark, then one pill per tab. */
export function PillTabs() {
  return (
    <Tabs.List
      aria-label={strings.tabs.label}
      className="flex items-center gap-1 rounded-full border border-line bg-surface p-1 backdrop-blur"
    >
      <span className="px-1">
        <BurrowMark />
      </span>
      {TABS.map((tab) => (
        <Tabs.Trigger
          key={tab}
          value={tab}
          className="rounded-full px-4 py-1.5 font-mono font-semibold text-ink-muted text-tab motion-safe:transition-colors hover:text-ink aria-selected:bg-pill aria-selected:text-pill-ink"
        >
          {strings.tabs[tab]}
        </Tabs.Trigger>
      ))}
    </Tabs.List>
  );
}
