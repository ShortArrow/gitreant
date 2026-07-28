import { expect, test } from "vitest";
import type { GraphEdge, RepoView } from "./api";
import {
  crossPath,
  edgePath,
  graphWidth,
  laneSpan,
  linkPath,
  nodeX,
  nodeY,
  pulledPath,
  REGION_GAP,
  ROW_HEIGHT,
  squashLinks,
  stashView,
  submoduleCrossLinks,
  submoduleRegions,
} from "./graph";

function edge(fromLane: number, toLane: number, fork = false): GraphEdge {
  return {
    from: "child",
    to: "parent",
    from_lane: fromLane,
    to_lane: toLane,
    color: 0,
    fork,
  };
}

const rows = (childRow: number, parentRow: number) =>
  new Map([
    ["child", childRow],
    ["parent", parentRow],
  ]);

test("same-lane edges are straight vertical lines", () => {
  expect(edgePath(edge(0, 0), rows(0, 3))).toBe("M14,16 L14,112");
});

test("adjacent-row cross-lane edges are a single curve", () => {
  const path = edgePath(edge(0, 1), rows(0, 1));
  expect(path).toMatch(/^M14,16 C/);
  expect(path).not.toContain(" L");
});

test("long cross-lane edges bend within one row, then run vertically", () => {
  const path = edgePath(edge(0, 1), rows(0, 5));
  const match = /^M14,16 C\S+ \S+ (\d+),(\d+) L(\d+),(\d+)$/.exec(path);
  expect(match).not.toBeNull();
  const [, xBend, yBend, x2, y2] = match!.map(Number);
  expect(yBend - 16).toBe(ROW_HEIGHT);
  expect(x2).toBe(xBend);
  expect(y2).toBeGreaterThan(yBend);
});

test("edges to commits outside the graph draw nothing", () => {
  expect(edgePath(edge(0, 1), new Map([["child", 0]]))).toBe("");
});

test("fork edges run down their own lane and bend at the parent", () => {
  const path = edgePath(edge(1, 0, true), rows(0, 5));
  const x1 = 14 + 18;
  // Vertical in the child's lane down to one row above the parent, then a
  // curve into the parent's circle.
  const match = /^M(\d+),(\d+) L(\d+),(\d+) C\S+ \S+ (\d+),(\d+)$/.exec(path);
  expect(match).not.toBeNull();
  const [, mx, , lx, ly, cx, cy] = match!.map(Number);
  expect(mx).toBe(x1);
  expect(lx).toBe(x1);
  expect(cy - ly).toBe(ROW_HEIGHT);
  expect(cx).toBe(14);
});

test("adjacent-row fork edges are a single curve", () => {
  const path = edgePath(edge(1, 0, true), rows(0, 1));
  expect(path).toMatch(/^M32,16 C/);
  expect(path).not.toContain(" L");
});

const commit = (id: string, row: number, lane: number, color: number) => ({
  id,
  row,
  lane,
  color,
  parents: [],
  summary: id,
  author: "T",
  time: 0,
});

function repoWith(overrides: Partial<RepoView>): RepoView {
  return {
    id: "r",
    name: "r",
    path: "/r",
    total: 3,
    head: null,
    refs: [{ name: "feature", target: "tip", kind: "branch" }],
    commits: [
      commit("squash", 0, 0, 0),
      commit("tip", 1, 1, 1),
      commit("root", 2, 0, 0),
    ],
    edges: [],
    lane_count: 2,
    ...overrides,
  };
}

test("squashLinks pick the first lane free over their row range", () => {
  const links = squashLinks(repoWith({}), [
    { number: 7, url: "u", branch: "feature", merge_commit: "squash" },
  ]);

  // Upper endpoint first, colored by the branch tip. Crossing other lines
  // is fine; only the vertical corridor must be free — the first candidate
  // right of both endpoints works here.
  expect(links).toEqual([
    { fromRow: 0, fromLane: 0, toRow: 1, toLane: 1, via: 2, color: 1 },
  ]);
});

