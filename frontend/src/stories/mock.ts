import type {
  CommitDetail,
  CommitView,
  FileDiff,
  GraphEdge,
  RepoView,
  SubmoduleGraph,
} from "../api";

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
  return { from, to, from_lane: fromLane, to_lane: toLane, color, fork: false };
}

/** A repo with a feature branch merged back: two lanes and a merge node. */
export const mergeRepo: RepoView = {
  id: "/repos/demo",
  name: "demo",
  path: "/home/user/repos/demo",
  head: "m",
  refs: [
    { name: "main", target: "m", kind: "branch" },
    { name: "main", target: "m", remote: "origin", kind: "branch" },
    { name: "feature", target: "f1", kind: "branch" },
    { name: "v1.0", target: "a1", kind: "tag" },
    { name: "v0.9", target: "a1", remote: "origin", kind: "tag" },
  ],
  commits: [
    { ...commit("m", 0, 0, 0, ["a2", "f1"], "merge feature branch"), signature: "openpgp" },
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
  total: 5,
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
      { name: "main", target: "m", kind: "branch" },
      { name: "feature", target: "f1", kind: "branch" },
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
    total: 13,
  };
})();

/** A repo carrying a `git stash`: the stash commit fans out to its index and
 * untracked-files helper commits. Hidden by default (each stash reads as one
 * node); the stash-internals toggle reveals the dashed helper links. */
export const stashRepo: RepoView = {
  id: "/repos/wip",
  name: "wip",
  path: "/home/user/repos/wip",
  head: "m",
  refs: [
    { name: "main", target: "m", kind: "branch" },
    { name: "stash", target: "s", kind: "stash" },
  ],
  commits: [
    commit("m", 0, 0, 0, ["a1"], "main: latest work"),
    { ...commit("s", 1, 1, 1, ["a1", "idx", "unt"], "WIP on main: stashed") },
    { ...commit("idx", 2, 1, 1, ["a1"], "index on main"), stash_internal: true },
    { ...commit("unt", 3, 2, 2, [], "untracked files on main"), stash_internal: true },
    commit("a1", 4, 0, 0, ["a0"], "main: initial layout"),
    commit("a0", 5, 0, 0, [], "root commit"),
  ],
  edges: [
    edge("m", "a1", 0, 0, 0),
    { ...edge("s", "a1", 1, 0, 1), fork: true },
    { ...edge("s", "idx", 1, 1, 1), dashed: true },
    { ...edge("s", "unt", 1, 2, 2), dashed: true },
    { ...edge("idx", "a1", 1, 0, 1), fork: true, dashed: true },
    edge("a1", "a0", 0, 0, 0),
  ],
  lane_count: 3,
  total: 6,
};

/** A submodule graph beside `mergeRepo`: two pointer updates correlate its
 * commits with the superproject's (item 9's cross-region dashed links). */
export const submoduleGraphs: SubmoduleGraph[] = [
  {
    name: "libs/core",
    path: "/home/user/repos/demo/libs/core",
    view: {
      id: "/repos/demo/libs/core",
      name: "core",
      path: "/home/user/repos/demo/libs/core",
      head: null,
      refs: [],
      commits: [
        commit("s2", 0, 0, 0, ["s1"], "core: fix parser"),
        commit("s1", 1, 0, 0, [], "core: initial"),
      ],
      edges: [edge("s2", "s1", 0, 0, 0)],
      lane_count: 1,
      total: 2,
    },
    updates: [
      { commit: "m", sha: "s2" },
      { commit: "a1", sha: "s1" },
    ],
  },
];

/** A linear repo whose commits carry resolved GitHub author avatars. */
export const avatarRepo: RepoView = {
  id: "/repos/team",
  name: "team",
  path: "/home/user/repos/team",
  head: "c2",
  refs: [{ name: "main", target: "c2", kind: "branch" }],
  commits: [
    {
      ...commit("c2", 0, 0, 0, ["c1"], "feat: add endpoint"),
      avatar: "https://avatars.githubusercontent.com/u/1?v=4",
    },
    {
      ...commit("c1", 1, 0, 0, [], "chore: scaffold"),
      avatar: "https://github.com/octocat.png",
    },
  ],
  edges: [edge("c2", "c1", 0, 0, 0)],
  lane_count: 1,
  total: 2,
};

/** A small linear repo. */
export const linearRepo: RepoView = {
  id: "/repos/notes",
  name: "notes",
  path: "/home/user/repos/notes",
  head: "n2",
  refs: [{ name: "main", target: "n2", kind: "branch" }],
  commits: [
    commit("n2", 0, 0, 0, ["n1"], "add second note"),
    commit("n1", 1, 0, 0, [], "add first note"),
  ],
  edges: [edge("n2", "n1", 0, 0, 0)],
  lane_count: 1,
  total: 2,
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

/** A production-style body exercising every message shape the renderer
 * supports: hard-wrapped prose, wrapped bullets, an indented code block,
 * a fenced block and inline code. */
export const richMessageDetail: CommitDetail = {
  ...commitDetail,
  id: "4043bc624ad30d6cd059d892a8ceb3b7cc9da79a",
  message:
    "feat: HPS Linux bring-up (kernel + rootfs + ssh over serial loady)\n\n" +
    "Boots Linux 5.11 (Altera socfpga) with a Buildroot rootfs (dropbear\n" +
    "ssh) on the HPS. The kernel/DT/rootfs are transferred over the serial\n" +
    "console with u-boot `loady` (ymodem), avoiding the ~2h JTAG load and\n" +
    "the 2013 u-boot's broken ethernet path.\n\n" +
    "- blink/ymodem_send.py: YMODEM-1K sender driving u-boot 'loady' over\n" +
    "  COM12 (python + pyserial), with progress percentage.\n" +
    "- blink/linux/socfpga_cyclone5_sypcie.dts: board device tree. Uses\n" +
    "  gmac0 (EMAC0) with the KSZ9021 PHY - this board wires the PHY to\n" +
    "  EMAC0, not gmac1 as the dev kits do - and 512 MiB memory.\n" +
    "- docs/HPS_LINUX.md: full bring-up procedure, including the r0-r3=0\n" +
    "  SPL entry and the clean-power-off recovery.\n\n" +
    "Load it on the board:\n\n" +
    "    loady 0x2000000\n" +
    "    bootm 0x2000000 - 0x2100000\n\n" +
    "Verified: host PC can `ssh sypcie-board` (ProxyJump via the PCIe\n" +
    "host) into root@buildroot on the board. Current image is RAM-only\n" +
    "(volatile); QSPI persistence is the next step.\n\n" +
    "```\nmake ARCH=arm socfpga_defconfig zImage\n```",
};

/** A single-line message: no body, so no expand bar. */
export const summaryOnlyDetail: CommitDetail = {
  ...commitDetail,
  message: "chore: bump dependencies",
};

/** One file's unified diff, as returned by POST /api/diff. */
export const fileDiff: FileDiff = {
  path: "src/domain/graph.rs",
  status: "M",
  binary: false,
  text:
    "@@ -1,4 +1,5 @@\n" +
    " use serde::Serialize;\n" +
    "-fn lane(commit: &Commit) -> usize {\n" +
    "-    0\n" +
    "+fn lane(state: &mut LayoutState, commit: &Commit) -> usize {\n" +
    "+    state.lane_for(&commit.id)\n" +
    " }\n" +
    " \n",
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
  total: 0,
  error: "open /home/user/repos/broken: not a git repository",
};
