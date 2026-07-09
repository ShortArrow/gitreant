import path from "node:path";
import { atTime, commit, git, initRepo } from "../e2e/git";
import type { Scenario } from "./scenario";

/** Seconds between consecutive commits, keeping topological order stable. */
const STEP_SECONDS = 60;

/**
 * Materialize a scenario as a real git repository under `baseDir`.
 * Commits are empty and timestamped deterministically from `startEpoch`.
 */
export function buildScenario(
  baseDir: string,
  scenario: Scenario,
  startEpoch: number,
): string {
  const dir = initRepo(path.join(baseDir, scenario.name));
  const author = {
    GIT_AUTHOR_NAME: scenario.author,
    GIT_COMMITTER_NAME: scenario.author,
  };
  let epoch = startEpoch;

  for (const step of scenario.steps) {
    if ("branch" in step) {
      const args = ["switch", "-q", "-c", step.branch];
      if (step.from) args.push(step.from);
      git(dir, args);
    } else if ("switch" in step) {
      git(dir, ["switch", "-q", step.switch]);
    } else if ("commit" in step) {
      commit(dir, step.commit, epoch, author);
      epoch += STEP_SECONDS;
    } else {
      git(
        dir,
        ["merge", "--no-ff", "-q", "-m", step.message ?? `merge ${step.merge}`, step.merge],
        { ...atTime(epoch), ...author },
      );
      epoch += STEP_SECONDS;
    }
  }
  return dir;
}
