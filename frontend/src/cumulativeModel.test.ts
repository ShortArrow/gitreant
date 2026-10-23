import { expect, test } from "vitest";
import { UNCOMMITTED_ID, type CommitView } from "./api";
import {
  chartLayout,
  cumulative,
  nearest,
  niceTicks,
  stepPath,
} from "./cumulativeModel";

function commit(
  id: string,
  parents: string[],
  time: number,
  stat?: { added: number; deleted: number },
): CommitView {
  return {
    id,
    row: 0,
    lane: 0,
    color: 0,
    parents,
    summary: id,
    author: "a",
    time,
    stat,
  };
}

// main: root - m1 - merge(m1, side) ; side branches off root.
const history = [
  { ...commit(UNCOMMITTED_ID, ["merge"], 0), uncommitted: 2 },
  commit("merge", ["m1", "side"], 400, { added: 5, deleted: 1 }),
  commit("side", ["root"], 300, { added: 5, deleted: 1 }),
  commit("m1", ["root"], 200, { added: 10, deleted: 4 }),
  commit("root", [], 100, { added: 20, deleted: 0 }),
];

test("sums HEAD's first-parent chain, oldest first", () => {
  const sums = cumulative(history, "merge");
  expect(sums.points.map((p) => p.commit.id)).toEqual(["root", "m1", "merge"]);
  expect(sums.points.map((p) => [p.added, p.deleted, p.net])).toEqual([
    [20, 0, 20],
    [30, 4, 26],
    [35, 5, 30],
  ]);
  expect(sums.counting).toBe(0);
});

test("a commit not counted yet adds nothing and is still counting", () => {
  const partly = history.map((c) =>
    c.id === "m1" ? { ...c, stat: undefined } : c,
  );
  const sums = cumulative(partly, "merge");
  expect(sums.points.map((p) => p.net)).toEqual([20, 20, 24]);
  expect(sums.counting).toBe(1);
});

test("time never runs backwards along the chain", () => {
  const skewed = history.map((c) => (c.id === "m1" ? { ...c, time: 50 } : c));
  const sums = cumulative(skewed, "merge");
  expect(sums.points.map((p) => p.time)).toEqual([100, 100, 400]);
});

test("no HEAD, no sums", () => {
  expect(cumulative(history, null).points).toEqual([]);
});

test("ticks fall on round numbers within the range", () => {
  expect(niceTicks(0, 87)).toEqual([0, 20, 40, 60, 80]);
  expect(niceTicks(-30, 120)).toEqual([0, 50, 100]);
  expect(niceTicks(0, 3)).toEqual([0, 1, 2, 3]);
  expect(niceTicks(5, 5)).toEqual([5]);
});

test("a step line changes only at each point", () => {
  expect(
    stepPath([
      { x: 0, y: 10 },
      { x: 5, y: 20 },
      { x: 8, y: 15 },
    ]),
  ).toBe("M0,10 H5 V20 H8 V15");
  expect(stepPath([])).toBe("");
});

test("the layout spans the plot from the first time to the last", () => {
  const sums = cumulative(history, "merge");
  const layout = chartLayout(sums, { width: 400, height: 200 });
  const { plot } = layout;
  expect(layout.xs[0]).toBeCloseTo(plot.left);
  expect(layout.xs[2]).toBeCloseTo(plot.right);
  // The largest sum, 35 lines added, at the top. Deleted lines run down
  // from zero, so the 5 deleted by the end are at the bottom.
  expect(layout.added).toMatch(new RegExp(`V${plot.top}$`));
  expect(layout.deleted).toMatch(new RegExp(`V${plot.bottom}$`));
  expect(layout.zeroY).toBeLessThan(plot.bottom);
  expect(layout.zeroY).toBeGreaterThan(plot.top);
  expect(layout.ticks.map((t) => t.value)).toEqual([0, 10, 20, 30]);
  for (const tick of layout.ticks) {
    expect(tick.y).toBeLessThanOrEqual(plot.bottom);
    expect(tick.y).toBeGreaterThanOrEqual(plot.top);
  }
});

test("a single commit still lays out", () => {
  const sums = cumulative([commit("a", [], 7, { added: 1, deleted: 0 })], "a");
  const layout = chartLayout(sums, { width: 400, height: 200 });
  expect(Number.isFinite(layout.xs[0])).toBe(true);
});

test("the nearest commit to a time", () => {
  const sums = cumulative(history, "merge");
  expect(nearest(sums.points, 0)).toBe(0);
  expect(nearest(sums.points, 160)).toBe(1);
  expect(nearest(sums.points, 310)).toBe(2);
  expect(nearest(sums.points, 1000)).toBe(2);
  expect(nearest([], 5)).toBeNull();
});
