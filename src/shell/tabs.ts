export const TABS = ["clean", "status", "space"] as const;

export type Tab = (typeof TABS)[number];

export function isTab(value: string): value is Tab {
  return (TABS as readonly string[]).includes(value);
}

/** ⌘1 opens the first tab, ⌘2 the second. */
export function tabForShortcut(event: KeyboardEvent): Tab | null {
  if (!event.metaKey || event.shiftKey || event.altKey || event.ctrlKey) return null;
  const index = Number(event.key) - 1;
  return Number.isInteger(index) ? (TABS[index] ?? null) : null;
}
