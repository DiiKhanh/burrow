import { defineConfig } from "mygo-cli";

export default defineConfig({
  name: "Burrow",
  identifier: "io.github.diikhanh.burrow",
  version: "0.1.0",
  copyright: "© 2026 DiiKhanh. GPL-3.0-or-later.",
  // `mygo dev` runs devCommand and loads devUrl; `mygo build` runs
  // buildCommand and embeds frontendDist into the app.
  devUrl: "http://localhost:5173",
  devCommand: "bun run dev:web",
  buildCommand: "bun run build:web",
  frontendDist: "dist",
  bindings: "src/mygo.ts",
  out: "build",
  macos: { minimumSystemVersion: "13.0" },
});
