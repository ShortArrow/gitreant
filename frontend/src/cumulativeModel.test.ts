import { expect, test } from "vitest";
import { UNCOMMITTED_ID, type CommitView } from "./api";
import {
  chartLayout,
  cumulative,
  nearest,
  niceTicks,
  pointsBetween,
  rangeStart,
  stepPath,
  timesUnder,
  tipPlace,
  withinRange,
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

test("a point across the plot maps back to its time", () => {
  const sums = cumulative(history, "merge");
  const layout = chartLayout(sums, { width: 400, height: 200 });
  const { plot } = layout;
  const first = sums.points[0].time;
  const last = sums.points.at(-1)!.time;
  expect(layout.timeAt(plot.left)).toBeCloseTo(first);
  expect(layout.timeAt(plot.right)).toBeCloseTo(last);
  expect(layout.timeAt((plot.left + plot.right) / 2)).toBeCloseTo(
    (first + last) / 2,
  );
  // Outside the plot it holds at the ends.
  expect(layout.timeAt(0)).toBeCloseTo(first);
  expect(layout.timeAt(10_000)).toBeCloseTo(last);
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

test("the times drawn within a few pixels of an x", () => {
  // Over a long span, commits a second apart fall on the same pixel.
  const history = [
    commit("c", ["b"], 100_000, { added: 1, deleted: 0 }),
    commit("b", ["a"], 1, { added: 1, deleted: 0 }),
    commit("a", [], 0, { added: 1, deleted: 0 }),
  ];
  const sums = cumulative(history, "c");
  const layout = chartLayout(sums, { width: 400, height: 200 });
  const under = timesUnder(layout, layout.xs[0]);
  expect(pointsBetween(sums.points, under).map((p) => p.commit.id)).toEqual([
    "b",
    "a",
  ]);
  const last = timesUnder(layout, layout.xs[2]);
  expect(pointsBetween(sums.points, last).map((p) => p.commit.id)).toEqual([
    "c",
  ]);
});

test("the points between two times, both included, newest first", () => {
  const sums = cumulative(history, "merge");
  expect(
    pointsBetween(sums.points, { from: 200, to: 400 }).map((p) => p.commit.id),
  ).toEqual(["merge", "m1"]);
});

test("the tip sits beside the cursor, toward the room the chart has", () => {
  const size = { width: 400, height: 200 };
  expect(tipPlace(100, 50, size)).toEqual({ left: 108, top: 58 });
  expect(tipPlace(300, 150, size)).toEqual({ right: 108, bottom: 58 });
});

/** Unix seconds at a local date and hour. */
function local(year: number, month: number, day: number, hours = 0): number {
  return new Date(year, month - 1, day, hours).getTime() / 1000;
}

test("a range reaches back its length from the newest commit, by the calendar", () => {
  const end = local(2026, 10, 22, 9);
  expect(rangeStart(end, "all")).toBe(-Infinity);
  expect(rangeStart(end, "5y")).toBe(local(2021, 10, 22, 9));
  expect(rangeStart(end, "1y")).toBe(local(2025, 10, 22, 9));
  expect(rangeStart(end, "6m")).toBe(local(2026, 4, 22, 9));
  expect(rangeStart(end, "3m")).toBe(local(2026, 7, 22, 9));
  expect(rangeStart(end, "1m")).toBe(local(2026, 9, 22, 9));
});

test("within a range, the sums start from zero at its first commit", () => {
  const sums = cumulative(history, "merge");
  // root (+20 −0) at 100, m1 (+10 −4) at 200, merge (+5 −1) at 400.
  const range = withinRange(sums, 150);
  expect(
    range.points.map((p) => [p.commit.id, p.added, p.deleted, p.net]),
  ).toEqual([
    ["m1", 10, 4, 6],
    ["merge", 15, 5, 10],
  ]);
  expect(withinRange(sums, -Infinity)).toEqual(sums);
});

test("only the range's commits still being counted are counting", () => {
  const sums = cumulative(
    [commit("b", ["a"], 200, { added: 1, deleted: 0 }), commit("a", [], 100)],
    "b",
  );
  expect(sums.counting).toBe(1);
  expect(withinRange(sums, 150).counting).toBe(0);
});
