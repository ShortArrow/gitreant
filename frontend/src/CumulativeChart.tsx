import { useEffect, useMemo, useRef, useState } from "react";
import type { CommitView } from "./api";
import {
  boxAt,
  byTimeframe,
  candleBoxes,
  candles,
  type Timeframe,
} from "./candleModel";
import { shortId } from "./graph";
import {
  chartLayout,
  cumulative,
  nearest,
  pointsBetween,
  type Range,
  rangeStart,
  timesUnder,
  tipPlace,
  withinRange,
} from "./cumulativeModel";
import { Segmented } from "./Segmented";
import { useT, useTime } from "./settings";

/** The chart's series, each turned on and off in the legend (ADR 0047). */
const SERIES = ["added", "deleted", "net", "candles", "bars"] as const;
type Series = (typeof SERIES)[number];

/** The timeframes offered beside the legend (ADR 0049). */
const TIMEFRAMES = [
  ["auto", "timeframeAuto"],
  ["commit", "timeframeCommit"],
  ["day", "timeframeDay"],
  ["week", "timeframeWeek"],
  ["month", "timeframeMonth"],
  ["quarter", "timeframeQuarter"],
  ["year", "timeframeYear"],
] as const satisfies readonly (readonly [Timeframe, string])[];

/** The ranges offered beside the timeframe (ADR 0051). */
const RANGES = [
  ["all", "rangeAll"],
  ["5y", "range5y"],
  ["1y", "range1y"],
  ["6m", "range6m"],
  ["3m", "range3m"],
  ["1m", "range1m"],
] as const satisfies readonly (readonly [Range, string])[];

const LABEL = {
  added: "chartAdded",
  deleted: "chartDeleted",
  net: "chartNet",
  candles: "chartCandles",
  bars: "chartBars",
} as const;

/**
 * The lines added and deleted along HEAD's first parents, summed over time
 * (ADR 0043): green for added, red for deleted and a thicker line for the
 * net change, drawn to the pane's size. Candles of the net change and bars
 * of each period's lines sit on the same axes (ADR 0047). The legend names
 * every series and turns it on and off. Hovering names the nearest commit
 * and its sums, and the open, high, low and close and the lines of its
 * period while those show. The candles and bars follow a timeframe chosen
 * beside the legend (ADR 0049). Clicking lists the commits drawn under the
 * cursor in a panel beside the chart, each opening the commit menu
 * (ADR 0048).
 */
