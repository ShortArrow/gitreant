import { expect, test } from "vitest";
import { absoluteTime, formatTime, parseDateFormat } from "./time";

const NOW = new Date(2026, 6, 28, 12, 0, 0);

test("parseDateFormat falls back to iso", () => {
  expect(parseDateFormat("iso")).toBe("iso");
  expect(parseDateFormat("locale")).toBe("locale");
  expect(parseDateFormat("relative")).toBe("relative");
  expect(parseDateFormat(null)).toBe("iso");
  expect(parseDateFormat("garbage")).toBe("iso");
});

test("iso renders a fixed-width local timestamp", () => {
  expect(formatTime(new Date(2026, 6, 15, 9, 5), "iso", "en", NOW)).toBe(
    "2026-07-15 09:05",
  );
  expect(formatTime(new Date(2023, 11, 1, 23, 59), "iso", "en", NOW)).toBe(
    "2023-12-01 23:59",
  );
});

test("locale follows the chosen language, not the browser", () => {
  const date = new Date(2026, 6, 15, 9, 5);
  expect(formatTime(date, "locale", "ja", NOW)).toBe(date.toLocaleString("ja"));
  expect(formatTime(date, "locale", "en", NOW)).toBe(date.toLocaleString("en"));
});

test("relative picks the largest unit that fits the distance to now", () => {
  const ago = (seconds: number) =>
    formatTime(new Date(NOW.getTime() - seconds * 1000), "relative", "en", NOW);

  expect(ago(45)).toBe("45 seconds ago");
  expect(ago(3 * 60)).toBe("3 minutes ago");
  expect(ago(2 * 3600)).toBe("2 hours ago");
  expect(ago(3 * 24 * 3600)).toBe("3 days ago");
  expect(ago(2 * 30 * 24 * 3600)).toBe("2 months ago");
  expect(ago(3 * 365 * 24 * 3600)).toBe("3 years ago");
});

test("relative reads a future timestamp forwards and translates", () => {
  const later = new Date(NOW.getTime() + 3 * 24 * 3600 * 1000);
  expect(formatTime(later, "relative", "en", NOW)).toBe("in 3 days");
  expect(formatTime(later, "relative", "ja", NOW)).toContain("3");
});

test("absoluteTime always spells the full timestamp for tooltips", () => {
  expect(absoluteTime(new Date(2026, 6, 15, 9, 5, 7))).toBe(
    "2026-07-15 09:05:07",
  );
});
