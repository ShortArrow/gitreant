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
  /** Add an empty commit to the current branch, optionally as another author
   *  (a GitHub noreply email resolves to an avatar without any API call). */
  | { commit: string; author?: string; email?: string }
  /** Merge a branch (--no-ff) into the current branch. */
  | { merge: string; message?: string }
  /** Point a remote-tracking ref (default remote "origin") at a branch tip. */
  | { track: string; remote?: string }
  /** Tag the current HEAD. */
  | { tag: string }
  /** Stand up a bare origin beside the repo and push everything so far: the
   *  branches and tags that exist now get their remote chips, and anything
   *  committed later counts as unpushed (a drawer indicator). */
  | { publish: true }
  /** Stash an untracked scratch file (folds to one node; the internals
   *  toggle reveals the dashed helper structure). */
  | { stash: string }
  /** Vendor another scenario as a submodule at `submodule`, rewound `behind`
   *  commits so a later `bump` really moves the pointer. Follow with a
   *  `commit` step to record the gitlink. */
  | { submodule: string; of: string; behind?: number }
  /** Fast-forward the submodule at this path to its upstream tip. Follow
   *  with a `commit` step to record the new pointer. */
  | { bump: string }
  /** Leave an untracked file behind: the dirty drawer indicator. */
  | { dirty: string };

export type Scenario = {
  /** Directory name — shown as the repository name in the UI. */
  name: string;
  /** Author shown next to each commit (steps can override per commit). */
  author: string;
  /** Author email; a GitHub noreply address gives the commits an avatar. */
  email?: string;
  /** Serve this repository in the UI (default). Submodule upstreams set
   *  false: they appear only as a correlation region, not a drawer entry. */
  serve?: boolean;
  steps: Step[];
};

/** Number of rows the scenario shows (commits, merges, and folded stashes). */
export function commitCount(scenario: Scenario): number {
  return scenario.steps.filter(
    (s) => "commit" in s || "merge" in s || "stash" in s,
  ).length;
}

/** The Octocat's noreply address: a real avatar with no network lookup. */
const OCTOCAT = {
  author: "The Octocat",
  email: "583231+octocat@users.noreply.github.com",
};

/** The submodule's upstream: vendored by `featured`, not shown in the drawer. */
export const engine: Scenario = {
  name: "engine",
  author: "Sora",
  serve: false,
  steps: [
    { commit: "feat: renderer core with a fixed timestep", ...OCTOCAT },
    { commit: "perf: batch draw calls per material" },
  ],
};

/** The repository the screenshot focuses on: lanes, merges, split badges, a
 * folded stash, a submodule correlation region, and drawer indicators. */
export const featured: Scenario = {
  name: "aurora",
  author: "Sora",
  steps: [
    { commit: "chore: scaffold project", ...OCTOCAT },
    { commit: "feat: initial CLI entry point" },
    { submodule: "libs/engine", of: "engine", behind: 1 },
    { commit: "feat: vendor the engine as a submodule", ...OCTOCAT },
    { branch: "feature/graph" },
    { commit: "feat(graph): topological lane layout", ...OCTOCAT },
    { commit: "feat(graph): stable colors per branch", ...OCTOCAT },
    { switch: "main" },
    { commit: "docs: add README" },
    { branch: "fix/config" },
    { commit: "fix(config): respect XDG config dir" },
    { switch: "main" },
    { bump: "libs/engine" },
    { commit: "chore: bump engine for the batched draw calls" },
    { merge: "fix/config", message: "merge fix/config" },
    { merge: "feature/graph", message: "merge feature/graph" },
    { commit: "release: v0.2.0" },
    { tag: "v0.2.0" },
    // Everything above is on the remote: split badges for origin/main and
    // the v0.2.0 tag chip. Everything below stays local-only.
    { publish: true },
    { branch: "feature/sse" },
    { commit: "feat(sse): live update events", ...OCTOCAT },
    { commit: "feat(sse): reconnect with backoff", ...OCTOCAT },
    { switch: "main" },
    { commit: "fix: clamp the camera pitch at the poles" },
    { tag: "v0.3.0-rc" },
    { stash: "shadow mapping experiment" },
    { dirty: "ideas.txt" },
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

/** Build order matters: submodule upstreams come before their consumers. */
export const scenarios: Scenario[] = [engine, featured, sidekick];
