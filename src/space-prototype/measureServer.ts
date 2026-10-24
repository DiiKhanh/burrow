// PROTOTYPE (#55), throwaway: dev-server endpoint that runs Mole's bundled
// analyzer for real, so the Space variants show this Mac's own data.
// Nothing is written anywhere; results are cached in memory only.
import { execFile } from "node:child_process";
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const analyzer = fileURLToPath(new URL("../../resources/darwin-arm64/mole/bin/analyze-go", import.meta.url));

/** Mole prints last access only; Old Downloads needs modification time, so add it. */
function withModTimes(json: string): string {
  const data = JSON.parse(json) as { entries?: { path: string; mod_time?: string }[] | null };
  for (const e of data.entries ?? []) {
    try {
      e.mod_time = statSync(e.path).mtime.toISOString();
    } catch {
      // gone or unreadable: no age, so not "old"
    }
  }
  return JSON.stringify(data);
}

export function prototypeMeasureServer(): Plugin {
  const cache = new Map<string, Promise<string>>();
  const measure = (path: string | null, fresh: boolean) => {
    const key = path ?? "<overview>";
    if (fresh) cache.delete(key);
    let pending = cache.get(key);
    if (!pending) {
      pending = new Promise<string>((resolve, reject) => {
        execFile(analyzer, path ? ["--json", path] : ["--json"], { maxBuffer: 256 << 20 }, (err, stdout, stderr) =>
          err ? reject(new Error(stderr || err.message)) : resolve(withModTimes(stdout)),
        );
      });
      pending.catch(() => cache.delete(key));
      cache.set(key, pending);
    }
    return pending;
  };
  return {
    name: "burrow:prototype-measure",
    configureServer(server) {
      server.middlewares.use("/__prototype/home", (_req, res) => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ home: homedir() }));
      });
      server.middlewares.use("/__prototype/measure", (req, res) => {
        const url = new URL(req.url ?? "", "http://x");
        const path = url.searchParams.get("path");
        measure(path, url.searchParams.has("fresh")).then(
          (json) => {
            res.setHeader("content-type", "application/json");
            res.end(json);
          },
          (err: Error) => {
            res.statusCode = 500;
            res.end(err.message);
          },
        );
      });
    },
  };
}
