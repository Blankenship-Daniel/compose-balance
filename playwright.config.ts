import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests: the app in a real browser, at desktop and phone widths. `npm run e2e`.
 * The server runs on its own port, with Vite's dependency cache rebuilt, so the lattice kit is
 * never served from a stale cache.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:5199",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npx vite --port 5199 --strictPort --force",
    url: "http://localhost:5199",
    reuseExistingServer: false,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } }, testIgnore: /phone/ },
    // Under the stylesheet's 640px phone breakpoint, but the board still over its own 520px one.
    { name: "between", use: { ...devices["Desktop Chrome"], viewport: { width: 600, height: 900 } }, testMatch: /responsive|visual|shears|layout/ },
    { name: "phone", use: { ...devices["Pixel 7"] }, testMatch: /responsive|phone|visual|shears|layout/ },
    { name: "dark", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, colorScheme: "dark" }, testMatch: /visual/ },
  ],
});
