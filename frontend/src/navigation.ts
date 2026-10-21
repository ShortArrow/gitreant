import type { CommitView } from "./api";
import { reachableFrom } from "./graph";

/** A move of the selection, from a key (ADR 0035). */
export type KeyMove = "up" | "down" | "parent" | "child" | "diff" | "clear";

const ARROWS: Record<string, KeyMove> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowRight: "parent",
  ArrowLeft: "child",
  Enter: "diff",
  Escape: "clear",
};

const VIM: Record<string, KeyMove> = {
  k: "up",
  j: "down",
  l: "parent",
  h: "child",
};

/** The move a key stands for; `hjkl` count only with vim keys on. */
export function keyMove(key: string, vimKeys: boolean): KeyMove | null {
  return ARROWS[key] ?? (vimKeys ? VIM[key] : undefined) ?? null;
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

/** The child `←` selects: among those whose first parent is `id` if any,
 * otherwise among all, the nearest row. */
export function childToSelect(
  commits: CommitView[],
  id: string,
): string | null {
  const children = childrenOf(commits, id);
  const line = children.filter((child) => child.parents[0] === id);
  return (line[0] ?? children[0])?.id ?? null;
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
