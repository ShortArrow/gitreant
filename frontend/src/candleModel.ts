import type { ChartLayout, CumulativePoint } from "./cumulativeModel";

/** How long one candle spans (ADR 0047). */
export type Period = "day" | "week" | "month";

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
  return "month";
}

/** The start of the period holding `time`, by the local calendar: midnight,
 * the Monday of the week, or the first of the month. */
export function periodStart(time: number, period: Period): number {
  const date = new Date(time * 1000);
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const start =
    period === "day"
      ? new Date(year, month, day)
      : period === "week"
        ? new Date(year, month, day - ((date.getDay() + 6) % 7))
        : new Date(year, month, 1);
  return start.getTime() / 1000;
}

function nextStart(start: number, period: Period): number {
  const date = new Date(start * 1000);
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const next =
    period === "day"
      ? new Date(year, month, day + 1)
      : period === "week"
        ? new Date(year, month, day + 7)
        : new Date(year, month + 1, 1);
  return next.getTime() / 1000;
}

/** The net change of `points`, oldest first, as a candle per period that
 * has commits. Each opens where the one before closed, from zero, and
 * counts the lines its period added and deleted. */
export function candles(points: CumulativePoint[], period: Period): Candle[] {
  const result: Candle[] = [];
  let close = 0;
  let added = 0;
  let deleted = 0;
  for (const point of points) {
    const start = periodStart(point.time, period);
    const last = result.at(-1);
    if (last === undefined || last.start !== start) {
      result.push({
        start,
        end: nextStart(start, period),
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
