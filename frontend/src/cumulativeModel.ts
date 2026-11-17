import { UNCOMMITTED_ID, type CommitView } from "./api";

/** Whether a commit is work of its own: every commit but merges, which
 * only bring in what other commits did, stash entries and their helpers,
 * and the uncommitted row. */
export function isWork(commit: CommitView): boolean {
  return (
    commit.id !== UNCOMMITTED_ID &&
    commit.parents.length <= 1 &&
    !commit.stash &&
    !commit.stash_internal
  );
}

/** The work among `commits` that `tip` reaches, in their order; all of it
 * when `tip` is null (ADR 0086). Only the loaded commits are walked. */
export function branchCommits(
  commits: CommitView[],
  tip: string | null,
): CommitView[] {
  const work = commits.filter(isWork);
  if (tip === null) return work;
  const byId = new Map(commits.map((c) => [c.id, c]));
  const reached = new Set<string>();
  const stack = [tip];
  while (stack.length > 0) {
    const id = stack.pop()!;
    const commit = byId.get(id);
    if (reached.has(id) || commit === undefined) continue;
    reached.add(id);
    stack.push(...commit.parents);
  }
  return work.filter((c) => reached.has(c.id));
}

/** The sums after one commit of the chosen branch (ADR 0043, ADR 0086). */
export interface CumulativePoint {
  commit: CommitView;
  /** The commit time, held back from running earlier than the one before. */
  time: number;
  added: number;
  deleted: number;
  /** `added` less `deleted`: how the line count changed. */
  net: number;
}

export interface Cumulative {
  /** Oldest first. */
  points: CumulativePoint[];
  /** Commits on the chain whose counts have not arrived yet. */
  counting: number;
}

/** The lines `commits` added and deleted, each against its first parent,
 * summed by time from zero at the oldest. */
export function cumulative(commits: CommitView[]): Cumulative {
  const chain = [...commits].sort((a, b) => a.time - b.time);

  let added = 0;
  let deleted = 0;
  let time = -Infinity;
  const points = chain.map((c) => {
    added += c.stat?.added ?? 0;
    deleted += c.stat?.deleted ?? 0;
    time = Math.max(time, c.time);
    return { commit: c, time, added, deleted, net: added - deleted };
  });
  return {
    points,
    counting: chain.filter((c) => c.stat === undefined).length,
  };
}

/** How far back the chart reaches from its newest commit (ADR 0051). */
export type Range = "all" | "5y" | "1y" | "6m" | "3m" | "1m";

const RANGE_MONTHS: Record<Exclude<Range, "all">, number> = {
  "5y": 60,
  "1y": 12,
  "6m": 6,
  "3m": 3,
  "1m": 1,
};

/** The first time `range` holds, reaching back from `end` by the local
 * calendar; -Infinity for all. */
export function rangeStart(end: number, range: Range): number {
  if (range === "all") return -Infinity;
  const date = new Date(end * 1000);
  date.setMonth(date.getMonth() - RANGE_MONTHS[range]);
  return date.getTime() / 1000;
}

/** The sums of the commits from `start` on, summed from zero at the first
 * of them, and how many of those are still being counted. */
export function withinRange(sums: Cumulative, start: number): Cumulative {
  if (start === -Infinity) return sums;
  const first = sums.points.findIndex((p) => p.time >= start);
  if (first < 0) return { points: [], counting: 0 };
  const base = sums.points[first - 1];
  const points = sums.points.slice(first).map((p) => {
    const added = p.added - (base?.added ?? 0);
    const deleted = p.deleted - (base?.deleted ?? 0);
    return { ...p, added, deleted, net: added - deleted };
  });
  return {
    points,
    counting: points.filter((p) => p.commit.stat === undefined).length,
  };
}

/** Round-numbered values (1, 2 or 5 times a power of ten apart) within
 * `min`..`max`, about `count` intervals of them. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (max <= min) return [min];
  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const scaled = raw / magnitude;
  const step =
    magnitude * (scaled < 1.5 ? 1 : scaled < 3 ? 2 : scaled < 7 ? 5 : 10);
  const ticks: number[] = [];
  for (let k = Math.ceil(min / step); k <= Math.floor(max / step); k++) {
    ticks.push(k * step + 0);
  }
  return ticks;
}

/** An SVG path through `points` that holds each value until the next. */
export function stepPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return [`M${first.x},${first.y}`, ...rest.map((p) => `H${p.x} V${p.y}`)].join(
    " ",
  );
}

