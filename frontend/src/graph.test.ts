import { expect, test } from "vitest";
import type { GraphEdge, RepoView } from "./api";
import {
  edgePath,
  linkPath,
  nodeX,
  nodeY,
  ROW_HEIGHT,
  squashLinks,
} from "./graph";

function edge(fromLane: number, toLane: number): GraphEdge {
  return { from: "child", to: "parent", from_lane: fromLane, to_lane: toLane, color: 0 };
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

function repoWith(overrides: Partial<RepoView>): RepoView {
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
  return {
    id: "r",
    name: "r",
    path: "/r",
    head: null,
    refs: [{ name: "feature", target: "tip" }],
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

test("squashLinks route through their own virtual lane on the right", () => {
  const links = squashLinks(repoWith({}), [
    { number: 7, url: "u", branch: "feature", merge_commit: "squash" },
  ]);

  // Upper endpoint first, colored by the branch tip; the via lane sits
  // beyond the real lanes (lane_count 2 -> via 2) so the vertical run
  // cannot cross nodes or real edges.
  expect(links).toEqual([
    { fromRow: 0, fromLane: 0, toRow: 1, toLane: 1, via: 2, color: 1 },
  ]);
});

test("squashLinks skips PRs whose branch or commit left the graph", () => {
  const merged = [
    { number: 1, url: "u", branch: "gone-branch", merge_commit: "squash" },
    { number: 2, url: "u", branch: "feature", merge_commit: "not-here" },
  ];
  expect(squashLinks(repoWith({}), merged)).toEqual([]);

  // A remote-only ref does not count as a surviving local branch.
  const remoteOnly = repoWith({
    refs: [{ name: "feature", target: "tip", remote: "origin" }],
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
