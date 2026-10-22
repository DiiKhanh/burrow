import * as Tabs from "@radix-ui/react-tabs";
import { type ReactNode, useEffect, useState } from "react";
import { PillTabs } from "./PillTabs";
import { isTab, TABS, type Tab, tabForShortcut } from "./tabs";

const BACKGROUND: Record<Tab, string> = {
  clean: "from-clean-top to-clean-bottom",
  status: "from-status-top to-status-bottom",
};

type Props = { panels: Record<Tab, ReactNode> };

/**
 * The whole window: the page runs under the traffic lights, the tab bar is
 * the title bar, and the background follows the tab.
 */
export function Window({ panels }: Props) {
  const [tab, setTab] = useState<Tab>("clean");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const next = tabForShortcut(event);
      if (!next) return;
      event.preventDefault();
      setTab(next);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Tabs.Root
      value={tab}
      onValueChange={(value) => {
        if (isTab(value)) setTab(value);
      }}
      className={`relative flex h-full flex-col overflow-hidden bg-linear-to-b motion-safe:transition-colors duration-500 ${BACKGROUND[tab]}`}
    >
      <header className="drag-region flex justify-center pt-12">
        <PillTabs />
      </header>
      {TABS.map((value) => (
        <Tabs.Content key={value} value={value} className="flex min-h-0 flex-1 flex-col focus:outline-none">
          {panels[value]}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
