import { expect, test } from "vitest";
import type { RepoListEntry } from "./api";
import { arrangeRepos } from "./Drawer";

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