/** Room around the plot: the ticks' labels left, the dates below, and the
 * legend above. */
const MARGIN = { left: 56, right: 16, top: 36, bottom: 28 };

export interface ChartLayout {
  /** Where the lines are drawn, inside the axes' labels. */
  plot: { left: number; right: number; top: number; bottom: number };
  /** The x of each point. */
  xs: number[];
  added: string;
  deleted: string;
  net: string;
  zeroY: number;
  ticks: { value: number; y: number }[];
  /** The time at `x`, held within the first and last times. */
  timeAt: (x: number) => number;
  /** The x of `time`, on the same scale as the points, unclamped. */
  x: (time: number) => number;
  /** The y of a sum. */
  y: (value: number) => number;
}

/** Scale `sums` to a chart of `size`: time across, lines up. Lines added
 * rise above zero and lines deleted fall below it, so the net change runs
 * between them. */
export function chartLayout(
  sums: Cumulative,
  size: { width: number; height: number },
): ChartLayout {
  const plot = {
    left: MARGIN.left,
    right: Math.max(MARGIN.left + 1, size.width - MARGIN.right),
    top: MARGIN.top,
    bottom: Math.max(MARGIN.top + 1, size.height - MARGIN.bottom),
  };
  const { points } = sums;
  const first = points[0]?.time ?? 0;
  const span = Math.max(1, (points.at(-1)?.time ?? 0) - first);
  const x = (time: number) =>
    plot.left + ((time - first) / span) * (plot.right - plot.left);
  const xs = points.map((p) => x(p.time));
  const values = points.flatMap((p) => [p.added, -p.deleted, p.net]);
  const low = Math.min(0, ...values);
  const high = Math.max(1, ...values);
  const y = (v: number) =>
    plot.bottom - ((v - low) / (high - low)) * (plot.bottom - plot.top);
  const line = (pick: (p: CumulativePoint) => number) =>
    stepPath(points.map((p, i) => ({ x: xs[i], y: y(pick(p)) })));
  return {
    plot,
    xs,
    added: line((p) => p.added),
    deleted: line((p) => -p.deleted),
    net: line((p) => p.net),
    zeroY: y(0),
    ticks: niceTicks(low, high).map((value) => ({ value, y: y(value) })),
    timeAt: (x) => {
      const across = (x - plot.left) / (plot.right - plot.left);
      return first + Math.min(1, Math.max(0, across)) * span;
    },
    x,
    y,
  };
}

/** The index of the point whose time is nearest `time`, or null when there
 * are none. */
export function nearest(
  points: CumulativePoint[],
  time: number,
): number | null {
  if (points.length === 0) return null;
  let best = 0;
  points.forEach((p, i) => {
    if (Math.abs(p.time - time) < Math.abs(points[best].time - time)) {
      best = i;
    }
  });
  return best;
}

/** How far apart, in pixels, two commits may be drawn and still count as
 * one place on the chart (ADR 0048). */
export const UNDER_REACH = 3;

/** The times drawn within `reach` pixels of `x`: where the commits under a
 * cursor at `x` fall. */
export function timesUnder(
  layout: ChartLayout,
  x: number,
  reach = UNDER_REACH,
): { from: number; to: number } {
  return { from: layout.timeAt(x - reach), to: layout.timeAt(x + reach) };
}

/** The points from `times.from` to `times.to`, both included, newest
 * first. */
export function pointsBetween(
  points: CumulativePoint[],
  times: { from: number; to: number },
): CumulativePoint[] {
  return points
    .filter((p) => times.from <= p.time && p.time <= times.to)
    .reverse();
}

/** Where the tip goes for a cursor at `x` and a pointer at `y` on a chart of
 * `size`: `gap` pixels beside the cursor's line and below the pointer,
 * turned toward the left in the chart's right half and upward in its
 * bottom half, so it stays inside and never crosses the line. */
export function tipPlace(
  x: number,
  y: number,
  size: { width: number; height: number },
  gap = 8,
): { left?: number; right?: number; top?: number; bottom?: number } {
  return {
    ...(x > size.width / 2
      ? { right: size.width - x + gap }
      : { left: x + gap }),
    ...(y > size.height / 2
      ? { bottom: size.height - y + gap }
      : { top: y + gap }),
  };
}
