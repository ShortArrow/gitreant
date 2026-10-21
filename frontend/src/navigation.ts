import type { CommitView } from "./api";
import { reachableFrom } from "./graph";

/** A move of the selection, from a key (ADR 0035). */
export type KeyMove =
  | "up"
  | "down"
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "diff"
  | "clear";

const ARROWS: Record<string, KeyMove> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Home: "top",
  End: "bottom",
  Enter: "diff",
  Escape: "clear",
};

const VIM: Record<string, KeyMove> = {
  k: "up",
  j: "down",
  h: "left",
  l: "right",
  G: "bottom",
};

/** The move a key stands for, given the key pressed just before it;
 * `hjkl`, `G` and `gg` count only with vim keys on. */
export function keyMove(
  key: string,
  vimKeys: boolean,
  previous: string | null = null,
): KeyMove | null {
  if (vimKeys && key === "g" && previous === "g") return "top";
  return ARROWS[key] ?? (vimKeys ? VIM[key] : undefined) ?? null;
}

/** The first or last loaded row; null when no row. */
export function edgeRow(
  commits: CommitView[],
  edge: "top" | "bottom",
): string | null {
  const commit = edge === "top" ? commits[0] : commits[commits.length - 1];
  return commit?.id ?? null;
}

/** The commit `delta` rows from `selected`, held at the first and last
 * rows; the first row when nothing loaded is selected, null when no row. */
export function rowStep(
  commits: CommitView[],
  selected: string | null,
  delta: number,
): string | null {
  const at = commits.findIndex((commit) => commit.id === selected);
  if (at < 0) return commits[0]?.id ?? null;
  const next = Math.min(Math.max(at + delta, 0), commits.length - 1);
  return commits[next].id;
}

/** The commit nearest `selected` in the closest lane to its left
 * (`direction` -1) or right (1): the nearest lane first, then the nearest
 * row, the upper one on a tie. `selected` itself when no lane lies that
 * way; the first row when nothing loaded is selected. */
export function laneStep(
  commits: CommitView[],
  selected: string | null,
  direction: -1 | 1,
): string | null {
  const from = commits.find((commit) => commit.id === selected);
  if (!from) return commits[0]?.id ?? null;
  const distance = (commit: CommitView) => [
    (commit.lane - from.lane) * direction,
    Math.abs(commit.row - from.row),
    commit.row,
  ];
  const best = commits
    .filter((commit) => (commit.lane - from.lane) * direction > 0)
    .reduce<CommitView | null>((nearest, commit) => {
      if (!nearest) return commit;
      const [a, b] = [distance(commit), distance(nearest)];
      const i = a.findIndex((value, k) => value !== b[k]);
      return i >= 0 && a[i] < b[i] ? commit : nearest;
    }, null);
  return (best ?? from).id;
}

/** The loaded parents of `id`, in git's order. */
export function parentsOf(commits: CommitView[], id: string): CommitView[] {
  const byId = new Map(commits.map((commit) => [commit.id, commit]));
  const commit = byId.get(id);
  if (!commit) return [];
  return commit.parents.flatMap((parent) => byId.get(parent) ?? []);
}

/** The loaded children of `id`, the nearest row first. */
export function childrenOf(commits: CommitView[], id: string): CommitView[] {
  return commits
    .filter((commit) => commit.parents.includes(id))
    .sort((a, b) => b.row - a.row);
}

/** Which of a comparison's two commits is the base: the one the other
 * reaches among the loaded commits, otherwise the selected one. */
export function compareRange(
  commits: CommitView[],
  selected: string,
  other: string,
): { base: string; target: string } {
  if (reachableFrom(commits, selected).has(other)) {
    return { base: other, target: selected };
  }
  return { base: selected, target: other };
}
