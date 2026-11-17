import { expect, test } from "vitest";
import type { CommitView, PullRequestView, RefView } from "./api";
import { baseFor } from "./baseModel";

function commit(id: string, parents: string[] = []): CommitView {
  return {
    id,
    row: 0,
    lane: 0,
    color: 0,
    parents,
    summary: id,
    author: "a",
    time: 0,
  };
}

const branch = (name: string, target: string): RefView => ({
  name,
  target,
  kind: "branch",
});
const remote = (name: string, target: string): RefView => ({
  name,
  target,
  remote: "origin",
  kind: "branch",
});

// root ─ m1 (main)
//    └─ d1 ─ f1 (feature)   d1 is develop
//              └─ g1 (other)
const commits = [
  commit("m1", ["root"]),
  commit("g1", ["f1"]),
  commit("f1", ["d1"]),
  commit("d1", ["root"]),
  commit("root"),
];
const refs = [
  branch("main", "m1"),
  branch("develop", "d1"),
  branch("feature", "f1"),
  branch("other", "g1"),
];
const pr = (number: number, head: string, base?: string): PullRequestView => ({
  number,
  url: `u/${number}`,
  branch: head,
  base,
});

test("the base is the one the pull request of the nearest branch holding the commit names", () => {
  const prs = new Map([
    ["feature", pr(7, "feature", "develop")],
    ["other", pr(8, "other", "main")],
  ]);
  expect(baseFor("f1", { commits, refs }, prs)).toEqual({
    branch: "develop",
    revision: "develop",
    pr: 7,
  });
});

test("without a pull request the base is the default branch, then main, master or HEAD's", () => {
  const none = new Map<string, PullRequestView>();
  expect(baseFor("f1", { commits, refs, default_branch: "develop" }, none)).toEqual({
    branch: "develop",
    revision: "develop",
  });
  expect(baseFor("f1", { commits, refs }, none)).toEqual({
    branch: "main",
    revision: "main",
  });
  const noMain = refs.filter((r) => r.name !== "main");
  expect(
    baseFor(
      "f1",
      { commits, refs: [...noMain, branch("master", "m1")] },
      none,
    ),
  ).toEqual({ branch: "master", revision: "master" });
  expect(
    baseFor("g1", { commits, refs: noMain, head_branch: "feature" }, none),
  ).toEqual({ branch: "feature", revision: "feature" });
});

test("a base held only on the remote is compared as the remote's branch", () => {
  const onlyRemote = [
    remote("main", "m1"),
    branch("feature", "f1"),
  ];
  expect(
    baseFor("f1", { commits, refs: onlyRemote }, new Map()),
  ).toEqual({ branch: "main", revision: "origin/main" });
});

test("no base is offered where the base already holds the commit or none is found", () => {
  const none = new Map<string, PullRequestView>();
  expect(baseFor("d1", { commits, refs, default_branch: "develop" }, none)).toBeNull();
  expect(baseFor("root", { commits, refs }, none)).toBeNull();
  expect(baseFor("f1", { commits, refs: [branch("feature", "f1")] }, none)).toBeNull();
});
