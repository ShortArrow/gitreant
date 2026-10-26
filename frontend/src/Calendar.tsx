import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CommitView } from "./api";
import {
  type CalendarDay,
  calendarDays,
  calendarWeeks,
  dayShade,
  MAX_WEEKS,
  nextInDay,
  type Shading,
} from "./calendarModel";
import { periodStart } from "./candleModel";
import { Segmented } from "./Segmented";
import { useLang, useT } from "./settings";

/** A day's cell, and the room between cells, in pixels. */
const CELL = 11;
const PITCH = CELL + 3;
/** The room left of the weeks for weekday names, and above for months. */
const LEFT = 32;
const TOP = 16;
/** The room right of the newest week, for a month named over it. */
const RIGHT = 40;
/** How near the oldest end, in pixels, scrolling reads the next page. */
const OLDEST_EDGE = 40;
/** The least time, in milliseconds, between two pages the calendar asks
 * for, so scrolling at its oldest end cannot fire requests back to back. */
const PAGE_INTERVAL = 500;

/** The shadings offered above the weeks. */
const SHADINGS = [
  ["both", "shadingBoth"],
  ["added", "shadingAdded"],
  ["deleted", "shadingDeleted"],
] as const satisfies readonly (readonly [Shading, string])[];

/** A day's fill: green to red by the share of lines added, faint to full by
 * how many lines changed. */
function fill(shade: { strength: number; added: number }): string {
  const hue = `color-mix(in srgb, var(--success) ${Math.round(shade.added * 100)}%, var(--danger))`;
  return `color-mix(in srgb, ${hue} ${Math.round(shade.strength * 100)}%, transparent)`;
}

/**
 * The history as a calendar under the rows (ADR 0050): a column per week,
 * Monday first, each day shaded by the lines its commits changed and
 * whether they were added or deleted. Hovering a day names its commits and
 * lines; clicking it picks its newest commit, then each older one in turn.
 * Scrolling to the oldest end reads the history's next page.
 */
