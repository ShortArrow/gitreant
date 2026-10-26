import { UNCOMMITTED_ID, type CommitView } from "./api";
import { periodStart } from "./candleModel";
import { THICKNESS_REACH, thickness } from "./thicknessModel";

/** One local day of the calendar (ADR 0050). */
export interface CalendarDay {
  /** Unix seconds at the day's local midnight. */
  start: number;
  /** The day's commits, newest first. */
  commits: CommitView[];
  /** The lines its counted commits added and deleted. */
  added: number;
  deleted: number;
  /** Its commits whose counts have not arrived yet. */
  counting: number;
}

/** A week of the calendar, Monday first: a cell per day, with the day's
 * commits when it has any. */
export interface CalendarWeek {
  start: number;
  cells: { date: number; day?: CalendarDay }[];
}

/** The most weeks the calendar lays out, about ten years back from its
 * newest day: commit dates are whatever their authors wrote, and one dated
 * centuries away must not stretch it into millions of cells. */
export const MAX_WEEKS = 530;

/** How many weeks a month's name needs to itself before the next one. */
const MONTH_ROOM = 3;

/** The faintest shade, so a one-line day still shows. */
const MIN_STRENGTH = 0.2;

/** Whether a commit counts toward its day: every loaded commit but merges,
 * stash entries and their helpers, and the uncommitted row. */
function counts(commit: CommitView): boolean {
  return (
    commit.id !== UNCOMMITTED_ID &&
    commit.parents.length <= 1 &&
    !commit.stash &&
    !commit.stash_internal
  );
}

/** The days `commits` fall on, newest first, keyed by their start. */
export function calendarDays(commits: CommitView[]): Map<number, CalendarDay> {
  const days = new Map<number, CalendarDay>();
  for (const commit of commits.filter(counts)) {
    const start = periodStart(commit.time, "day");
    let day = days.get(start);
    if (day === undefined) {
      day = { start, commits: [], added: 0, deleted: 0, counting: 0 };
      days.set(start, day);
    }
    day.commits.push(commit);
    if (commit.stat) {
      day.added += commit.stat.added;
      day.deleted += commit.stat.deleted;
    } else {
      day.counting += 1;
    }
  }
  for (const day of days.values()) day.commits.sort((a, b) => b.time - a.time);
  return new Map([...days].sort(([a], [b]) => b - a));
}

/** Unix seconds at local midnight `n` days after `start`'s. */
function daysAfter(start: number, n: number): number {
  const date = new Date(start * 1000);
  return (
    new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate() + n,
    ).getTime() / 1000
  );
}

/** The weeks from the oldest day's to the newest's, at most `MAX_WEEKS`
 * back from the newest, oldest first, and the
 * month that begins in each week where one does. The first week names its
 * month too, unless the next month begins too close to name both. */
export function calendarWeeks(days: Map<number, CalendarDay>): {
  weeks: CalendarWeek[];
  months: { week: number; start: number }[];
} {
  const starts = [...days.keys()];
  if (starts.length === 0) return { weeks: [], months: [] };
  const last = periodStart(Math.max(...starts), "week");
  const weeks: CalendarWeek[] = [];
  const months: { week: number; start: number }[] = [];
  const earliest = daysAfter(last, -7 * (MAX_WEEKS - 1));
  for (
    let start = Math.max(earliest, periodStart(Math.min(...starts), "week"));
    start <= last;
    start = daysAfter(start, 7)
  ) {
    const cells = Array.from({ length: 7 }, (_, i) => {
      const date = daysAfter(start, i);
      return { date, day: days.get(date) };
    });
    const first = cells.find((c) => new Date(c.date * 1000).getDate() === 1);
    if (weeks.length === 0 || first) {
      months.push({
        week: weeks.length,
        start: periodStart((first ?? cells[0]).date, "month"),
      });
    }
    weeks.push({ start, cells });
  }
  if (months.length > 1 && months[1].week - months[0].week < MONTH_ROOM) {
    months.shift();
  }
  return { weeks, months };
}

/** Which lines shade the calendar (ADR 0050): both, or one kind alone. */
export type Shading = "both" | "added" | "deleted";

/** How a day is shaded (ADR 0050): `strength` from faint to full with the
 * lines `shading` counts among its counted commits, on the thickness's
 * logarithmic scale (ADR 0044), and `added`, the share of those lines that
 * were added, from 0 (all deleted) to 1. With one kind alone, a day without
 * such lines is blank. Null while none of its commits are counted. */
export function dayShade(
  day: CalendarDay,
  shading: Shading,
): { strength: number; added: number } | null {
  if (day.counting === day.commits.length) return null;
  const strength = (lines: number) =>
    MIN_STRENGTH + ((1 - MIN_STRENGTH) * thickness(lines)) / THICKNESS_REACH;
  if (shading === "added") {
    return { strength: day.added === 0 ? 0 : strength(day.added), added: 1 };
  }
  if (shading === "deleted") {
    return {
      strength: day.deleted === 0 ? 0 : strength(day.deleted),
      added: 0,
    };
  }
  const lines = day.added + day.deleted;
  return {
    strength: strength(lines),
    added: lines === 0 ? 0.5 : day.added / lines,
  };
}

/** The commit to select when `day` is clicked: its newest, or the one after
 * `selected` when that is one of its own, round from the oldest to the
 * newest again. */
export function nextInDay(day: CalendarDay, selected: string | null): string {
  const at = day.commits.findIndex((c) => c.id === selected);
  return day.commits[(at + 1) % day.commits.length].id;
}
