import { expect, test } from "vitest";
import type { GraphEdge, RepoView } from "./api";
import {
  edgePath,
  linkPath,
  nodeX,
  nodeY,
  ROW_HEIGHT,
  rowTime,
  squashLinks,
} from "./graph";

test("rowTime renders a fixed-width local timestamp", () => {
  expect(rowTime(new Date(2026, 6, 15, 9, 5))).toBe("2026-07-15 09:05");
  expect(rowTime(new Date(2023, 11, 1, 23, 59))).toBe("2023-12-01 23:59");
});

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

test("squashLinks reuse a free real lane instead of drifting right", () => {
  // lane_count 4, but lanes 2 and 3 hold nothing between the endpoints:
  // the corridor takes lane 2, not a virtual lane at 4.
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
  expect(links[0].via).toBe(2);
});

test("squashLinks skip lanes whose corridor is blocked", () => {
  // A node sits at (row 2, lane 2), so the corridor moves to lane 3.
  const repo = repoWith({
    lane_count: 3,
    commits: [
      commit("squash", 0, 0, 0),
      commit("blocker", 2, 2, 2),
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
  expect(links.map((l) => l.via)).toEqual([2, 2]);
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
