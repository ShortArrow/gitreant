import type { CommitDetail, CommitView, GraphEdge, RepoView } from "../api";

let clock = 1_700_000_000;

function commit(
  id: string,
  row: number,
  lane: number,
  color: number,
  parents: string[],
  summary: string,
): CommitView {
  return { id, row, lane, color, parents, summary, author: "Tester", time: clock-- };
}

function edge(
  from: string,
  to: string,
  fromLane: number,
  toLane: number,
  color: number,
): GraphEdge {
  return { from, to, from_lane: fromLane, to_lane: toLane, color };
}

/** A repo with a feature branch merged back: two lanes and a merge node. */
export const mergeRepo: RepoView = {
  id: "/repos/demo",
  name: "demo",
  path: "/home/user/repos/demo",
  head: "m",
  refs: [
    { name: "main", target: "m" },
    { name: "main", target: "m", remote: "origin" },
    { name: "feature", target: "f1" },
  ],
  commits: [
    commit("m", 0, 0, 0, ["a2", "f1"], "merge feature branch"),
    commit("a2", 1, 0, 0, ["a1"], "main: tweak config"),
    commit("f1", 2, 1, 1, ["a1"], "feature: add endpoint"),
    commit("a1", 3, 0, 0, ["a0"], "main: initial layout"),
    commit("a0", 4, 0, 0, [], "root commit"),
  ],
  edges: [
    edge("m", "a2", 0, 0, 0),
    edge("m", "f1", 0, 1, 1),
    edge("a2", "a1", 0, 0, 0),
    edge("f1", "a1", 1, 0, 1),
    edge("a1", "a0", 0, 0, 0),
  ],
  lane_count: 2,
};

/** A feature merged back only after many main commits: the merge-to-parent
 * edge spans many rows and must run vertically, not diagonally. */
export const longMergeRepo: RepoView = (() => {
  const mains = Array.from({ length: 10 }, (_, i) => {
    const n = 10 - i;
    return commit(`a${n}`, i + 1, 0, 0, [`a${n - 1}`], `main: change ${n}`);
  });
  return {
    id: "/repos/long",
    name: "long",
    path: "/home/user/repos/long",
    head: "m",
    refs: [
      { name: "main", target: "m" },
      { name: "feature", target: "f1" },
    ],
    commits: [
      commit("m", 0, 0, 0, ["a10", "f1"], "merge feature"),
      ...mains,
      commit("f1", 11, 1, 1, ["a0"], "feature: early work"),
      commit("a0", 12, 0, 0, [], "root"),
    ],
    edges: [
      edge("m", "a10", 0, 0, 0),
      edge("m", "f1", 0, 1, 1),
      ...mains.map((c) => edge(c.id, c.parents[0], 0, 0, 0)),
      edge("f1", "a0", 1, 0, 1),
    ],
    lane_count: 2,
  };
})();

/** A small linear repo. */
export const linearRepo: RepoView = {
  id: "/repos/notes",
  name: "notes",
  path: "/home/user/repos/notes",
  head: "n2",
  refs: [{ name: "main", target: "n2" }],
  commits: [
    commit("n2", 0, 0, 0, ["n1"], "add second note"),
    commit("n1", 1, 0, 0, [], "add first note"),
  ],
  edges: [edge("n2", "n1", 0, 0, 0)],
  lane_count: 1,
};

/** Details of one commit, as returned by POST /api/commit. */
export const commitDetail: CommitDetail = {
  id: "1234567890abcdef1234567890abcdef12345678",
  message:
    "feat(graph): topological lane layout\n\n" +
    "Assign each commit a column so children sit above their parents.\n" +
    "Freed columns are reused to keep the graph compact.",
  author: "Tester",
  email: "tester@example.com",
  time: 1_700_000_000,
  parents: ["abcdef1234567890abcdef1234567890abcdef12"],
  signature: "openpgp",
  files: [
    { path: "src/domain/graph.rs", status: "M", additions: 42, deletions: 7 },
    { path: "src/domain/mod.rs", status: "M", additions: 2, deletions: 0 },
    { path: "docs/adr/0001-architecture.md", status: "A", additions: 30, deletions: 0 },
    { path: "src/old_layout.rs", status: "D", additions: 0, deletions: 118 },
  ],
};

/** A repo that failed to read. */
export const erroredRepo: RepoView = {
  id: "/repos/broken",
  name: "broken",
  path: "/home/user/repos/broken",
  head: null,
  refs: [],
  commits: [],
  edges: [],
  lane_count: 0,
  error: "open /home/user/repos/broken: not a git repository",
};
