import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

/** Run a git command in `dir` with a fixed identity and no signing. */
export function git(
  dir: string,
  args: string[],
  env: Record<string, string> = {},
) {
  execFileSync("git", args, {
    cwd: dir,
    stdio: "ignore",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Tester",
      GIT_AUTHOR_EMAIL: "tester@example.com",
      GIT_COMMITTER_NAME: "Tester",
      GIT_COMMITTER_EMAIL: "tester@example.com",
      ...env,
    },
  });
}

/** Env pinning both git dates to `epoch`, for deterministic topological order. */
export function atTime(epoch: number): Record<string, string> {
  const date = `@${epoch} +0000`;
  return { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
}

export function commit(
  dir: string,
  message: string,
  epoch?: number,
  env: Record<string, string> = {},
) {
  git(dir, ["commit", "--allow-empty", "-q", "-m", message], {
    ...(epoch === undefined ? {} : atTime(epoch)),
    ...env,
  });
}

/** Create an empty repository at `dir` with a `main` branch and no signing.
 * The identity is also written to the repo config: server-side merges create
 * commits, and CI runners have no global git config. */
export function initRepo(dir: string): string {
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
  git(dir, ["config", "user.name", "Tester"]);
  git(dir, ["config", "user.email", "tester@example.com"]);
  return dir;
}
