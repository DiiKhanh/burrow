// PROTOTYPE (#55), throwaway: what `analyze --json` prints, and the Space
// rules from map #52 / ADR 0004, kept just real enough to judge the UI.

export type ScanState = "complete" | "partial" | "unavailable";

export type Entry = {
  scan_status: ScanState;
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  insight?: boolean;
  cleanable?: boolean;
  last_access?: string;
  /** Added by the prototype server: Mole prints no modification time. */
  mod_time?: string;
};

export type Measured = {
  scan_status: ScanState;
  path: string;
  overview: boolean;
  entries: Entry[] | null;
  large_files?: { name: string; path: string; size: number }[];
  total_size: number;
};

/** Where the user is: the overview (path null) or one folder. */
export type Place = { path: string | null; title: string; oldOnly?: boolean };

export type Picked = { path: string; name: string; size: number };

export type Blocked = "outside-home" | "top-level" | "clean-handles" | null;

const CLEAN_FRAGMENTS = ["/Library/Caches", "/Library/Logs", "/Library/Saved Application State", "/.Trash"];

/** Insight or folder that Clean already empties: no Move to Trash here. */
export function cleanHandles(path: string): boolean {
  return CLEAN_FRAGMENTS.some((f) => path.includes(`${f}/`) || path.endsWith(f));
}

/** ADR 0004: only under $HOME, never $HOME or its first-level folders, never Clean's ground. */
export function blocked(path: string, home: string): Blocked {
  if (!path.startsWith(`${home}/`)) return "outside-home";
  if (!path.slice(home.length + 1).includes("/")) return "top-level";
  if (cleanHandles(path)) return "clean-handles";
  return null;
}

export const BLOCKED_NOTE: Record<Exclude<Blocked, null>, string> = {
  "outside-home": "Outside your home folder: Reveal only",
  "top-level": "Top-level folder: open it to pick inside",
  "clean-handles": "Clean handles this",
};

const DAY = 86_400_000;

/** Old Downloads (90d+): Burrow filters Downloads itself, so the totals match. */
export function isOld(entry: Entry, days = 90): boolean {
  if (!entry.mod_time) return false;
  return Date.now() - Date.parse(entry.mod_time) > days * DAY;
}

export function tildify(path: string, home: string): string {
  return path === home ? "~" : path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}
