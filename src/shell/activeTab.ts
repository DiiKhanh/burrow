import { createContext, useContext } from "react";

/** Whether the panel it wraps is the tab on screen; every panel stays mounted. */
export const TabActive = createContext(false);

/** True while the caller's tab is on screen, so a tab can start work only once it opens. */
export function useTabActive(): boolean {
  return useContext(TabActive);
}
