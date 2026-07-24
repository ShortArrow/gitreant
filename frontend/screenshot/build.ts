import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { atTime, commit, git, initRepo } from "../e2e/git";
import type { Scenario } from "./scenario";

/** Seconds between consecutive commits, keeping topological order stable. */
const STEP_SECONDS = 60;

/**
 * Materialize a scenario as a real git repository under `baseDir`.
 * Commits are empty and timestamped deterministically from `startEpoch`.
 * Submodule upstreams referenced by `{ submodule }` steps must have been
 * built (as siblings under `baseDir`) before the consuming scenario.
 */
export function buildScenario(
  baseDir: string,
  scenario: Scenario,
  startEpoch: number,
): string {
  const dir = initRepo(path.join(baseDir, scenario.name));
  const authorEnv = (name?: string, email?: string) => ({
    GIT_AUTHOR_NAME: name ?? scenario.author,
    GIT_COMMITTER_NAME: name ?? scenario.author,
    ...(email ?? scenario.email
      ? {
          GIT_AUTHOR_EMAIL: (email ?? scenario.email)!,
          GIT_COMMITTER_EMAIL: (email ?? scenario.email)!,
        }
      : {}),
  });
  let epoch = startEpoch;

  for (const step of scenario.steps) {
    if ("branch" in step) {
      const args = ["switch", "-q", "-c", step.branch];
      if (step.from) args.push(step.from);
      git(dir, args);
    } else if ("switch" in step) {
      git(dir, ["switch", "-q", step.switch]);
    } else if ("track" in step) {
      git(dir, [
        "update-ref",
        `refs/remotes/${step.remote ?? "origin"}/${step.track}`,
        step.track,
      ]);
    } else if ("tag" in step) {
      git(dir, ["tag", step.tag]);
    } else if ("publish" in step) {
      // A bare clone beside the repo becomes "origin": it carries every ref
      // that exists right now, so those get remote chips (ls-remote works
      // against a local path) while later commits count as unpushed.
      const origin = `${dir}-origin`;
      git(dir, ["clone", "-q", "--bare", ".", origin]);
      git(dir, ["remote", "add", "origin", origin]);
      git(dir, ["fetch", "-q", "origin"]);
      git(dir, ["branch", "-q", "-u", "origin/main", "main"]);
    } else if ("stash" in step) {
      writeFileSync(path.join(dir, "scratch.txt"), "wip\n");
      git(dir, ["stash", "push", "-q", "-u", "-m", step.stash], {
        ...atTime(epoch),
        ...authorEnv(),
      });
      epoch += STEP_SECONDS;
    } else if ("submodule" in step) {
      git(dir, [
        "-c",
        "protocol.file.allow=always",
        "submodule",
        "add",
        "-q",
        `../${step.of}`,
        step.submodule,
      ]);
      const sub = path.join(dir, step.submodule);
      git(sub, ["config", "commit.gpgsign", "false"]);
      const behind = step.behind ?? 1;
      if (behind > 0) {
        git(sub, ["switch", "-q", "--detach", `HEAD~${behind}`]);
        git(dir, ["add", step.submodule]);
      }
    } else if ("bump" in step) {
      const sub = path.join(dir, step.bump);
      git(sub, ["switch", "-q", "main"]);
      git(dir, ["add", step.bump]);
    } else if ("dirty" in step) {
      writeFileSync(path.join(dir, step.dirty), "todo\n");
    } else if ("commit" in step) {
      for (const [file, content] of Object.entries(step.write ?? {})) {
        const target = path.join(dir, file);
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, content);
        git(dir, ["add", file]);
      }
      commit(dir, step.commit, epoch, authorEnv(step.author, step.email));
      epoch += STEP_SECONDS;
    } else {
      git(
        dir,
        ["merge", "--no-ff", "-q", "-m", step.message ?? `merge ${step.merge}`, step.merge],
        { ...atTime(epoch), ...authorEnv() },
      );
      epoch += STEP_SECONDS;
    }
  }
  return dir;
}