export function CumulativeChart({
  commits,
  head,
  onCommitMenu,
  menuOpen,
}: {
  commits: CommitView[];
  head: string | null;
  /** Opens the commit menu for a listed commit. */
  onCommitMenu: (e: React.MouseEvent, commit: CommitView) => void;
  /** Whether the commit menu is open, which Esc closes first. */
  menuOpen: boolean;
}) {
  const t = useT();
  const time = useTime();
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [hovered, setHovered] = useState<number | null>(null);
  const [pointerY, setPointerY] = useState(0);
  const [shown, setShown] = useState<Record<Series, boolean>>({
    added: true,
    deleted: true,
    net: true,
    candles: true,
    bars: true,
  });
  const [timeframe, setTimeframe] = useState<Timeframe>("auto");
  const [range, setRange] = useState<Range>("all");
  // The times whose commits are listed beside the chart (ADR 0048).
  const [listed, setListed] = useState<{ from: number; to: number } | null>(
    null,
  );
  useEffect(() => {
    if (listed === null || menuOpen) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setListed(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [listed, menuOpen]);

  useEffect(() => {
    const box = boxRef.current;
    if (box === null) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const sums = useMemo(() => {
    const all = cumulative(commits, head);
    const end = all.points.at(-1)?.time ?? 0;
    return withinRange(all, rangeStart(end, range));
  }, [commits, head, range]);
  const layout = useMemo(() => size && chartLayout(sums, size), [sums, size]);
  const { points } = sums;
  const boxes = useMemo(() => {
    if (layout === null || points.length === 0) return [];
    const periods = byTimeframe(timeframe, points, layout);
    return candleBoxes(layout, candles(points, periods));
  }, [layout, points, timeframe]);
  const point = hovered === null ? undefined : points[hovered];
  const box = point && boxAt(boxes, point.time);

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (layout === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setHovered(nearest(points, layout.timeAt(e.clientX - rect.left)));
    setPointerY(e.clientY - rect.top);
  };
  const onClick = () => {
    if (layout === null || hovered === null) return;
    setListed(timesUnder(layout, layout.xs[hovered]));
  };
  const listedPoints = listed && pointsBetween(points, listed);
  const toggle = (series: Series) =>
    setShown((was) => ({ ...was, [series]: !was[series] }));

  return (
    <div className="cumulative">
      <div className="cumulative-area" ref={boxRef}>
        {size && layout && (
          <svg
            className="cumulative-chart"
            data-testid="cumulative-chart"
            width={size.width}
            height={size.height}
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHovered(null)}
            onClick={onClick}
          >
            {layout.ticks.map((tick) => (
              <g key={tick.value} className="chart-tick">
                <line
                  x1={layout.plot.left}
                  x2={layout.plot.right}
                  y1={tick.y}
                  y2={tick.y}
                />
                <text x={layout.plot.left - 6} y={tick.y}>
                  {tick.value}
                </text>
              </g>
            ))}
            {shown.bars &&
              boxes.map((b) => (
                <g key={b.candle.start} className="chart-bars">
                  <rect
                    className="chart-bar-added"
                    x={b.x - b.width / 2}
                    y={b.addedTop}
                    width={b.width}
                    height={layout.zeroY - b.addedTop}
                  />
                  <rect
                    className="chart-bar-deleted"
                    x={b.x - b.width / 2}
                    y={layout.zeroY}
                    width={b.width}
                    height={b.deletedBottom - layout.zeroY}
                  />
                </g>
              ))}
            <line
              className="chart-zero"
              x1={layout.plot.left}
              x2={layout.plot.right}
              y1={layout.zeroY}
              y2={layout.zeroY}
            />
            {points.length > 0 && (
              <>
                <text
                  className="chart-date"
                  x={layout.plot.left}
                  y={layout.plot.bottom + 18}
                >
                  {time(points[0].time)}
                </text>
                <text
                  className="chart-date chart-date-last"
                  x={layout.plot.right}
                  y={layout.plot.bottom + 18}
                >
                  {time(points[points.length - 1].time)}
                </text>
              </>
            )}
            {shown.added && <path className="chart-added" d={layout.added} />}
            {shown.deleted && (
              <path className="chart-deleted" d={layout.deleted} />
            )}
            {shown.net && <path className="chart-net" d={layout.net} />}
            {shown.candles &&
              boxes.map((b) => (
                <g
                  key={b.candle.start}
                  className={`chart-candle chart-candle-${b.up ? "up" : "down"}`}
                >
                  <line x1={b.x} x2={b.x} y1={b.wickTop} y2={b.wickBottom} />
                  <rect
                    x={b.x - b.width / 2}
                    y={b.top}
                    width={b.width}
                    height={Math.max(1, b.bottom - b.top)}
                  />
                </g>
              ))}
            {hovered !== null && (
              <line
                className="chart-cursor"
                x1={layout.xs[hovered]}
                x2={layout.xs[hovered]}
                y1={layout.plot.top}
                y2={layout.plot.bottom}
              />
            )}
          </svg>
        )}
        {point && size && layout && hovered !== null && (
          <div
            className="chart-tip"
            data-testid="chart-tip"
            style={{
              top: "auto",
              right: "auto",
              ...tipPlace(layout.xs[hovered], pointerY, size),
            }}
          >
            <div>{point.commit.summary}</div>
            <div>{time(point.commit.time)}</div>
            <div>
              {t("chartTip", {
                added: point.added,
                deleted: point.deleted,
                net: point.net,
              })}
            </div>
            {box && shown.candles && (
              <div>
                {t("candleTip", {
                  open: box.candle.open,
                  high: box.candle.high,
                  low: box.candle.low,
                  close: box.candle.close,
                })}
              </div>
            )}
            {box && shown.bars && (
              <div>
                {t("barsTip", {
                  added: box.candle.added,
                  deleted: box.candle.deleted,
                })}
              </div>
            )}
          </div>
        )}
        <div className="chart-head">
          <ul className="chart-legend" data-testid="chart-legend">
            {SERIES.map((series) => (
              <li key={series} className={`chart-legend-${series}`}>
                <button
                  type="button"
                  data-testid={`chart-series-${series}`}
                  aria-pressed={shown[series]}
                  onClick={() => toggle(series)}
                >
                  <span className="chart-swatch" />
                  {t(LABEL[series])}
                </button>
              </li>
            ))}
          </ul>
          <Segmented
            name="timeframe"
            value={timeframe}
            options={TIMEFRAMES.map(([value, label]) => [value, t(label)])}
            onChange={setTimeframe}
          />
          <Segmented
            name="range"
            value={range}
            options={RANGES.map(([value, label]) => [value, t(label)])}
            onChange={setRange}
          />
          {sums.counting > 0 && (
            <p className="chart-counting" data-testid="chart-counting">
              {t("chartCounting", { n: sums.counting })}
            </p>
          )}
        </div>
      </div>
      {listedPoints && (
        <aside className="chart-list" data-testid="chart-list">
          <header className="chart-list-head">
            <span>{time(listedPoints[0]?.commit.time ?? listed.to)}</span>
            <span className="chart-list-count">
              {listedPoints.length === 1
                ? t("listedCommit")
                : t("listedCommits", { n: listedPoints.length })}
            </span>
            <button
              type="button"
              className="icon-btn"
              data-testid="chart-list-close"
              title={t("closeList")}
              onClick={() => setListed(null)}
            >
              ×
            </button>
          </header>
          <ul>
            {listedPoints.map(({ commit }) => (
              <li
                key={commit.id}
                className="listed-commit"
                data-testid="listed-commit"
                onContextMenu={(e) => onCommitMenu(e, commit)}
              >
                <span className="listed-commit-summary">{commit.summary}</span>
                {commit.stat && (
                  <span className="commit-stat">
                    <span className="stat-added">+{commit.stat.added}</span>{" "}
                    <span className="stat-deleted">−{commit.stat.deleted}</span>
                  </span>
                )}
                <span className="listed-commit-id">{shortId(commit.id)}</span>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
