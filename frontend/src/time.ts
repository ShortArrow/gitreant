/** How timestamps are spelled across the graph rows and commit details.
 * The choice is a client setting (ADR 0015); the absolute timestamp always
 * stays reachable as a tooltip, so no format loses information. */

import type { Lang } from "./i18n";

/** `iso` = fixed-width `YYYY-MM-DD HH:mm`, `locale` = the chosen language's
 * own rendering, `relative` = distance from now ("3 days ago"). */
export type DateFormat = "iso" | "locale" | "relative";

export const DATE_FORMAT_KEY = "gitreant-date-format";

export function parseDateFormat(value: string | null): DateFormat {
  return value === "locale" || value === "relative" ? value : "iso";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Fixed-width local timestamp down to the minute. */
function isoTime(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** The unabbreviated local timestamp, for tooltips. */
export function absoluteTime(date: Date): string {
  return `${isoTime(date)}:${pad(date.getSeconds())}`;
}

/** Largest unit first: the first one the distance reaches is the one used. */
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

function relativeTime(date: Date, now: Date, lang: Lang): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const distance = Math.abs(seconds);
  const [unit, size] = UNITS.find(([, s]) => distance >= s) ?? UNITS[UNITS.length - 1];
  return new Intl.RelativeTimeFormat(lang, { numeric: "always" }).format(
    Math.trunc(seconds / size),
    unit,
  );
}

/** Render one timestamp in the user's chosen format. `now` is passed in so
 * the relative form stays a pure function of its inputs. */
export function formatTime(
  date: Date,
  format: DateFormat,
  lang: Lang,
  now: Date,
): string {
  switch (format) {
    case "locale":
      return date.toLocaleString(lang);
    case "relative":
      return relativeTime(date, now, lang);
    default:
      return isoTime(date);
  }
}
