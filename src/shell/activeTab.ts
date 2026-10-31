import { createContext, useContext } from "react";
import type { Tab } from "./tabs";

/** Whether the panel it wraps is the tab on screen; every panel stays mounted. */
export const TabActive = createContext(false);

/** True while the caller's tab is on screen, so a tab can start work only once it opens. */
export function useTabActive(): boolean {
  return useContext(TabActive);
}

/** Puts another tab on screen; the window provides it. */
export const SelectTab = createContext<(tab: Tab) => void>(() => {});

/** Lets a tab send the user to another, as Space's "Clean handles this" does. */
export function useSelectTab(): (tab: Tab) => void {
  return useContext(SelectTab);
}