export function Calendar({
  commits,
  selected,
  onPick,
  hasOlder,
  onOlder,
}: {
  commits: CommitView[];
  /** The commit selected in the rows, whose day is marked. */
  selected: string | null;
  /** Selects a commit in the rows. */
  onPick: (commit: string) => void;
  /** Whether the history has pages not read yet. */
  hasOlder: boolean;
  /** Reads the history's next page. */
  onOlder: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const days = useMemo(() => calendarDays(commits), [commits]);
  const { weeks, months } = useMemo(() => calendarWeeks(days), [days]);
  const [hovered, setHovered] = useState<CalendarDay | null>(null);
  const [shading, setShading] = useState<Shading>("both");
  const selectedTime = commits.find((c) => c.id === selected)?.time;
  const selectedDay =
    selectedTime === undefined ? null : periodStart(selectedTime, "day");

  // A long history opens at its newest end, and weeks read in on the left
  // keep the ones in view where they were: the distance from the newest end
  // holds.
  const scrollRef = useRef<HTMLDivElement>(null);
  const fromNewest = useRef<number | null>(null);
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (scroll === null) return;
    scroll.scrollLeft =
      fromNewest.current === null
        ? scroll.scrollWidth
        : scroll.scrollWidth - fromNewest.current;
  }, [weeks.length]);
  const canReadOlder = hasOlder && weeks.length < MAX_WEEKS;
  // A page asked for too soon after the last waits out the interval rather
  // than being dropped: resting at the oldest end fires no more scrolls.
  const askedAt = useRef(-Infinity);
  const waiting = useRef<number | undefined>(undefined);
  const readOlder = () => {
    if (!canReadOlder) return;
    const wait = askedAt.current + PAGE_INTERVAL - performance.now();
    if (wait > 0) {
      window.clearTimeout(waiting.current);
      waiting.current = window.setTimeout(() => readAtEdge.current(), wait);
      return;
    }
    askedAt.current = performance.now();
    onOlder();
  };
  const readAtEdge = useRef(() => {});
  readAtEdge.current = () => {
    const scroll = scrollRef.current;
    if (scroll && scroll.scrollLeft < OLDEST_EDGE) readOlder();
  };
  useEffect(() => () => window.clearTimeout(waiting.current), []);
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scroll = e.currentTarget;
    fromNewest.current = scroll.scrollWidth - scroll.scrollLeft;
    if (scroll.scrollLeft < OLDEST_EDGE) readOlder();
  };

  const date = (seconds: number, options: Intl.DateTimeFormatOptions) =>
    new Date(seconds * 1000).toLocaleDateString(lang, options);

  return (
    <div className="calendar" data-testid="calendar">
      <div className="calendar-head">
        {canReadOlder && (
          <button
            type="button"
            className="cumulative-toggle"
            data-testid="calendar-older"
            onClick={readOlder}
          >
            ‹ {t("calendarOlder")}
          </button>
        )}
        <Segmented
          name="shading"
          value={shading}
          options={SHADINGS.map(([value, label]) => [value, t(label)])}
          onChange={setShading}
        />
      </div>
      <div className="calendar-body">
        <svg
          className="calendar-weekdays"
          width={LEFT}
          height={TOP + 7 * PITCH}
        >
          {weeks.length > 0 &&
            [0, 2, 4].map((weekday) => (
              <text
                key={weekday}
                className="calendar-weekday"
                x={LEFT - 6}
                y={TOP + weekday * PITCH + CELL / 2}
              >
                {date(weeks[0].cells[weekday].date, { weekday: "short" })}
              </text>
            ))}
        </svg>
        <div className="calendar-scroll" ref={scrollRef} onScroll={onScroll}>
          <svg
            width={weeks.length * PITCH + RIGHT}
            height={TOP + 7 * PITCH}
            onMouseLeave={() => setHovered(null)}
          >
            {months.map(({ week, start }, i) => (
              <text
                key={start}
                className="calendar-month"
                x={week * PITCH}
                y={TOP - 7}
              >
                {date(start, {
                  month: "short",
                  ...(i === 0 || new Date(start * 1000).getMonth() === 0
                    ? { year: "numeric" }
                    : {}),
                })}
              </text>
            ))}
            {weeks.map((week, w) => (
              <g key={week.start} className="calendar-week">
                {week.cells.map(({ date: start, day }, d) => {
                  const shade = day && dayShade(day, shading);
                  const classes = [
                    "calendar-day",
                    day && !shade ? "counting" : "",
                    shade?.strength === 0 ? "blank" : "",
                    start === selectedDay ? "selected" : "",
                  ].filter(Boolean);
                  return (
                    <rect
                      key={start}
                      className={day ? classes.join(" ") : "calendar-cell"}
                      data-testid={day ? "calendar-day" : undefined}
                      x={w * PITCH}
                      y={TOP + d * PITCH}
                      width={CELL}
                      height={CELL}
                      rx={2}
                      style={
                        shade && shade.strength > 0
                          ? { fill: fill(shade) }
                          : undefined
                      }
                      onMouseEnter={day ? () => setHovered(day) : undefined}
                      onClick={
                        day ? () => onPick(nextInDay(day, selected)) : undefined
                      }
                    />
                  );
                })}
              </g>
            ))}
          </svg>
        </div>
      </div>
      {hovered && (
        <div className="chart-tip calendar-tip" data-testid="calendar-tip">
          <div>
            {date(hovered.start, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </div>
          <div>
            {hovered.commits.length === 1
              ? t("listedCommit")
              : t("listedCommits", { n: hovered.commits.length })}
          </div>
          <div className="commit-stat">
            <span className="stat-added">+{hovered.added}</span>{" "}
            <span className="stat-deleted">−{hovered.deleted}</span>
          </div>
          {hovered.counting > 0 && (
            <div>{t("chartCounting", { n: hovered.counting })}</div>
          )}
        </div>
      )}
    </div>
  );
}