test("squashLinks reuse a free endpoint lane instead of drifting right", () => {
  // The tip's lane (1) holds "mid" inside the corridor, but the landed
  // commit's own lane (0) is empty between the endpoints — the link runs
  // straight down it rather than opening a lane to the right.
  const repo = repoWith({
    lane_count: 4,
    refs: [{ name: "feature", target: "tip", kind: "branch" }],
    commits: [
      commit("squash", 0, 0, 0),
      commit("mid", 2, 1, 1),
      commit("tip", 4, 1, 1),
      commit("root", 5, 0, 0),
    ],
  });
  const links = squashLinks(repo, [
    { number: 7, url: "u", branch: "feature", merge_commit: "squash" },
  ]);
  expect(links[0].via).toBe(0);
});

test("squashLinks run down the tip's own lane when it is free", () => {
  // The spine (lane 0) is occupied by main's own line, but the branch lane
  // is empty above its tip: the corridor takes the tip's lane and the
  // drawing stays exactly as wide as the real graph.
  const repo = repoWith({
    lane_count: 3,
    refs: [{ name: "feature", target: "tip", kind: "branch" }],
    commits: [
      commit("squash", 0, 0, 0),
      commit("m1", 1, 0, 0),
      commit("m2", 2, 0, 0),
      commit("tip", 4, 2, 2),
      commit("root", 5, 0, 0),
    ],
    edges: [
      { from: "squash", to: "m1", from_lane: 0, to_lane: 0, color: 0, fork: false },
      { from: "m1", to: "m2", from_lane: 0, to_lane: 0, color: 0, fork: false },
      { from: "m2", to: "root", from_lane: 0, to_lane: 0, color: 0, fork: false },
    ],
  });
  const links = squashLinks(repo, [
    { number: 7, url: "u", branch: "feature", merge_commit: "squash" },
  ]);
  expect(links[0].via).toBe(2);
  expect(laneSpan(repo.lane_count, links)).toBe(3);
});

test("squashLinks skip lanes whose corridor is blocked", () => {
  // Nodes occupy both endpoint lanes and lane 2 inside the corridor, so
  // every nearer candidate is rejected and the corridor lands on lane 3.
  const repo = repoWith({
    lane_count: 3,
    commits: [
      commit("squash", 0, 0, 0),
      commit("b0", 1, 0, 0),
      commit("b1", 2, 1, 1),
      commit("b2", 3, 2, 2),
      commit("tip", 4, 1, 1),
      commit("root", 5, 0, 0),
    ],
  });
  const links = squashLinks(repo, [
    { number: 7, url: "u", branch: "feature", merge_commit: "squash" },
  ]);
  expect(links[0].via).toBe(3);
});

test("squashLinks share a lane when their row ranges do not overlap", () => {
  const repo = repoWith({
    lane_count: 2,
    refs: [
      { name: "feature", target: "tip", kind: "branch" },
      { name: "other", target: "tip2", kind: "branch" },
    ],
    commits: [
      commit("squash", 0, 0, 0),
      commit("tip", 3, 1, 1),
      commit("squash2", 4, 0, 0),
      commit("tip2", 7, 1, 1),
      commit("root", 8, 0, 0),
    ],
  });
  const links = squashLinks(repo, [
    { number: 1, url: "u", branch: "feature", merge_commit: "squash" },
    { number: 2, url: "u", branch: "other", merge_commit: "squash2" },
  ]);
  // Both corridors fit in the tips' own free lane, one below the other.
  expect(links.map((l) => l.via)).toEqual([1, 1]);
});

test("squashLinks stack overlapping corridors on separate lanes", () => {
  const repo = repoWith({
    lane_count: 2,
    refs: [
      { name: "feature", target: "tip", kind: "branch" },
      { name: "other", target: "tip2", kind: "branch" },
    ],
    commits: [
      commit("squash", 0, 0, 0),
      commit("squash2", 1, 0, 0),
      commit("tip", 6, 1, 1),
      commit("tip2", 7, 1, 1),
      commit("root", 8, 0, 0),
    ],
  });
  const links = squashLinks(repo, [
    { number: 1, url: "u", branch: "feature", merge_commit: "squash" },
    { number: 2, url: "u", branch: "other", merge_commit: "squash2" },
  ]);
  expect(links[0].via).not.toBe(links[1].via);
});

