import type { ChartLayout, CumulativePoint } from "./cumulativeModel";

/** How long one candle spans by the calendar (ADR 0047, ADR 0051). */
export type Period = "day" | "week" | "month" | "quarter" | "year";

/** The candles' and bars' timeframe (ADR 0049): a calendar period, the
 * calendar period that suits the span, or the chart's columns. */
export type Timeframe = "auto" | "commit" | Period;

/** A cut of the time axis into periods: the one holding `time`, from its
 * start up to the next one's. */
export type Periods = (time: number) => { start: number; end: number };

/** How wide, in pixels, a column of the Commit timeframe is. */
export const COLUMN = 4;

/** The net change over one period: where it opened and closed, and how
 * high and low it went in between. */
export interface Candle {
  /** Unix seconds at the period's start; `end` is the next one's. */
  start: number;
  end: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** The lines the period's commits added and deleted. */
  added: number;
  deleted: number;
}

const DAY = 86_400;

/** The shortest period that keeps the candles from `first` to `last` to
 * about `most`. */
export function candlePeriod(first: number, last: number, most = 60): Period {
  const days = (last - first) / DAY;
  if (days + 1 <= most) return "day";
  if (days / 7 + 1 <= most) return "week";
  if (days / 30.4 + 1 <= most) return "month";
  if (days / 91.3 + 1 <= most) return "quarter";
  return "year";
}

/** The start of the period holding `time`, by the local calendar: midnight,
 * the Monday of the week, or the first of the month, of the quarter's first
 * month or of January. */
export function periodStart(time: number, period: Period): number {
  const date = new Date(time * 1000);
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const starts: Record<Period, () => Date> = {
    day: () => new Date(year, month, day),
    week: () => new Date(year, month, day - ((date.getDay() + 6) % 7)),
    month: () => new Date(year, month, 1),
    quarter: () => new Date(year, month - (month % 3), 1),
    year: () => new Date(year, 0, 1),
  };
  return starts[period]().getTime() / 1000;
}

function nextStart(start: number, period: Period): number {
  const date = new Date(start * 1000);
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const nexts: Record<Period, () => Date> = {
    day: () => new Date(year, month, day + 1),
    week: () => new Date(year, month, day + 7),
    month: () => new Date(year, month + 1, 1),
    quarter: () => new Date(year, month + 3, 1),
    year: () => new Date(year + 1, 0, 1),
  };
  return nexts[period]().getTime() / 1000;
}

/** Periods by the local calendar. */
export function byCalendar(period: Period): Periods {
  return (time) => {
    const start = periodStart(time, period);
    return { start, end: nextStart(start, period) };
  };
}

/** Periods of `px`-wide columns of `layout`, from its first time: the
 * commits drawn in one column share a period. */
export function byColumn(layout: ChartLayout, px = COLUMN): Periods {
  const { left, right } = layout.plot;
  const first = layout.timeAt(left);
  const length = ((layout.timeAt(right) - first) / (right - left)) * px;
  return (time) => {
    const start = first + Math.floor((time - first) / length) * length;
    return { start, end: start + length };
  };
}

/** The periods `timeframe` cuts `points` into, drawn on `layout`. */
export function byTimeframe(
  timeframe: Timeframe,
  points: CumulativePoint[],
  layout: ChartLayout,
): Periods {
  if (timeframe === "commit") return byColumn(layout);
  if (timeframe !== "auto") return byCalendar(timeframe);
  const first = points[0]?.time ?? 0;
  return byCalendar(candlePeriod(first, points.at(-1)?.time ?? first));
}

/** The net change of `points`, oldest first, as a candle per period that
 * has commits. Each opens where the one before closed, from zero, and
 * counts the lines its period added and deleted. */
export function candles(points: CumulativePoint[], periods: Periods): Candle[] {
  const result: Candle[] = [];
  let close = 0;
  let added = 0;
  let deleted = 0;
  for (const point of points) {
    const { start, end } = periods(point.time);
    const last = result.at(-1);
    if (last === undefined || last.start !== start) {
      result.push({
        start,
        end,
        open: close,
        high: close,
        low: close,
        close,
        added: 0,
        deleted: 0,
      });
    }
    const candle = result[result.length - 1];
    candle.close = point.net;
    candle.high = Math.max(candle.high, point.net);
    candle.low = Math.min(candle.low, point.net);
    candle.added += point.added - added;
    candle.deleted += point.deleted - deleted;
    close = point.net;
    added = point.added;
    deleted = point.deleted;
  }
  return result;
}

/** Where a candle is drawn: its body centered on `x`, `width` wide, from
 * `top` to `bottom`, and its wick from `wickTop` to `wickBottom`. */
export interface CandleBox {
  candle: Candle;
  x: number;
  width: number;
  top: number;
  bottom: number;
  wickTop: number;
  wickBottom: number;
  /** Closed at or above its open. */
  up: boolean;
  /** The period's bars, from the zero line: the added one's top and the
   * deleted one's bottom. */
  addedTop: number;
  deletedBottom: number;
}

/** `list` placed on `layout`: each candle over its period, narrowed so
 * neighbors do not touch, and kept inside the plot. */
export function candleBoxes(layout: ChartLayout, list: Candle[]): CandleBox[] {
  const { left, right } = layout.plot;
  const most = (right - left) / Math.max(1, list.length);
  return list.map((candle) => {
    const from = layout.x(candle.start);
    const to = layout.x(candle.end);
    const width = Math.max(1, Math.min(to - from, most) * 0.7);
    const x = Math.min(
      right - width / 2,
      Math.max(left + width / 2, (from + to) / 2),
    );
    return {
      candle,
      x,
      width,
      top: layout.y(Math.max(candle.open, candle.close)),
      bottom: layout.y(Math.min(candle.open, candle.close)),
      wickTop: layout.y(candle.high),
      wickBottom: layout.y(candle.low),
      up: candle.close >= candle.open,
      addedTop: layout.y(candle.added),
      deletedBottom: layout.y(-candle.deleted),
    };
  });
}

/** The box of the period holding `time`, if it has a candle. */
export function boxAt<B extends { candle: { start: number; end: number } }>(
  boxes: B[],
  time: number,
): B | undefined {
  return boxes.find((b) => b.candle.start <= time && time < b.candle.end);
}
