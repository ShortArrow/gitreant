import type {
  CommitView,
  GraphEdge,
  MergedPullRequestView,
  RepoView,
} from "./api";

/** Grid geometry shared by the SVG graph and the commit list beside it. */
export const ROW_HEIGHT = 32;
export const LANE_WIDTH = 18;
export const PADDING = 14;
export const NODE_RADIUS = 5;

/** A readable, high-contrast palette cycled by branch color index. */
const PALETTE = [
  "#4f9cff",
  "#f2762e",
  "#3fbf7f",
  "#c678dd",
  "#e5c07b",
  "#e06c75",
  "#56b6c2",
  "#98c379",
];

export function laneColor(color: number): string {
  return PALETTE[color % PALETTE.length];
}

export function nodeX(lane: number): number {
  return PADDING + lane * LANE_WIDTH;
}

export function nodeY(row: number): number {
  return row * ROW_HEIGHT + ROW_HEIGHT / 2;
}

export function graphWidth(laneCount: number): number {
  return PADDING * 2 + Math.max(0, laneCount - 1) * LANE_WIDTH;
}

export function graphHeight(commitCount: number): number {
  return commitCount * ROW_HEIGHT;
}

/**
 * A path from a child commit to one of its parents. Straight when both sit in
 * the same lane. When the edge changes lanes, it bends within the first row
 * and then runs straight down the parent's lane, never diagonally across
 * rows — the layout keeps that lane reserved for the pending parent, so the
 * vertical corridor is guaranteed free.
 */
export function edgePath(
  edge: GraphEdge,
  rowOf: Map<string, number>,
): string {
  const childRow = rowOf.get(edge.from);
  const parentRow = rowOf.get(edge.to);
  if (childRow === undefined || parentRow === undefined) {
    return "";
  }
  const x1 = nodeX(edge.from_lane);
  const y1 = nodeY(childRow);
  const x2 = nodeX(edge.to_lane);
  const y2 = nodeY(parentRow);
  if (x1 === x2) {
    return `M${x1},${y1} L${x2},${y2}`;
  }
  const yBend = y1 + ROW_HEIGHT;
  const ym = (y1 + yBend) / 2;
  const curve = `M${x1},${y1} C${x1},${ym} ${x2},${ym} ${x2},${yBend}`;
  return yBend >= y2 ? curve : `${curve} L${x2},${y2}`;
}

/** Map every commit id to its row for quick edge/parent lookups. */
export function rowIndex(commits: CommitView[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const commit of commits) {
    map.set(commit.id, commit.row);
  }
  return map;
}

export function shortId(id: string): string {
  return id.slice(0, 7);
}

/**
 * Dashed pseudo-edges for squash-merged PRs: a surviving local branch tip has
 * no ancestry line to the commit its PR landed as, so one is drawn from the
 * merged-PR data. Endpoints keep real-edge order (upper row first) and take
 * the branch tip's color.
 */
export function squashEdges(
  repo: RepoView,
  merged: MergedPullRequestView[],
): GraphEdge[] {
  const byId = new Map(repo.commits.map((c) => [c.id, c]));
  const edges: GraphEdge[] = [];
  for (const pr of merged) {
    const tipId = repo.refs.find(
      (r) => !r.remote && r.name === pr.branch,
    )?.target;
    if (!tipId || tipId === pr.merge_commit) continue;
    const tip = byId.get(tipId);
    const landed = byId.get(pr.merge_commit);
    if (!tip || !landed) continue;
    const [from, to] = landed.row <= tip.row ? [landed, tip] : [tip, landed];
    edges.push({
      from: from.id,
      to: to.id,
      from_lane: from.lane,
      to_lane: to.lane,
      color: tip.color,
    });
  }
  return edges;
}