test("squashLinks block only an edge's vertical run, not its bend rows", () => {
  // A fork edge (child in lane 1, parent at row 3 lane 0) runs vertically in
  // lane 1 over rows 0..2 and BENDS AWAY at row 3. A corridor needing only
  // row 3 fits in lane 1 — over-blocking the bend row used to push it off
  // by one lane.
  const forked = repoWith({
    lane_count: 2,
    commits: [
      commit("forker", 0, 1, 1),
      commit("squash", 2, 0, 0),
      commit("parent", 3, 0, 0),
      commit("tip", 4, 0, 0),
    ],
    edges: [
      { from: "forker", to: "parent", from_lane: 1, to_lane: 0, color: 1, fork: true },
    ],
  });
  const forkLinks = squashLinks(forked, [
    { number: 1, url: "u", branch: "feature", merge_commit: "squash" },
  ]);
  expect(forkLinks[0].via).toBe(1);

  // Symmetrically, a merge edge's parent-lane run starts one row BELOW the
  // merge commit (row 1 here holds no run yet), so a corridor for row 1
  // fits in lane 1.
  const merged = repoWith({
    lane_count: 2,
    commits: [
      commit("squash", 0, 0, 0),
      commit("merger", 1, 0, 0),
      commit("tip", 2, 0, 0),
      commit("parent2", 4, 1, 1),
    ],
    edges: [
      { from: "merger", to: "parent2", from_lane: 0, to_lane: 1, color: 1, fork: false },
    ],
  });
  const mergeLinks = squashLinks(merged, [
    { number: 2, url: "u", branch: "feature", merge_commit: "squash" },
  ]);
  expect(mergeLinks[0].via).toBe(1);
});

test("squashLinks skips PRs whose branch or commit left the graph", () => {
  const merged = [
    { number: 1, url: "u", branch: "gone-branch", merge_commit: "squash" },
    { number: 2, url: "u", branch: "feature", merge_commit: "not-here" },
  ];
  expect(squashLinks(repoWith({}), merged)).toEqual([]);

  // A remote-only ref does not count as a surviving local branch.
  const remoteOnly = repoWith({
    refs: [{ name: "feature", target: "tip", remote: "origin", kind: "branch" }],
  });
  expect(
    squashLinks(remoteOnly, [
      { number: 3, url: "u", branch: "feature", merge_commit: "squash" },
    ]),
  ).toEqual([]);
});

test("stashView folds stash internals away and compacts the rows", () => {
  // A stash S (row 0) with an index helper Idx (row 1) and untracked Unt
  // (row 2), then a real commit C (row 3). With internals hidden the two
  // helpers drop out, C moves up to row 1, and edges touching a helper go.
  const repo = repoWith({
    commits: [
      { ...commit("S", 0, 0, 0), parents: ["C", "Idx", "Unt"] },
      { ...commit("Idx", 1, 1, 1), stash_internal: true, parents: ["C"] },
      { ...commit("Unt", 2, 2, 2), stash_internal: true },
      commit("C", 3, 0, 0),
    ],
    edges: [
      { from: "S", to: "C", from_lane: 0, to_lane: 0, color: 0, fork: false },
      {
        from: "S",
        to: "Idx",
        from_lane: 0,
        to_lane: 1,
        color: 1,
        fork: false,
        dashed: true,
      },
    ],
    total: 4,
  });

  const hidden = stashView(repo, false);
  expect(hidden.commits.map((c) => c.id)).toEqual(["S", "C"]);
  expect(hidden.commits.map((c) => c.row)).toEqual([0, 1]);
  // The dashed helper edge is gone; the real ancestry edge survives.
  expect(hidden.edges).toEqual([
    { from: "S", to: "C", from_lane: 0, to_lane: 0, color: 0, fork: false },
  ]);

  // Revealed: the repo is returned unchanged so the dashed links can render.
  expect(stashView(repo, true)).toBe(repo);
});

