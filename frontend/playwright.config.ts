import { defineConfig, devices } from "@playwright/test";

// The server (and fixture repositories) are started in global-setup; tests drive
// the real embedded SPA on loopback. Runs serially because all specs share one
// server whose repository set is mutated by the add/remove test.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  // Several flows run real subprocesses (git fetch/merge, gpg verification)
  // behind the assertions; 5s flakes on loaded machines.
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:4599",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
