import { expect, test } from "vitest";
import { UNCOMMITTED_ID, type CommitView } from "./api";
import {
  calendarDays,
  calendarWeeks,
  dayShade,
  MAX_WEEKS,
  nextInDay,
} from "./calendarModel";

/** Unix seconds at local midnight of a date, plus `hours`. */
function at(year: number, month: number, day: number, hours = 0): number {
  return new Date(year, month - 1, day, hours).getTime() / 1000;
}

function commit(
  id: string,
  time: number,
  stat?: { added: number; deleted: number },
  more: Partial<CommitView> = {},
): CommitView {
  return {
    id,
    row: 0,
    lane: 0,
    color: 0,
    parents: ["p"],
    summary: id,
    author: "a",
    time,
    stat,
    ...more,
  };
}

test("a day sums its commits' lines, newest first, leaving merges, stashes and the uncommitted row out", () => {
  const days = calendarDays([
    { ...commit(UNCOMMITTED_ID, at(2026, 10, 22, 20)), uncommitted: 1 },
    commit("stash", at(2026, 10, 22, 19), undefined, {
      parents: ["a", "b"],
      stash: true,
    }),
    commit(
      "index",
      at(2026, 10, 22, 19),
      { added: 9, deleted: 9 },
      {
        stash_internal: true,
      },
    ),
    commit(
      "merge",
      at(2026, 10, 22, 18),
      { added: 50, deleted: 0 },
      {
        parents: ["a", "b"],
      },
    ),
    commit("late", at(2026, 10, 22, 17), { added: 3, deleted: 1 }),
    commit("early", at(2026, 10, 22, 9), { added: 2, deleted: 0 }),
    commit("uncounted", at(2026, 10, 22, 10)),
    commit("yesterday", at(2026, 10, 21, 23), { added: 1, deleted: 1 }),
  ]);
  expect([...days.keys()]).toEqual([at(2026, 10, 22), at(2026, 10, 21)]);
  const day = days.get(at(2026, 10, 22))!;
  expect(day.commits.map((c) => c.id)).toEqual(["late", "uncounted", "early"]);
  expect([day.added, day.deleted, day.counting]).toEqual([5, 1, 1]);
});

test("the weeks run Monday to Sunday from the oldest commit's week to the newest's, months named where they begin", () => {
  // 2026-10-08 is a Thursday, and 2026-11-01 a Sunday.
  const days = calendarDays([
    commit("b", at(2026, 11, 3, 9), { added: 1, deleted: 0 }),
    commit("a", at(2026, 10, 8, 9), { added: 1, deleted: 0 }),
  ]);
  const { weeks, months } = calendarWeeks(days);
  expect(weeks.map((w) => w.start)).toEqual([
    at(2026, 10, 5),
    at(2026, 10, 12),
    at(2026, 10, 19),
    at(2026, 10, 26),
    at(2026, 11, 2),
  ]);
  for (const week of weeks) expect(week.cells).toHaveLength(7);
  expect(weeks[0].cells[3]).toMatchObject({ date: at(2026, 10, 8) });
  expect(weeks[0].cells[3].day?.commits[0].id).toBe("a");
  expect(weeks[0].cells[0].day).toBeUndefined();
  expect(weeks[4].cells[1].day?.commits[0].id).toBe("b");
  // The first week is named, then the week holding November 1st.
  expect(months).toEqual([
    { week: 0, start: at(2026, 10, 1) },
    { week: 3, start: at(2026, 11, 1) },
  ]);
});

test("the first week goes unnamed when the next month begins too close to name both", () => {
  // November begins in the second week, the one from Monday 2026-10-26.
  const days = calendarDays([
    commit("b", at(2026, 11, 20, 9), { added: 1, deleted: 0 }),
    commit("a", at(2026, 10, 21, 9), { added: 1, deleted: 0 }),
  ]);
  expect(calendarWeeks(days).months).toEqual([
    { week: 1, start: at(2026, 11, 1) },
  ]);
});

test("a commit dated centuries away cannot stretch the calendar past its most weeks", () => {
  const days = calendarDays([
    commit("far", at(3000, 1, 1), { added: 1, deleted: 0 }),
    commit("now", at(2026, 10, 22, 9), { added: 1, deleted: 0 }),
  ]);
  const { weeks } = calendarWeeks(days);
  expect(weeks).toHaveLength(MAX_WEEKS);
  // The weeks run back from the newest day's.
  expect(weeks.at(-1)!.cells[2].day?.commits[0].id).toBe("far");
});

test("no commits, no weeks", () => {
  expect(calendarWeeks(new Map())).toEqual({ weeks: [], months: [] });
});

/** The one day `commits` fall on. */
function oneDay(...commits: CommitView[]) {
  return [...calendarDays(commits).values()][0];
}

test("a day's shade grows with its lines and leans green or red by what they did", () => {
  const day = (added: number, deleted: number) =>
    oneDay(commit("c", at(2026, 10, 22, 9), { added, deleted }));
  const small = dayShade(day(1, 0), "both")!;
  const large = dayShade(day(1000, 0), "both")!;
  expect(small.strength).toBeGreaterThan(0);
  expect(large.strength).toBeGreaterThan(small.strength);
  expect(dayShade(day(1_000_000, 0), "both")!.strength).toBeCloseTo(1);
  expect(small.added).toBe(1);
  expect(dayShade(day(0, 10), "both")!.added).toBe(0);
  expect(dayShade(day(30, 10), "both")!.added).toBeCloseTo(0.75);
  // A day of empty commits still shows, neither green nor red.
  expect(dayShade(day(0, 0), "both")).toMatchObject({ added: 0.5 });
  expect(dayShade(day(0, 0), "both")!.strength).toBeGreaterThan(0);
});

test("a day can be shaded by its added lines alone, or its deleted lines alone", () => {
  const day = oneDay(
    commit("c", at(2026, 10, 22, 9), { added: 1000, deleted: 1 }),
  );
  const both = dayShade(day, "both")!;
  const added = dayShade(day, "added")!;
  const deleted = dayShade(day, "deleted")!;
  // Added alone: as strong as the added lines, and all green.
  expect(added.added).toBe(1);
  expect(added.strength).toBeLessThan(both.strength);
  // Deleted alone: as faint as one line, and all red.
  expect(deleted.added).toBe(0);
  expect(deleted.strength).toBeLessThan(added.strength);
  // A day that only added is blank by its deleted lines.
  const onlyAdded = oneDay(
    commit("c", at(2026, 10, 22, 9), { added: 5, deleted: 0 }),
  );
  expect(dayShade(onlyAdded, "deleted")).toMatchObject({ strength: 0 });
});

test("a day whose commits are all still being counted has no shade yet", () => {
  expect(dayShade(oneDay(commit("c", at(2026, 10, 22, 9))), "both")).toBeNull();
});

test("clicking a day again walks its commits from the newest, round to the newest again", () => {
  const day = oneDay(
    commit("late", at(2026, 10, 22, 17)),
    commit("noon", at(2026, 10, 22, 12)),
    commit("early", at(2026, 10, 22, 9)),
  );
  expect(nextInDay(day, null)).toBe("late");
  expect(nextInDay(day, "elsewhere")).toBe("late");
  expect(nextInDay(day, "late")).toBe("noon");
  expect(nextInDay(day, "noon")).toBe("early");
  expect(nextInDay(day, "early")).toBe("late");
});
