import { defineConfig } from "vitest/config";

// Unit tests for pure frontend functions only; Playwright owns e2e/*.spec.ts.
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
