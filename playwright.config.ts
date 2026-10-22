import { defineConfig, devices } from "@playwright/test";

// The page runs in WKWebView inside the app, so the tests use WebKit.
// The dev server runs in `fake` mode: the scripted client stands in for Go.
const port = 5174;

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  projects: [{ name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1100, height: 760 } } }],
  webServer: {
    command: `bun run dev:web --mode fake --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
