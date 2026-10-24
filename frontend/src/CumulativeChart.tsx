import { useEffect, useMemo, useRef, useState } from "react";
import type { CommitView } from "./api";
import { chartLayout, cumulative, nearest } from "./cumulativeModel";
import { useT, useTime } from "./settings";

/**
 * The lines added and deleted along HEAD's first parents, summed over time
 * (ADR 0043): green for added, red for deleted and a thicker line for the
 * net change, named in a legend above them and drawn to the pane's size.
 * Hovering names the nearest commit and its sums.
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
  const layout = size && chartLayout(sums, size);
  const { points } = sums;
  const point = hovered === null ? undefined : points[hovered];

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (layout === null) return;
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    setHovered(nearest(points, layout.timeAt(x)));
  };

  return (
    <div className="cumulative" ref={boxRef}>
      {layout && (
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
          <path className="chart-added" d={layout.added} />
          <path className="chart-deleted" d={layout.deleted} />
          <path className="chart-net" d={layout.net} />
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
        </div>
      )}
      <div className="chart-head">
        <ul className="chart-legend" data-testid="chart-legend">
          <li className="chart-legend-added">
            <span className="chart-swatch" />
            {t("chartAdded")}
          </li>
          <li className="chart-legend-deleted">
            <span className="chart-swatch" />
            {t("chartDeleted")}
          </li>
          <li className="chart-legend-net">
            <span className="chart-swatch" />
            {t("chartNet")}
          </li>
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
