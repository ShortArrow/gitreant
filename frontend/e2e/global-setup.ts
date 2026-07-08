import { spawn, type ChildProcess } from "node:child_process";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FullConfig } from "@playwright/test";

const PORT = 4599;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const frontendDir = process.cwd();
const projectRoot = path.resolve(frontendDir, "..");
const tmpDir = path.join(frontendDir, "e2e", ".tmp");
const binary = path.join(
  projectRoot,
  "target",
  "debug",
  process.platform === "win32" ? "gitreant.exe" : "gitreant",
);

/** Run a git command in `dir` with a fixed identity and no signing. */
function git(dir: string, args: string[]) {
  execFileSync("git", args, {
    cwd: dir,
    stdio: "ignore",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Tester",
      GIT_AUTHOR_EMAIL: "tester@example.com",
      GIT_COMMITTER_NAME: "Tester",
      GIT_COMMITTER_EMAIL: "tester@example.com",
    },
  });
}

function commit(dir: string, message: string) {
  git(dir, ["commit", "--allow-empty", "-q", "-m", message]);
}

function initRepo(name: string): string {
  const dir = path.join(tmpDir, name);
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
  return dir;
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

async function waitForServer(timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/ping`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("gitreant server did not start in time");
}

let server: ChildProcess | undefined;

export default async function globalSetup(_config: FullConfig) {
  // Fresh fixtures every run.
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  const repoA = makeRepoA();
  const repoB = makeRepoB();
  const repoC = makeRepoC();

  // Build the current frontend and the debug binary that serves it.
  execFileSync("pnpm", ["run", "build"], {
    cwd: frontendDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  execFileSync("cargo", ["build", "-q"], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (!existsSync(binary)) {
    throw new Error(`gitreant binary not found at ${binary}`);
  }

  // Serve repoA and repoB; repoC is added by a test.
  server = spawn(binary, ["--no-open", "--port", String(PORT), repoA, repoB], {
    stdio: "ignore",
  });
  await waitForServer(15_000);

  // Expose the extra fixture path to the specs.
  writeFileSync(
    path.join(tmpDir, "fixtures.json"),
    JSON.stringify({ repoC }, null, 2),
  );

  // Returned function runs as global teardown.
  return async () => {
    server?.kill();
  };
}
