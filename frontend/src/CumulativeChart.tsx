import { useEffect, useMemo, useRef, useState } from "react";
import type { CommitView } from "./api";
import { boxAt, candleBoxes, candlePeriod, candles } from "./candleModel";
import { chartLayout, cumulative, nearest } from "./cumulativeModel";
import { useT, useTime } from "./settings";

/** The chart's series, each turned on and off in the legend (ADR 0047). */
const SERIES = ["added", "deleted", "net", "candles", "bars"] as const;
type Series = (typeof SERIES)[number];

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
 * period while those show.
 */
export function CumulativeChart({
  commits,
  head,
}: {
  commits: CommitView[];
  head: string | null;
}) {
  const t = useT();
  const time = useTime();
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [hovered, setHovered] = useState<number | null>(null);
  const [shown, setShown] = useState<Record<Series, boolean>>({
    added: true,
    deleted: true,
    net: true,
    candles: true,
    bars: true,
  });

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

  const sums = useMemo(() => cumulative(commits, head), [commits, head]);
  const layout = useMemo(() => size && chartLayout(sums, size), [sums, size]);
  const { points } = sums;
  const boxes = useMemo(() => {
    if (layout === null || points.length === 0) return [];
    const period = candlePeriod(points[0].time, points[points.length - 1].time);
    return candleBoxes(layout, candles(points, period));
  }, [layout, points]);
  const point = hovered === null ? undefined : points[hovered];
  const box = point && boxAt(boxes, point.time);

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (layout === null) return;
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    setHovered(nearest(points, layout.timeAt(x)));
  };
  const toggle = (series: Series) =>
    setShown((was) => ({ ...was, [series]: !was[series] }));

  return (
    <div className="cumulative" ref={boxRef}>
      {size && layout && (
        <svg
          className="cumulative-chart"
          data-testid="cumulative-chart"
          width={size.width}
          height={size.height}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHovered(null)}
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
      {point && (
        <div className="chart-tip" data-testid="chart-tip">
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
        {sums.counting > 0 && (
          <p className="chart-counting" data-testid="chart-counting">
            {t("chartCounting", { n: sums.counting })}
          </p>
        )}
      </div>
    </div>
  );
}
