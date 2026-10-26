import { expect, test } from "vitest";
import type { CommitView } from "./api";
import {
  candleBoxes,
  candlePeriod,
  candles,
  boxAt,
  byCalendar,
  byColumn,
  byTimeframe,
  periodStart,
} from "./candleModel";
import {
  chartLayout,
  cumulative,
  type CumulativePoint,
} from "./cumulativeModel";

const DAY = 86_400;

/** Unix seconds at local midnight of a date, plus `hours`. */
function at(year: number, month: number, day: number, hours = 0): number {
  return new Date(year, month - 1, day, hours).getTime() / 1000;
}

function point(time: number, net: number): CumulativePoint {
  const commit = { id: String(time) } as CommitView;
  return { commit, time, added: Math.max(net, 0), deleted: 0, net };
}

/** A point by its sums so far. */
function sums(time: number, added: number, deleted: number): CumulativePoint {
  const commit = { id: String(time) } as CommitView;
  return { commit, time, added, deleted, net: added - deleted };
}

test("the period is the shortest that keeps the candles to about sixty", () => {
  const start = at(2026, 1, 1);
  expect(candlePeriod(start, start + 30 * DAY)).toBe("day");
  expect(candlePeriod(start, start + 200 * DAY)).toBe("week");
  expect(candlePeriod(start, start + 3 * 365 * DAY)).toBe("month");
});

test("a period starts at local midnight, on Monday, or on the first", () => {
  // 2026-10-22 is a Thursday.
  const thursday = at(2026, 10, 22, 15);
  expect(periodStart(thursday, "day")).toBe(at(2026, 10, 22));
  expect(periodStart(thursday, "week")).toBe(at(2026, 10, 19));
  expect(periodStart(thursday, "month")).toBe(at(2026, 10, 1));
  // A Sunday belongs to the week that began the Monday before.
  expect(periodStart(at(2026, 10, 25, 9), "week")).toBe(at(2026, 10, 19));
});

test("past months, the period goes on to a quarter and then a year", () => {
  const start = at(2000, 1, 1);
  expect(candlePeriod(start, start + 10 * 365 * DAY)).toBe("quarter");
  expect(candlePeriod(start, start + 20 * 365 * DAY)).toBe("year");
});

test("a quarter starts in January, April, July or October, and a year on New Year's Day", () => {
  const time = at(2026, 8, 22, 15);
  expect(periodStart(time, "quarter")).toBe(at(2026, 7, 1));
  expect(periodStart(at(2026, 12, 31), "quarter")).toBe(at(2026, 10, 1));
  expect(periodStart(time, "year")).toBe(at(2026, 1, 1));
  expect(byCalendar("quarter")(time).end).toBe(at(2026, 10, 1));
  expect(byCalendar("year")(time).end).toBe(at(2027, 1, 1));
});

test("a candle opens before the period's first commit and closes after its last", () => {
  const points = [
    point(at(2026, 10, 20, 9), 10),
    point(at(2026, 10, 20, 12), 40),
    point(at(2026, 10, 20, 18), 25),
    // No commit on the 21st: no candle for it.
    point(at(2026, 10, 22, 9), 5),
  ];
  const result = candles(points, byCalendar("day"));
  expect(result.map((c) => c.start)).toEqual([
    at(2026, 10, 20),
    at(2026, 10, 22),
  ]);
  // The first opens at zero, before any commit.
  expect(result[0]).toMatchObject({ open: 0, high: 40, low: 0, close: 25 });
  // The next opens where the one before closed, and falls.
  expect(result[1]).toMatchObject({ open: 25, high: 25, low: 5, close: 5 });
  expect(result[1].end).toBe(at(2026, 10, 23));
});

test("a candle counts the lines its period added and deleted", () => {
  const points = [
    sums(at(2026, 10, 20, 9), 10, 0),
    sums(at(2026, 10, 20, 12), 30, 5),
    sums(at(2026, 10, 22, 9), 31, 25),
  ];
  const result = candles(points, byCalendar("day"));
  expect(result.map((c) => [c.added, c.deleted])).toEqual([
    [30, 5],
    [1, 20],
  ]);
});

test("candles sit inside the plot, green when they close at or above their open", () => {
  const points = [
    sums(at(2026, 10, 20, 9), 10, 0),
    sums(at(2026, 10, 21, 9), 10, 6),
  ];
  const layout = chartLayout(
    { points, counting: 0 },
    { width: 400, height: 200 },
  );
  const boxes = candleBoxes(layout, candles(points, byCalendar("day")));
  expect(boxes.map((b) => b.up)).toEqual([true, false]);
  for (const box of boxes) {
    expect(box.x - box.width / 2).toBeGreaterThanOrEqual(layout.plot.left);
    expect(box.x + box.width / 2).toBeLessThanOrEqual(layout.plot.right);
    expect(box.width).toBeGreaterThan(0);
    // The wick spans the body.
    expect(box.wickTop).toBeLessThanOrEqual(box.top);
    expect(box.wickBottom).toBeGreaterThanOrEqual(box.bottom);
  }
  // The first rises from 0 to 10: its body runs from y(10) down to y(0).
  expect(boxes[0].top).toBeCloseTo(layout.y(10));
  expect(boxes[0].bottom).toBeCloseTo(layout.y(0));
  // Its period added 10 lines: a bar from zero up to y(10).
  expect(boxes[0].addedTop).toBeCloseTo(layout.y(10));
  expect(boxes[0].deletedBottom).toBeCloseTo(layout.zeroY);
});

test("the candle of the period holding a time", () => {
  const boxes = [
    { candle: { start: 100, end: 200 } },
    { candle: { start: 300, end: 400 } },
  ];
  expect(boxAt(boxes, 150)).toBe(boxes[0]);
  expect(boxAt(boxes, 300)).toBe(boxes[1]);
  expect(boxAt(boxes, 250)).toBeUndefined();
});

/** A history of `times`, each commit adding one line, laid out 400 wide. */
function history(times: number[]) {
  const commits = times
    .map((time, i) => ({
      id: String(i),
      row: 0,
      lane: 0,
      color: 0,
      parents: i === 0 ? [] : [String(i - 1)],
      summary: String(i),
      author: "a",
      time,
      stat: { added: 1, deleted: 0 },
    }))
    .reverse() as CommitView[];
  const sums = cumulative(commits, String(times.length - 1));
  return {
    points: sums.points,
    layout: chartLayout(sums, { width: 400, height: 200 }),
  };
}

test("by commit, the commits drawn in one column make one candle, their lines added up", () => {
  // Over a long span, two commits a second apart share a column.
  const { points, layout } = history([0, 1, 100_000]);
  const result = candles(points, byColumn(layout));
  expect(result.map((c) => [c.open, c.close, c.added])).toEqual([
    [0, 2, 2],
    [2, 3, 1],
  ]);
});

test("by commit, a short history has a candle per commit", () => {
  const { points, layout } = history([0, 10, 30, 40]);
  expect(candles(points, byColumn(layout))).toHaveLength(4);
});

test("a timeframe picks how the time axis is cut", () => {
  const start = at(2026, 10, 19, 9);
  const { points, layout } = history([start, start + 3600, start + DAY]);
  // Auto keeps the shortest calendar period that fits: a day here.
  expect(candles(points, byTimeframe("auto", points, layout))).toHaveLength(2);
  expect(candles(points, byTimeframe("week", points, layout))).toHaveLength(1);
  expect(candles(points, byTimeframe("commit", points, layout))).toHaveLength(
    3,
  );
});
