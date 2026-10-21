import { expect, test } from "vitest";
import type { CommitView } from "./api";
import {
  childrenOf,
  childToSelect,
  compareRange,
  keyMove,
  parentsOf,
  rowStep,
} from "./navigation";

// merge ← (main-2, feature-1); main-2 ← main-1; feature-1 ← main-1 ← root
const c = (id: string, row: number, parents: string[]): CommitView => ({
  id,
  row,
  lane: 0,
  color: 0,
  parents,
  summary: id,
  author: "T",
  time: 0,
});
const commits = [
  c("merge", 0, ["main-2", "feature-1"]),
  c("main-2", 1, ["main-1"]),
  c("feature-1", 2, ["main-1"]),
  c("main-1", 3, ["root"]),
  c("root", 4, []),
];
const ids = (list: CommitView[]) => list.map((commit) => commit.id);

test("rowStep moves one row and stays at either end", () => {
  expect(rowStep(commits, "main-2", 1)).toBe("feature-1");
  expect(rowStep(commits, "main-2", -1)).toBe("merge");
  expect(rowStep(commits, "merge", -1)).toBe("merge");
  expect(rowStep(commits, "root", 1)).toBe("root");
});

test("rowStep starts at the first row when nothing is selected", () => {
  expect(rowStep(commits, null, 1)).toBe("merge");
  expect(rowStep(commits, null, -1)).toBe("merge");
  expect(rowStep(commits, "gone", 1)).toBe("merge");
  expect(rowStep([], null, 1)).toBeNull();
});

test("parentsOf lists the loaded parents in git's order", () => {
  expect(ids(parentsOf(commits, "merge"))).toEqual(["main-2", "feature-1"]);
  expect(ids(parentsOf(commits, "root"))).toEqual([]);
  expect(ids(parentsOf([c("tip", 0, ["unloaded"])], "tip"))).toEqual([]);
});

test("childrenOf lists the loaded children, nearest row first", () => {
  expect(ids(childrenOf(commits, "main-1"))).toEqual(["feature-1", "main-2"]);
  expect(ids(childrenOf(commits, "feature-1"))).toEqual(["merge"]);
  expect(ids(childrenOf(commits, "merge"))).toEqual([]);
});

test("childToSelect prefers a child that continues the first-parent line", () => {
  // feature-1 is merge's second parent, but merge is its only child.
  expect(childToSelect(commits, "feature-1")).toBe("merge");
  // Both main-2 and feature-1 have main-1 first; feature-1 is nearer.
  expect(childToSelect(commits, "main-1")).toBe("feature-1");
  const second = [
    c("side", 0, ["other", "base"]),
    c("next", 1, ["base"]),
    c("other", 2, []),
    c("base", 3, []),
  ];
  // "side" is nearer, but only through its second parent.
  expect(childToSelect(second, "base")).toBe("next");
  expect(childToSelect(commits, "merge")).toBeNull();
});

test("keyMove maps the arrows, and hjkl only when vim keys are on", () => {
  expect(keyMove("ArrowUp", false)).toBe("up");
  expect(keyMove("ArrowDown", false)).toBe("down");
  expect(keyMove("ArrowRight", false)).toBe("parent");
  expect(keyMove("ArrowLeft", false)).toBe("child");
  expect(keyMove("Enter", false)).toBe("diff");
  expect(keyMove("Escape", false)).toBe("clear");
  expect(keyMove("k", false)).toBeNull();
  expect(keyMove("k", true)).toBe("up");
  expect(keyMove("j", true)).toBe("down");
  expect(keyMove("l", true)).toBe("parent");
  expect(keyMove("h", true)).toBe("child");
  expect(keyMove("ArrowUp", true)).toBe("up");
  expect(keyMove("x", true)).toBeNull();
});

test("compareRange bases a comparison on the ancestor, else the selection", () => {
  expect(compareRange(commits, "merge", "main-1")).toEqual({
    base: "main-1",
    target: "merge",
  });
  expect(compareRange(commits, "main-1", "merge")).toEqual({
    base: "main-1",
    target: "merge",
  });
  // Neither reaches the other: the selected commit is the base.
  expect(compareRange(commits, "feature-1", "main-2")).toEqual({
    base: "feature-1",
    target: "main-2",
  });
  expect(compareRange(commits, "main-2", "feature-1")).toEqual({
    base: "main-2",
    target: "feature-1",
  });
});
