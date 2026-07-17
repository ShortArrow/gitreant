import { expect, test } from "vitest";
import {
  closeTab,
  emptyLayout,
  focusPane,
  moveTab,
  openTab,
  retainRepos,
  type PaneLayout,
} from "./paneModel";

/** A split layout: repoA+repoB on the left (B active), repoC on the right. */
const split: PaneLayout = {
  panes: [
    { tabs: ["a", "b"], activeId: "b" },
    { tabs: ["c"], activeId: "c" },
  ],
  focused: 0,
};

test("openTab adds to the focused pane and activates it", () => {
  const layout = openTab(emptyLayout, "a");
  expect(layout).toEqual({
    panes: [{ tabs: ["a"], activeId: "a" }],
    focused: 0,
  });
});

test("openTab of a repo open elsewhere focuses that pane instead", () => {
  const layout = openTab(split, "c");
  expect(layout).toEqual({
    panes: [
      { tabs: ["a", "b"], activeId: "b" },
      { tabs: ["c"], activeId: "c" },
    ],
    focused: 1,
  });
});

test("moveTab to a new pane splits the layout", () => {
  const single = openTab(openTab(emptyLayout, "a"), "b");
  const layout = moveTab(single, "b", 1);
  expect(layout).toEqual({
    panes: [
      { tabs: ["a"], activeId: "a" },
      { tabs: ["b"], activeId: "b" },
    ],
    focused: 1,
  });
});

test("moving the only tab right does not leave an empty left pane", () => {
  const single = openTab(emptyLayout, "a");
  const layout = moveTab(single, "a", 1);
  expect(layout).toEqual({
    panes: [{ tabs: ["a"], activeId: "a" }],
    focused: 0,
  });
});

test("moveTab back to the left pane merges and collapses the split", () => {
  const layout = moveTab(split, "c", 0);
  expect(layout).toEqual({
    panes: [{ tabs: ["a", "b", "c"], activeId: "c" }],
    focused: 0,
  });
});

test("closeTab of the last right tab collapses the split", () => {
  const layout = closeTab({ ...split, focused: 1 }, "c");
  expect(layout).toEqual({
    panes: [{ tabs: ["a", "b"], activeId: "b" }],
    focused: 0,
  });
});

test("closeTab of the active tab falls back to the last remaining one", () => {
  const layout = closeTab(split, "b");
  expect(layout.panes[0]).toEqual({ tabs: ["a"], activeId: "a" });
});

test("closeTab of an inactive tab keeps the active one", () => {
  const layout = closeTab(split, "a");
  expect(layout.panes[0]).toEqual({ tabs: ["b"], activeId: "b" });
});

test("retainRepos drops vanished repos and collapses empty panes", () => {
  const layout = retainRepos(split, new Set(["a", "b"]));
  expect(layout).toEqual({
    panes: [{ tabs: ["a", "b"], activeId: "b" }],
    focused: 0,
  });
});

test("retainRepos returns the same layout when nothing vanished", () => {
  expect(retainRepos(split, new Set(["a", "b", "c"]))).toBe(split);
});

test("retainRepos fixes an active id that vanished", () => {
  const layout = retainRepos(split, new Set(["a", "c"]));
  expect(layout.panes[0]).toEqual({ tabs: ["a"], activeId: "a" });
});

test("focusPane clamps to the existing panes", () => {
  expect(focusPane(split, 1).focused).toBe(1);
  expect(focusPane(split, 5).focused).toBe(1);
  expect(focusPane(split, -1).focused).toBe(0);
});
