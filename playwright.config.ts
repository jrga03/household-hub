import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Tests isolate their data via the [E2E] prefix + service-role cleanup, so
  // they can run in parallel; 1 worker serialized the whole suite (TEST-01).
  workers: process.env.CI ? 3 : undefined,
  reporter: [["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:4173", // Preview server
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "Mobile Safari",
      use: { ...devices["iPhone 12"] },
    },
  ],

  webServer: {
    // Builds every run, so no test sees a stale dist/ or one built without the assistant.
    command: "vite build && vite preview --port 4173 --strictPort",
    env: { VITE_ASSISTANT_URL: "https://assistant.e2e.test" },
    port: 4173,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
