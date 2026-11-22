import type { CommitView, PullRequestView, RefView } from "./api";

/** The branch a commit is compared against, the revision that names it, and
 * the pull request that chose it, if one did. */
export interface Base {
  branch: string;
  revision: string;
  pr?: number;
}

/** The branch to compare `commit` against as its pull request would: the
 * base of the pull request of the nearest local branch holding it, else the
 * default branch, main, master or HEAD's branch, whichever exists first.
 * Null where none exists or the base already holds the commit, since the
 * comparison would then be empty. Only the loaded commits are walked. */
export function baseFor(
  commit: string,
  view: {
    commits: CommitView[];
    refs: RefView[];
    default_branch?: string;
    head_branch?: string;
  },
  prs: Map<string, PullRequestView>,
): Base | null {
  const parents = new Map(view.commits.map((c) => [c.id, c.parents]));
  const locals = view.refs.filter((r) => r.kind === "branch" && !r.remote);
  const revisionOf = (name: string) => {
    if (locals.some((r) => r.name === name)) return name;
    const remote = view.refs.find(
      (r) => r.kind === "branch" && r.remote && r.name === name,
    );
    return remote ? `${remote.remote}/${remote.name}` : null;
  };
  const tipOf = (revision: string) =>
    view.refs.find((r) =>
      r.remote ? `${r.remote}/${r.name}` === revision : r.name === revision,
    )?.target;

  const viaPr = locals
    .map((r) => ({ ref: r, steps: stepsTo(r.target, commit, parents) }))
    .filter(({ ref, steps }) => steps !== null && prs.get(ref.name)?.base)
    .sort((a, b) => a.steps! - b.steps!)[0];
  const chosen = viaPr
    ? { branch: prs.get(viaPr.ref.name)!.base!, pr: prs.get(viaPr.ref.name)!.number }
    : [view.default_branch, "main", "master", view.head_branch]
        .filter((name): name is string => name !== undefined)
        .map((name) => ({ branch: name, pr: undefined }))
        .find(({ branch }) => revisionOf(branch) !== null);
  if (!chosen) return null;
  const revision = revisionOf(chosen.branch);
  if (revision === null) return null;
  const tip = tipOf(revision);
  if (tip !== undefined && stepsTo(tip, commit, parents) !== null) return null;
  return chosen.pr === undefined
    ? { branch: chosen.branch, revision }
    : { branch: chosen.branch, revision, pr: chosen.pr };
}

/** How many parent steps lead from `tip` back to `commit` among the loaded
 * commits, or null where none do. */
function stepsTo(
  tip: string,
  commit: string,
  parents: Map<string, string[]>,
): number | null {
  const seen = new Set([tip]);
  let level = [tip];
  for (let steps = 0; level.length > 0; steps++) {
    if (level.includes(commit)) return steps;
    level = level
      .flatMap((id) => parents.get(id) ?? [])
      .filter((id) => !seen.has(id) && (seen.add(id), true));
  }
  return null;
}
