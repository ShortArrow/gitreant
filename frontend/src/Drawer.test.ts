import { expect, test } from "vitest";
import type { RepoListEntry } from "./api";
import { activateOnKey, arrangeRepos, topLevelRepos } from "./Drawer";

const repos: RepoListEntry[] = [
  { id: "/w/Zeta", name: "Zeta", path: "/work/zeta" },
  { id: "/w/alpha", name: "alpha", path: "/work/alpha" },
  { id: "/other/mid", name: "mid", path: "/other/mid" },
];

test("arrangeRepos keeps the added order by default", () => {
  expect(arrangeRepos(repos, "", "added").map((r) => r.name)).toEqual([
    "Zeta",
    "alpha",
    "mid",
  ]);
});

test("arrangeRepos sorts by name case-insensitively", () => {
  expect(arrangeRepos(repos, "", "name").map((r) => r.name)).toEqual([
    "alpha",
    "mid",
    "Zeta",
  ]);
});

test("arrangeRepos sorts by path", () => {
  expect(arrangeRepos(repos, "", "path").map((r) => r.name)).toEqual([
    "mid",
    "alpha",
    "Zeta",
  ]);
});

test("arrangeRepos filters by a name or path substring", () => {
  // Matches the name.
  expect(arrangeRepos(repos, "alph", "added").map((r) => r.name)).toEqual([
    "alpha",
  ]);
  // Matches the path only.
  expect(arrangeRepos(repos, "/other", "added").map((r) => r.name)).toEqual([
    "mid",
  ]);
  // Case-insensitive, and no match yields an empty list.
  expect(arrangeRepos(repos, "ZETA", "added").map((r) => r.name)).toEqual([
    "Zeta",
  ]);
  expect(arrangeRepos(repos, "nope", "added")).toEqual([]);
});

test("arrangeRepos filters then sorts", () => {
  const many: RepoListEntry[] = [
    { id: "1", name: "web-api", path: "/p/web-api" },
    { id: "2", name: "web-ui", path: "/p/web-ui" },
    { id: "3", name: "cli", path: "/p/cli" },
  ];
  expect(arrangeRepos(many, "web", "name").map((r) => r.name)).toEqual([
    "web-api",
    "web-ui",
  ]);
});

/** A key press with just enough of React's event surface to drive the handler. */
function press(key: string) {
  let defaultPrevented = false;
  const event = {
    key,
    preventDefault: () => {
      defaultPrevented = true;
    },
  } as React.KeyboardEvent;
  return { event, prevented: () => defaultPrevented };
}

test("activateOnKey runs the action on Enter and Space", () => {
  let runs = 0;
  const handler = activateOnKey(() => runs++);

  const enter = press("Enter");
  handler(enter.event);
  expect(runs).toBe(1);

  const space = press(" ");
  handler(space.event);
  expect(runs).toBe(2);
  // Space would scroll the drawer if the default were left alone.
  expect(space.prevented()).toBe(true);
});

test("activateOnKey ignores every other key", () => {
  let runs = 0;
  const handler = activateOnKey(() => runs++);
  for (const key of ["a", "Tab", "Escape", "ArrowDown", "Shift"]) {
    const { event, prevented } = press(key);
    handler(event);
    expect(prevented()).toBe(false);
  }
  expect(runs).toBe(0);
});

test("topLevelRepos nests attached submodules under their superproject", () => {
  const app: RepoListEntry = {
    id: "/p/app",
    name: "app",
    path: "/p/app",
    submodules: [{ name: "core", path: "/p/app/libs/core" }],
  };
  const core: RepoListEntry = { id: "/p/app/libs/core", name: "core", path: "/p/app/libs/core" };
  expect(topLevelRepos([app, core]).map((r) => r.name)).toEqual(["app"]);
  // Without its superproject listed, the submodule is a repository like any.
  expect(topLevelRepos([core]).map((r) => r.name)).toEqual(["core"]);
});

test("topLevelRepos nests a linked worktree only while its main is listed", () => {
  const main: RepoListEntry = {
    id: "/p/main",
    name: "main",
    path: "/p/main",
    worktrees: [{ name: "wt", path: "/p/wt", branch: "topic", main: false }],
  };
  const linked: RepoListEntry = {
    id: "/p/wt",
    name: "wt",
    path: "/p/wt",
    worktrees: [{ name: "main", path: "/p/main", branch: "main", main: true }],
  };
  // Both listed: the linked one lives under the main one's accordion.
  expect(topLevelRepos([main, linked]).map((r) => r.name)).toEqual(["main"]);
  expect(topLevelRepos([linked, main]).map((r) => r.name)).toEqual(["main"]);
  // The linked worktree on its own keeps its row (the main one nests).
  expect(topLevelRepos([linked]).map((r) => r.name)).toEqual(["wt"]);
  // Two linked worktrees without their main both stay top level.
  const other: RepoListEntry = {
    id: "/p/wt2",
    name: "wt2",
    path: "/p/wt2",
    worktrees: [
      { name: "main", path: "/p/main", branch: "main", main: true },
      { name: "wt", path: "/p/wt", branch: "topic", main: false },
    ],
  };
  expect(topLevelRepos([linked, other]).map((r) => r.name)).toEqual(["wt", "wt2"]);
});