test("submoduleRegions place each graph left of the main graph", () => {
  const sub = (id: string, lanes: number) => ({
    name: id,
    path: `/p/${id}`,
    view: repoWith({ id, lane_count: lanes }),
    updates: [],
  });
  const { regions, mainOffset } = submoduleRegions([sub("a", 1), sub("b", 2)]);

  expect(regions[0].offset).toBe(0);
  expect(regions[0].width).toBe(graphWidth(1));
  expect(regions[1].offset).toBe(graphWidth(1) + REGION_GAP);
  expect(mainOffset).toBe(graphWidth(1) + REGION_GAP + graphWidth(2) + REGION_GAP);

  // No submodules: the main graph starts at the left edge.
  expect(submoduleRegions([]).mainOffset).toBe(0);
});

test("submoduleCrossLinks connect pointer updates across regions", () => {
  // Main commit "tip" (row 1, lane 1) moved the pointer to sub commit "s1"
  // (row 1, lane 0); an update to an unknown commit or sha is dropped.
  const main = repoWith({});
  const region = {
    graph: {
      name: "lib",
      path: "/p/lib",
      view: repoWith({
        commits: [commit("s0", 0, 0, 0), commit("s1", 1, 0, 0)],
      }),
      updates: [
        { commit: "tip", sha: "s1" },
        { commit: "gone", sha: "s1" },
        { commit: "tip", sha: "not-there" },
      ],
    },
    offset: 0,
    width: graphWidth(1),
  };
  const mainOffset = graphWidth(1) + REGION_GAP;

  const links = submoduleCrossLinks(main, mainOffset, [region]);
  expect(links).toEqual([
    {
      x1: mainOffset + nodeX(1),
      y1: nodeY(1),
      x2: nodeX(0),
      y2: nodeY(1),
      color: 1,
    },
  ]);

  // The path is a single curve between the two endpoints.
  const path = crossPath(links[0]);
  expect(path.startsWith(`M${links[0].x1},${links[0].y1}`)).toBe(true);
  expect(path.endsWith(`${links[0].x2},${links[0].y2}`)).toBe(true);
});

test("pulledPath anchors the endpoints and passes through the cursor", () => {
  const path = pulledPath(10, 20, 110, 40, 70, 90);
  const match = /^M10,20 Q(-?[\d.]+),(-?[\d.]+) 110,40$/.exec(path);
  expect(match).not.toBeNull();
  const [, qx, qy] = match!.map(Number);
  // Quadratic midpoint = 0.25*start + 0.5*control + 0.25*end == the cursor.
  expect(0.25 * 10 + 0.5 * qx + 0.25 * 110).toBeCloseTo(70);
  expect(0.25 * 20 + 0.5 * qy + 0.25 * 40).toBeCloseTo(90);
});

test("linkPath bends into the via lane, runs vertically, and bends back", () => {
  const path = linkPath({
    fromRow: 0,
    fromLane: 0,
    toRow: 5,
    toLane: 1,
    via: 2,
    color: 1,
  });

  const xv = nodeX(2);
  // Vertical corridor in the via lane between the two bends.
  expect(path).toContain(`L${xv},${nodeY(5) - ROW_HEIGHT}`);
  expect(path.startsWith(`M${nodeX(0)},${nodeY(0)}`)).toBe(true);
  expect(path.endsWith(`${nodeX(1)},${nodeY(5)}`)).toBe(true);
});

test("linkPath degenerates to one curve for adjacent rows", () => {
  const path = linkPath({
    fromRow: 0,
    fromLane: 0,
    toRow: 1,
    toLane: 1,
    via: 2,
    color: 1,
  });
  expect(path).not.toContain(" L");
});
