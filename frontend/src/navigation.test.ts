import { expect, test } from "vitest";
import type { CommitView } from "./api";
import {
  childrenOf,
  compareRange,
  edgeRow,
  keyMove,
  laneStep,
  parentsOf,
  rowStep,
} from "./navigation";

// merge ← (main-2, feature-1); main-2 ← main-1; feature-1 ← main-1 ← root
const c = (
  id: string,
  row: number,
  parents: string[],
  lane = 0,
): CommitView => ({
  id,
  row,
  lane,
  color: 0,
  parents,
  summary: id,
  author: "T",
  time: 0,
});
const commits = [
  c("merge", 0, ["main-2", "feature-1"]),
  c("main-2", 1, ["main-1"]),
  c("feature-1", 2, ["main-1"], 1),
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

test("laneStep moves to the nearest commit in the next lane over", () => {
  expect(laneStep(commits, "main-2", 1)).toBe("feature-1");
  // main-2 and main-1 are both one row from feature-1: the upper one wins.
  expect(laneStep(commits, "feature-1", -1)).toBe("main-2");
  // Nothing further left or right: the selection stays.
  expect(laneStep(commits, "main-2", -1)).toBe("main-2");
  expect(laneStep(commits, "feature-1", 1)).toBe("feature-1");
  expect(laneStep(commits, null, 1)).toBe("merge");
});

test("laneStep skips an empty lane to the nearest one beyond it", () => {
  const spread = [c("a", 0, [], 0), c("far", 0, [], 3), c("near", 5, [], 2)];
  expect(laneStep(spread, "a", 1)).toBe("near");
  expect(laneStep(spread, "near", 1)).toBe("far");
});

test("keyMove maps the arrows, and hjkl only when vim keys are on", () => {
  expect(keyMove("ArrowUp", false)).toBe("up");
  expect(keyMove("ArrowDown", false)).toBe("down");
  expect(keyMove("ArrowRight", false)).toBe("right");
  expect(keyMove("ArrowLeft", false)).toBe("left");
  expect(keyMove("Enter", false)).toBe("diff");
  expect(keyMove("Escape", false)).toBe("clear");
  expect(keyMove("k", false)).toBeNull();
  expect(keyMove("k", true)).toBe("up");
  expect(keyMove("j", true)).toBe("down");
  expect(keyMove("l", true)).toBe("right");
  expect(keyMove("h", true)).toBe("left");
  expect(keyMove("ArrowUp", true)).toBe("up");
  expect(keyMove("x", true)).toBeNull();
});

test("keyMove jumps to the ends with Home/End, and gg/G with vim keys", () => {
  expect(keyMove("Home", false)).toBe("top");
  expect(keyMove("End", false)).toBe("bottom");
  expect(keyMove("G", false)).toBeNull();
  expect(keyMove("G", true)).toBe("bottom");
  // A single g waits for the second.
  expect(keyMove("g", true)).toBeNull();
  expect(keyMove("g", true, "g")).toBe("top");
  expect(keyMove("g", true, "j")).toBeNull();
  expect(keyMove("g", false, "g")).toBeNull();
});

test("edgeRow picks the first or last loaded row", () => {
  expect(edgeRow(commits, "top")).toBe("merge");
  expect(edgeRow(commits, "bottom")).toBe("root");
  expect(edgeRow([], "top")).toBeNull();
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
