import { expect, test } from "vitest";
import type { GraphEdge } from "./api";
import { edgePath, ROW_HEIGHT } from "./graph";

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
