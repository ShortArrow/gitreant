/**
 * Declarative branch-structure scenarios for the README screenshot.
 *
 * Edit `scenarios` to change what the screenshot shows: each scenario becomes
 * a real git repository built step by step, so any branch/merge topology can
 * be described without touching git plumbing. Regenerate with `pnpm screenshot`.
 */

export type Step =
  /** Create a branch at the current HEAD (or at `from`) and switch to it. */
  | { branch: string; from?: string }
  /** Switch to an existing branch. */
  | { switch: string }
  /** Add an empty commit with this message to the current branch. */
  | { commit: string }
  /** Merge a branch (--no-ff) into the current branch. */
  | { merge: string; message?: string }
  /** Point a remote-tracking ref (default remote "origin") at a branch tip. */
  | { track: string; remote?: string };

export type Scenario = {
  /** Directory name — shown as the repository name in the UI. */
  name: string;
  /** Author shown next to each commit. */
  author: string;
  steps: Step[];
};

/** Number of commits the scenario produces (commits + merge commits). */
export function commitCount(scenario: Scenario): number {
  return scenario.steps.filter((s) => "commit" in s || "merge" in s).length;
}

/** The repository the screenshot focuses on: three lanes, merges, live tips. */
export const featured: Scenario = {
  name: "aurora",
  author: "Sora",
  steps: [
    { commit: "chore: scaffold project" },
    { commit: "feat: initial CLI entry point" },
    { branch: "feature/graph" },
    { commit: "feat(graph): topological lane layout" },
    { commit: "feat(graph): stable colors per branch" },
    { switch: "main" },
    { commit: "docs: add README" },
    { branch: "fix/config" },
    { commit: "fix(config): respect XDG config dir" },
    { switch: "main" },
    { commit: "chore: bump dependencies" },
    { merge: "fix/config", message: "merge fix/config" },
    { merge: "feature/graph", message: "merge feature/graph" },
    { branch: "feature/sse" },
    { commit: "feat(sse): live update events" },
    { commit: "feat(sse): reconnect with backoff" },
    { switch: "main" },
    { commit: "release: v0.2.0" },
    { track: "main" },
  ],
};

/** A second, smaller repository so the drawer shows more than one entry. */
export const sidekick: Scenario = {
  name: "notes",
  author: "Sora",
  steps: [
    { commit: "add first note" },
    { branch: "draft" },
    { commit: "sketch outline" },
    { switch: "main" },
    { commit: "add second note" },
  ],
};

export const scenarios: Scenario[] = [featured, sidekick];
