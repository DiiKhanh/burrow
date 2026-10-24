/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { prototypeMeasureServer } from "./src/space-prototype/measureServer";

const realClient = fileURLToPath(new URL("./src/mygo.ts", import.meta.url));
const fakeClient = fileURLToPath(new URL("./src/testing/mygo.fake.ts", import.meta.url));
const fakeRuntime = fileURLToPath(new URL("./src/testing/mygo-runtime.fake.ts", import.meta.url));

/** Swaps the generated MyGo client for the scripted fake in tests and `--mode fake`. */
function fakeMyGoClient(): Plugin {
  return {
    name: "burrow:fake-mygo-client",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (source === "mygo-runtime") return fakeRuntime;
      if (importer === fakeClient) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved?.id === realClient ? fakeClient : null;
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === "fake" || mode === "test" || mode === "space" ? [fakeMyGoClient()] : []),
    // PROTOTYPE (#55): `bun run prototype:space`.
    ...(mode === "space" ? [prototypeMeasureServer()] : []),
  ],
  server: {
    // The app loads this address during `mygo dev` (devUrl in mygo.config.ts).
    port: 5173,
    strictPort: true,
    // The development app and the packaged builds are not the page's.
    watch: { ignored: ["**/.mygo/**", "**/build/**"] },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/testing/setup.ts"],
  },
}));
