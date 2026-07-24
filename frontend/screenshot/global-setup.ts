import { type ChildProcess } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import type { FullConfig } from "@playwright/test";
import { buildAndServe } from "../e2e/server";
import { buildScenario } from "./build";
import { scenarios } from "./scenario";

const PORT = 4600;
const START_EPOCH = 1_750_000_000;

const tmpDir = path.join(process.cwd(), "screenshot", ".tmp");

let server: ChildProcess | undefined;

export default async function globalSetup(_config: FullConfig) {
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  // Build everything (submodule upstreams first), but only serve the
  // scenarios meant for the drawer.
  const repos = scenarios.map(
    (s) => [s, buildScenario(tmpDir, s, START_EPOCH)] as const,
  );
  server = await buildAndServe(
    PORT,
    repos.filter(([s]) => s.serve !== false).map(([, dir]) => dir),
  );

  return async () => {
    server?.kill();
  };
}
