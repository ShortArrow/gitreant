import { defineConfig, devices } from "@playwright/test";

// Generates the README screenshots (docs/images/) from declarative fixture
// repositories — see screenshot/scenario.ts. Run with `pnpm screenshot`.
export default defineConfig({
  testDir: "./screenshot",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./screenshot/global-setup.ts",
  use: {
    baseURL: "http://127.0.0.1:4600",
    viewport: { width: 1280, height: 560 },
    deviceScaleFactor: 2,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 560 },
        deviceScaleFactor: 2,
      },
    },
  ],
});
