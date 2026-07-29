import type {
  CommitView,
  GraphEdge,
  MergedPullRequestView,
  RepoView,
  SubmoduleGraph,
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
 * A path from a child commit to one of its parents. Straight when both sit
 * in the same lane. Lane-crossing edges run vertically in the branch's own
 * lane and bend only at the junction: fork edges bend at the parent (the
 * corridor down the child's lane is held by the layout), merge edges bend at
 * the merge commit (the corridor down the parent's lane is reserved). Never
 * diagonal across rows.
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
  if (edge.fork) {
    const yBend = y2 - ROW_HEIGHT;
    const ym = (yBend + y2) / 2;
    const curve = `C${x1},${ym} ${x2},${ym} ${x2},${y2}`;
    return yBend <= y1
      ? `M${x1},${y1} ${curve}`
      : `M${x1},${y1} L${x1},${yBend} ${curve}`;
  }
  const yBend = y1 + ROW_HEIGHT;
  const ym = (y1 + yBend) / 2;
  const curve = `M${x1},${y1} C${x1},${ym} ${x2},${ym} ${x2},${yBend}`;
  return yBend >= y2 ? curve : `${curve} L${x2},${y2}`;
}

/**
 * The view to render given the stash-internals toggle. When off, a stash's
 * index/untracked helper commits are dropped and the remaining rows compacted
 * so each stash reads as a single node and no vertical gap is left behind;
 * edges into the hidden helpers fall away with them. When on, the repo is
 * returned unchanged and the helpers' dashed links are drawn.
 */
export function stashView(repo: RepoView, showInternals: boolean): RepoView {
  if (showInternals || !repo.commits.some((c) => c.stash_internal)) {
    return repo;
  }
  const visible = repo.commits.filter((c) => !c.stash_internal);
  const kept = new Set(visible.map((c) => c.id));
  const commits = visible.map((c, row) => ({ ...c, row }));
  const edges = repo.edges.filter((e) => kept.has(e.from) && kept.has(e.to));
  return { ...repo, commits, edges };
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

/** Horizontal gap between a submodule's graph region and the next one. */
export const REGION_GAP = 10;

/** One submodule graph placed as its own region left of the main graph. */
export interface SubmoduleRegion {
  graph: SubmoduleGraph;
  /** X offset of the region's own coordinate origin within the shared SVG. */
  offset: number;
  width: number;
}

/**
 * Split the drawing into one region per submodule, left of the main graph
 * (each region keeps its own lane coordinates; the offset places it). Returns
 * the regions and the main graph's X offset after them.
 */
export function submoduleRegions(graphs: SubmoduleGraph[]): {
  regions: SubmoduleRegion[];
  mainOffset: number;
} {
  let x = 0;
  const regions = graphs.map((graph) => {
    const width = graphWidth(graph.view.lane_count);
    const region = { graph, offset: x, width };
    x += width + REGION_GAP;
    return region;
  });
  return { regions, mainOffset: x };
}

/** A dashed correlation link from a superproject commit that moved a
 * submodule pointer to the submodule commit it now names, in absolute SVG
 * coordinates (the endpoints live in different regions). */
export interface SubmoduleLink {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: number;
}

/**
 * The cross-region links: for every pointer update whose superproject commit
 * is on screen and whose submodule sha is in that region's (truncated) view,
 * one dashed line between the two nodes. Updates pointing at rows outside
 * either view are dropped silently.
 */
export function submoduleCrossLinks(
  main: RepoView,
  mainOffset: number,
  regions: SubmoduleRegion[],
): SubmoduleLink[] {
  const mainById = new Map(main.commits.map((c) => [c.id, c]));
  const links: SubmoduleLink[] = [];
  for (const region of regions) {
    const subById = new Map(region.graph.view.commits.map((c) => [c.id, c]));
    for (const update of region.graph.updates) {
      const from = mainById.get(update.commit);
      const to = subById.get(update.sha);
      if (!from || !to) continue;
      links.push({
        x1: mainOffset + nodeX(from.lane),
        y1: nodeY(from.row),
        x2: region.offset + nodeX(to.lane),
        y2: nodeY(to.row),
        color: from.color,
      });
    }
  }
  return links;
}

/** The dashed cross-region path: one horizontal-leaning curve. */
export function crossPath(link: SubmoduleLink): string {
  const mx = (link.x1 + link.x2) / 2;
  return `M${link.x1},${link.y1} C${mx},${link.y1} ${mx},${link.y2} ${link.x2},${link.y2}`;
}

/**
 * Where along the chord between a dashed link's anchors a drag started —
 * the point of the line `pulledPath` pulls on. Grabs beside the chord
 * project onto it; grabs past either anchor hold that anchor.
 */
export function grabParameter(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  grabX: number,
  grabY: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const span = dx * dx + dy * dy;
  if (span === 0) return 0.5;
  const t = ((grabX - x1) * dx + (grabY - y1) * dy) / span;
  return Math.min(1, Math.max(0, t));
}

/**
 * How far the control reaches back along the chord from the held point, as a
 * fraction of the chord. Scaled by the distance to the nearer anchor, so a
 * grab beside an anchor bends tightly rather than throwing a long handle.
 */
const TAUTNESS = 0.8;

/**
 * The rubber-banded shape while a dashed link is dragged: the held point
 * (`t`, from `grabParameter`) sits on the cursor and the line runs to each
 * anchor from there, like a plucked string. Releasing the drag simply falls
 * back to the link's normal path.
 *
 * Two quadratics joined at the cursor rather than one across the whole span:
 * a single quadratic has one control point, too little freedom to both hold
 * an off-centre point on the cursor and keep its handle short — near an
 * anchor it must either fold or let the line slip out from under the cursor.
 * The `T` command mirrors the first control, so the join stays smooth.
 */
export function pulledPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  t: number,
  cursorX: number,
  cursorY: number,
): string {
  const round = (n: number) => Math.round(n * 100) / 100;
  const reach = TAUTNESS * Math.min(t, 1 - t);
  const qx = round(cursorX - reach * (x2 - x1));
  const qy = round(cursorY - reach * (y2 - y1));
  const hx = round(cursorX);
  const hy = round(cursorY);
  return `M${x1},${y1} Q${qx},${qy} ${hx},${hy} T${x2},${y2}`;
}

/** A dashed squash-merge link, routed through its own virtual lane. */
export interface SquashLink {
  fromRow: number;
  fromLane: number;
  toRow: number;
  toLane: number;
  /** The virtual lane (>= lane_count) whose vertical corridor is free. */
  via: number;
  color: number;
}

/**
 * Dashed links for squash-merged PRs: a surviving local branch tip has no
 * ancestry line to the commit its PR landed as, so one is drawn from the
 * merged-PR data.
 *
 * Routing rule: lines may cross other lines, but must not run along an
 * occupied vertical corridor or over a node. Each link's vertical run
 * prefers the endpoints' own lanes (usually the branch lane is empty above
 * its tip — no width cost, and the link hugs the branch it annotates), then
 * the nearest free lane right of the leftmost endpoint, growing rightward
 * only when everything nearer is occupied.
 */
export function squashLinks(
  repo: RepoView,
  merged: MergedPullRequestView[],
): SquashLink[] {
  const byId = new Map(repo.commits.map((c) => [c.id, c]));

  // Blocked row spans (inclusive) per lane.
  const blocked = new Map<number, [number, number][]>();
  const block = (lane: number, a: number, b: number) => {
    const spans = blocked.get(lane) ?? [];
    spans.push([Math.min(a, b), Math.max(a, b)]);
    blocked.set(lane, spans);
  };
  for (const c of repo.commits) block(c.lane, c.row, c.row);
  const rowOf = new Map(repo.commits.map((c) => [c.id, c.row]));
  for (const e of repo.edges) {
    const fromRow = rowOf.get(e.from);
    const toRow = rowOf.get(e.to);
    if (fromRow === undefined || toRow === undefined) continue;
    // Real edges run vertically in the child's lane (forks) or the parent's
    // (merges), and their bends leave that lane one row before the far
    // endpoint. Blocking the exact run — not the full span — keeps corridors
    // from being pushed a lane further right than the drawing requires.
    if (e.from_lane === e.to_lane) {
      block(e.from_lane, fromRow, toRow);
    } else if (e.fork) {
      // Vertical in the child's lane, bending at the parent.
      block(e.from_lane, fromRow, toRow - 1);
    } else {
      // Vertical in the parent's lane, bending at the merge commit.
      block(e.to_lane, fromRow + 1, toRow);
    }
  }
  const isFree = (lane: number, a: number, b: number) =>
    !(blocked.get(lane) ?? []).some(([s, e]) => s <= b && a <= e);

  // The corridor lane for a link between these endpoints: their own lanes
  // first (no width cost), then the nearest free lane right of the leftmost
  // endpoint.
  const freeLane = (
    fromLane: number,
    toLane: number,
    top: number,
    bottom: number,
  ): number => {
    for (const lane of [toLane, fromLane]) {
      if (isFree(lane, top, bottom)) return lane;
    }
    for (let lane = Math.min(fromLane, toLane) + 1; ; lane += 1) {
      if (lane === fromLane || lane === toLane) continue;
      if (isFree(lane, top, bottom)) return lane;
    }
  };

  const links: SquashLink[] = [];
  for (const pr of merged) {
    const tipId = repo.refs.find(
      (r) => !r.remote && r.name === pr.branch,
    )?.target;
    if (!tipId || tipId === pr.merge_commit) continue;
    const tip = byId.get(tipId);
    const landed = byId.get(pr.merge_commit);
    if (!tip || !landed) continue;
    const [from, to] = landed.row <= tip.row ? [landed, tip] : [tip, landed];

    let via = Math.max(from.lane, to.lane) + 1;
    if (to.row - from.row > 1) {
      const corridorTop = from.row + 1;
      const corridorBottom = to.row - 1;
      via = freeLane(from.lane, to.lane, corridorTop, corridorBottom);
      block(via, corridorTop, corridorBottom);
    }
    links.push({
      fromRow: from.row,
      fromLane: from.lane,
      toRow: to.row,
      toLane: to.lane,
      via,
      color: tip.color,
    });
  }
  return links;
}

/** Columns the drawing needs: the real lanes plus any link corridor beyond
 * them (adjacent-row links have no corridor and cost nothing). */
export function laneSpan(laneCount: number, links: SquashLink[]): number {
  return links.reduce(
    (max, link) =>
      link.toRow - link.fromRow > 1 ? Math.max(max, link.via + 1) : max,
    laneCount,
  );
}

/**
 * The dashed link's path: bend from the upper node into the via lane within
 * one row, run vertically, and bend back into the lower node within its row.
 * Adjacent rows skip the corridor and draw a single curve.
 */
export function linkPath(link: SquashLink): string {
  const x1 = nodeX(link.fromLane);
  const y1 = nodeY(link.fromRow);
  const xv = nodeX(link.via);
  const x2 = nodeX(link.toLane);
  const y2 = nodeY(link.toRow);

  if (link.toRow - link.fromRow <= 1) {
    const ym = (y1 + y2) / 2;
    return `M${x1},${y1} C${x1},${ym} ${x2},${ym} ${x2},${y2}`;
  }

  const yb1 = y1 + ROW_HEIGHT;
  const yb2 = y2 - ROW_HEIGHT;
  const ym1 = (y1 + yb1) / 2;
  const ym2 = (yb2 + y2) / 2;
  return (
    `M${x1},${y1} C${x1},${ym1} ${xv},${ym1} ${xv},${yb1} ` +
    `L${xv},${yb2} C${xv},${ym2} ${x2},${ym2} ${x2},${y2}`
  );
}
