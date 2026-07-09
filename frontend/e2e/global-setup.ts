import { type ChildProcess } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FullConfig } from "@playwright/test";
import { atTime, commit, git, initRepo as initRepoAt } from "./git";
import { buildAndServe } from "./server";

const PORT = 4599;

const frontendDir = process.cwd();
const tmpDir = path.join(frontendDir, "e2e", ".tmp");

function initRepo(name: string): string {
  return initRepoAt(path.join(tmpDir, name));
}

/** repoA: a branch that is merged back -> two lanes and a merge node. */
function makeRepoA(): string {
  const dir = initRepo("repoA");
  commit(dir, "root");
  commit(dir, "main-1");
  git(dir, ["switch", "-c", "feature", "-q"]);
  commit(dir, "feature-1");
  git(dir, ["switch", "main", "-q"]);
  commit(dir, "main-2");
  git(dir, ["merge", "--no-ff", "feature", "-q", "-m", "merge feature"]);
  return dir; // 5 commits
}

/** repoB: a branch that never merges -> two lanes, no merge node. */
function makeRepoB(): string {
  const dir = initRepo("repoB");
  commit(dir, "init");
  git(dir, ["switch", "-c", "topic", "-q"]);
  commit(dir, "topic-1");
  git(dir, ["switch", "main", "-q"]);
  commit(dir, "main-1");
  return dir; // 3 commits
}

/** repoC: linear, used by the add/remove test (not served initially). */
function makeRepoC(): string {
  const dir = initRepo("repoC");
  commit(dir, "one");
  commit(dir, "two");
  return dir; // 2 commits
}

/**
 * repoD: a feature merged back only after many commits on main, so the
 * merge-to-parent edge spans many rows (not served initially).
 */
function makeRepoD(): string {
  const dir = initRepo("repoD");
  const t = 1_700_000_000;
  commit(dir, "root", t);
  git(dir, ["switch", "-c", "feature", "-q"]);
  commit(dir, "feature-1", t + 10);
  git(dir, ["switch", "main", "-q"]);
  for (let i = 1; i <= 10; i++) {
    commit(dir, `main-${i}`, t + 10 + i * 10);
  }
  git(
    dir,
    ["merge", "--no-ff", "feature", "-q", "-m", "merge feature"],
    atTime(t + 200),
  );
  return dir; // 13 commits
}

let server: ChildProcess | undefined;

export default async function globalSetup(_config: FullConfig) {
  // Fresh fixtures every run.
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  const repoA = makeRepoA();
  const repoB = makeRepoB();
  const repoC = makeRepoC();
  const repoD = makeRepoD();

  // Serve repoA and repoB; repoC is added by a test.
  server = await buildAndServe(PORT, [repoA, repoB]);

  // Expose the extra fixture paths to the specs.
  writeFileSync(
    path.join(tmpDir, "fixtures.json"),
    JSON.stringify({ repoC, repoD }, null, 2),
  );

  // Returned function runs as global teardown.
  return async () => {
    server?.kill();
  };
}
