/**
 * End-to-end checks for the farmer flows, run against the static web export
 * and the real Sentinel server (mock engine). `npm run e2e`.
 * Phone (390) and desktop (1280, docked sidebar) layouts both run.
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:8085", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "phone", use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
  ],
  webServer: [
    {
      command: "npm --prefix ../kilimoorbit-sentinel start",
      url: "http://localhost:4517/api/health",
      reuseExistingServer: !process.env.CI,
      env: { APEX_MOCK: "1", RATE_LIMIT_DISABLED: "1" },
      timeout: 60_000,
    },
    {
      command: "npx expo export --platform web --output-dir dist-e2e && node e2e/serve.mjs",
      url: "http://localhost:8085",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
});
