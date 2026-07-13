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

/** repoA: a branch that is merged back -> two lanes and a merge node.
 * Carries real file changes and a message body for the detail-pane test. */
function makeRepoA(): string {
  const dir = initRepo("repoA");
  writeFileSync(path.join(dir, "README.md"), "one\n");
  git(dir, ["add", "."]);
  commit(dir, "root");
  writeFileSync(path.join(dir, "README.md"), "one\ntwo\n");
  git(dir, ["add", "."]);
  commit(dir, "main-1\n\nSecond line of the description.");
  git(dir, ["switch", "-c", "feature", "-q"]);
  commit(dir, "feature-1");
  git(dir, ["switch", "main", "-q"]);
  mkdirSync(path.join(dir, "src", "lib"), { recursive: true });
  writeFileSync(path.join(dir, "src", "lib", "one.ts"), "1\n");
  writeFileSync(path.join(dir, "src", "lib", "two.ts"), "2\n");
  git(dir, ["add", "."]);
  commit(dir, "main-2");
  git(dir, ["merge", "--no-ff", "feature", "-q", "-m", "merge feature"]);
  git(dir, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
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

/** repoE: linear with one commit; the reload test commits into it live. */
function makeRepoE(): string {
  const dir = initRepo("repoE");
  commit(dir, "e-1");
  return dir; // 1 commit
}

/** repoF: a clone with a file-transport origin; the fetch test commits into
 * the origin live. Returns both paths. */
function makeRepoF(): { origin: string; clone: string } {
  const origin = initRepo("repoF-origin");
  commit(origin, "f-1");
  git(tmpDir, ["clone", "-q", "repoF-origin", "repoF"]);
  const clone = path.join(tmpDir, "repoF");
  git(clone, ["config", "commit.gpgsign", "false"]);
  return { origin, clone }; // 1 commit
}

/** repoG: its only remote is unreachable, so fetching it always fails. */
function makeRepoG(): string {
  const dir = initRepo("repoG");
  commit(dir, "g-1");
  git(dir, ["remote", "add", "origin", "gitreant-missing/remote"]);
  return dir; // 1 commit
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
  const repoE = makeRepoE();
  const repoF = makeRepoF();
  const repoG = makeRepoG();

  // Serve repoA and repoB; repoC..G are added by tests.
  server = await buildAndServe(PORT, [repoA, repoB]);

  // Expose the extra fixture paths to the specs.
  writeFileSync(
    path.join(tmpDir, "fixtures.json"),
    JSON.stringify(
      {
        repoC,
        repoD,
        repoE,
        repoF: repoF.clone,
        repoFOrigin: repoF.origin,
        repoG,
      },
      null,
      2,
    ),
  );

  // Returned function runs as global teardown.
  return async () => {
    server?.kill();
  };
}
