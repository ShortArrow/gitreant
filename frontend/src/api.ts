export interface CommitView {
  id: string;
  row: number;
  lane: number;
  color: number;
  parents: string[];
  summary: string;
  author: string;
  time: number;
  /** Kind of the embedded signature ("openpgp", "ssh", ...), if signed. */
  signature?: string;
  /** true = gpg verified the signature, false = judged it invalid;
   *  absent = unchecked (no gpg, unknown key, or unsigned). */
  verified?: boolean;
  /** Signing key id, when gpg could attribute one. */
  signature_key?: string;
  /** A stash's index/untracked helper commit; hidden unless the stash
   *  internals toggle is on. */
  stash_internal?: boolean;
  /** The author's GitHub avatar URL, when the server could resolve one. */
  avatar?: string;
  /** The synthetic uncommitted-changes row above HEAD: how many paths the
   *  working tree changed. Absent on every real commit. */
  uncommitted?: number;
}

/** The id the uncommitted-changes row carries; detail and diff requests
 *  with it read the working tree against HEAD. */
export const UNCOMMITTED_ID = "uncommitted";

export interface GraphEdge {
  from: string;
  to: string;
  from_lane: number;
  to_lane: number;
  color: number;
  /** Lane-crossing first-parent edge: runs in the child's lane, bends at
   *  the parent. Merge edges bend at the merge commit instead. */
  fork: boolean;
  /** Drawn dashed: an auxiliary link into a stash's internal structure. */
  dashed?: boolean;
}

/** The `analyzing` SSE event payload: how far the server's current
 * multi-repository read has come. */
export interface AnalyzeInfo {
  /** The repository id (canonical path) being read. */
  id: string;
  /** 1-based position of this repository in the read. */
  index: number;
  /** How many repositories the read covers. */
  total: number;
  /** Commits read so far in this repository. */
  commits: number;
  /** Commit count of the previous successful read, when known. */
  expected?: number | null;
}

export interface RefView {
  /** Short name; remote-tracking refs carry the remote separately. */
  name: string;
  target: string;
  remote?: string;
  /** "branch", "tag", "stash" or "other" — rendered as distinct badges. */
  kind: string;
}

export interface RepoView {
  id: string;
  name: string;
  path: string;
  head: string | null;
  /** Short name of the checked-out branch; absent when HEAD is detached. */
  head_branch?: string;
  /** Web URL of the origin remote, when it points at github.com. */
  github_url?: string;
  refs: RefView[];
  commits: CommitView[];
  edges: GraphEdge[];
  lane_count: number;
  /** Total commits in the repository; `commits` may be a paged prefix. */
  total: number;
  error?: string;
}

export interface FileChange {
  path: string;
  /** "A" (added), "M" (modified), "D" (deleted) or "R" (rewritten). */
  status: string;
  additions: number;
  deletions: number;
}

export interface CommitDetail {
  id: string;
  /** Full commit message (summary and body). */
  message: string;
  author: string;
  email: string;
  time: number;
  parents: string[];
  /** Kind of the embedded signature ("openpgp", "ssh", ...), if signed.
   *  Presence only — the server does not verify it. */
  signature?: string;
  /** Changes against the first parent (or the empty tree for a root commit). */
  files: FileChange[];
}

export interface FileDiff {
  path: string;
  /** "A" (added), "M" (modified) or "D" (deleted). */
  status: string;
  /** True when either side looks binary; `text` is empty then. */
  binary: boolean;
  /** Unified diff hunks ("@@ ..." headers with -/+/context lines). */
  text: string;
}

/** Load one file's unified diff against the commit's first parent. */
export async function fetchFileDiff(
  repoId: string,
  commitId: string,
  path: string,
): Promise<FileDiff> {
  const response = await fetch("/api/diff", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: repoId, id: commitId, path }),
  });
  if (!response.ok) {
    throw new Error(
      (await response.text()) || `file diff failed: ${response.status}`,
    );
  }
  return response.json();
}

export interface CommandLogEntry {
  /** Seconds since the Unix epoch when the command finished. */
  time: number;
  /** The repository id (canonical path) the command ran in. */
  repo: string;
  /** The full command line. */
  command: string;
  ok: boolean;
  /** stderr on failure, empty on success. */
  message: string;
}

export interface BranchOpResult {
  ok: boolean;
  /** git's stderr when the operation failed (e.g. merge conflicts). */
  message: string;
}

async function branchOp(
  endpoint: string,
  repoId: string,
  reference: string,
): Promise<BranchOpResult> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: repoId, reference }),
  });
  if (!response.ok) {
    throw new Error(
      (await response.text()) || `branch operation failed: ${response.status}`,
    );
  }
  return response.json();
}

/** Switch the repository to a branch (server-side `git switch`). */
export function checkoutRef(
  repoId: string,
  reference: string,
): Promise<BranchOpResult> {
  return branchOp("/api/checkout", repoId, reference);
}

/** Merge a reference into the checked-out branch (server-side `git merge`). */
export function mergeRef(
  repoId: string,
  reference: string,
): Promise<BranchOpResult> {
  return branchOp("/api/merge", repoId, reference);
}

async function tagOp(
  method: "POST" | "DELETE",
  body: Record<string, string>,
): Promise<BranchOpResult> {
  const response = await fetch("/api/tag", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      (await response.text()) || `tag operation failed: ${response.status}`,
    );
  }
  return response.json();
}

/** Create a lightweight tag at a commit (server-side `git tag`). */
export function createTag(
  repoId: string,
  name: string,
  commit: string,
): Promise<BranchOpResult> {
  return tagOp("POST", { repo: repoId, name, commit });
}

/** Delete a local tag (server-side `git tag -d`). */
export function deleteTag(
  repoId: string,
  name: string,
): Promise<BranchOpResult> {
  return tagOp("DELETE", { repo: repoId, name });
}

/** Create a branch at a commit without checking it out (`git branch`). */
export async function createBranch(
  repoId: string,
  name: string,
  commit: string,
): Promise<BranchOpResult> {
  const response = await fetch("/api/branch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: repoId, name, commit }),
  });
  if (!response.ok) {
    throw new Error(
      (await response.text()) || `branch create failed: ${response.status}`,
    );
  }
  return response.json();
}

export interface PullRequestView {
  number: number;
  url: string;
  /** Head branch name the PR belongs to. */
  branch: string;
}

export interface MergedPullRequestView {
  number: number;
  url: string;
  /** Head branch name the PR belonged to. */
  branch: string;
  /** The commit the PR landed as on the base branch (squash or merge). */
  merge_commit: string;
}

export interface PrLookupView {
  /** Open pull requests. */
  prs: PullRequestView[];
  /** Recently merged pull requests, for squash-merge links in the graph. */
  merged: MergedPullRequestView[];
}

/** PRs of one repository via the server's `gh` lookup. Empty when gh is
 *  missing, unauthenticated, or the repository has no GitHub remote. */
export async function fetchPrs(repoId: string): Promise<PrLookupView> {
  const response = await fetch("/api/prs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: repoId }),
  });
  if (!response.ok) {
    throw new Error(`pr lookup failed: ${response.status}`);
  }
  return response.json();
}

/** The external commands the server executed, oldest first. */
export async function fetchCommandLog(): Promise<CommandLogEntry[]> {
  const response = await fetch("/api/log");
  if (!response.ok) {
    throw new Error(`command log failed: ${response.status}`);
  }
  return response.json();
}

export interface FetchResult {
  /** One entry per repository whose fetch failed; empty on full success. */
  errors: { repo: string; message: string }[];
}

/** Fetch all remotes of every displayed repository (server-side `git fetch`). */
export async function fetchRemotes(): Promise<FetchResult> {
  const response = await fetch("/api/fetch", { method: "POST" });
  if (!response.ok) {
    throw new Error(`fetch failed: ${response.status}`);
  }
  return response.json();
}

/** Load the unified diffs of every file one commit changed. */
export async function fetchCommitDiff(
  repoId: string,
  commitId: string,
): Promise<FileDiff[]> {
  const response = await fetch("/api/commit-diff", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: repoId, id: commitId }),
  });
  if (!response.ok) {
    throw new Error(
      (await response.text()) || `commit diff failed: ${response.status}`,
    );
  }
  return response.json();
}

/** Load one commit's details on demand (ids are paths, hence a JSON body). */
export async function fetchCommitDetail(
  repoId: string,
  commitId: string,
): Promise<CommitDetail> {
  const response = await fetch("/api/commit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: repoId, id: commitId }),
  });
  if (!response.ok) {
    throw new Error(
      (await response.text()) || `commit detail failed: ${response.status}`,
    );
  }
  return response.json();
}

/** One entry of the instant repository list (ADR 0023). */
/** A submodule declared by a repository, for drawer grouping. */
export interface SubmoduleEntry {
  name: string;
  /** Absolute path; opening it attaches the submodule as its own view. */
  path: string;
}

export interface RepoListEntry {
  id: string;
  name: string;
  path: string;
  /** Declared submodules, when the repository has a `.gitmodules`. */
  submodules?: SubmoduleEntry[];
}

/** The repository list, answered without reading any graph. */
export async function fetchRepoList(): Promise<RepoListEntry[]> {
  const response = await fetch("/api/list");
  if (!response.ok) {
    throw new Error(`failed to load repositories: ${response.status}`);
  }
  return response.json();
}

/** One submodule-pointer update: superproject `commit` moved the gitlink to
 * submodule commit `sha`. */
export interface GitlinkUpdate {
  commit: string;
  sha: string;
}

/** A submodule's graph beside its superproject, plus its pointer history —
 * the input for the cross-region dashed correlation links. */
export interface SubmoduleGraph {
  name: string;
  path: string;
  view: RepoView;
  updates: GitlinkUpdate[];
}

/** The graphs and pointer history of a repository's submodules. Empty when
 * the repository declares none. */
export async function fetchSubmoduleGraphs(
  id: string,
): Promise<SubmoduleGraph[]> {
  const response = await fetch("/api/submodules", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: id }),
  });
  if (!response.ok) {
    throw new Error(`failed to load submodules: ${response.status}`);
  }
  return response.json();
}

/** What the server was built from, for the info dialog. */
export interface AboutView {
  version: string;
  /** Short commit hash baked in at build time ("unknown" without git). */
  commit: string;
}

export async function fetchAbout(): Promise<AboutView> {
  const response = await fetch("/api/about");
  if (!response.ok) {
    throw new Error(`failed to load about: ${response.status}`);
  }
  return response.json();
}

/** A repository's uncommitted / unpushed summary for the drawer. */
export interface RepoStatus {
  /** Uncommitted changes (staged, unstaged and untracked). */
  dirty: number;
  /** Commits on a local branch that are on no remote. */
  unpushed: number;
  /** Local branches that track no upstream. */
  local_branches: number;
}

/** The git-state summary of one repository (runs git; loaded per repo). */
export async function fetchRepoStatus(id: string): Promise<RepoStatus> {
  const response = await fetch("/api/status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: id }),
  });
  if (!response.ok) {
    throw new Error(`failed to load status: ${response.status}`);
  }
  return response.json();
}

/** One repository's view (graph, refs, layout) — the slow read. `limit`
 * caps the returned rows to a paged prefix (ADR 0023). */
export async function fetchRepoView(
  id: string,
  limit?: number,
): Promise<RepoView> {
  const response = await fetch("/api/view", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: id, limit }),
  });
  if (!response.ok) {
    throw new Error(`failed to load repository: ${response.status}`);
  }
  return response.json();
}

export interface AddRepoResponse {
  /** Id of the repository the path resolved to (whether or not it was new). */
  id: string;
  added: boolean;
  repos: RepoListEntry[];
}

/** Add a repository. The response carries the authoritative updated repo list. */
export async function addRepo(path: string): Promise<AddRepoResponse> {
  const response = await fetch("/api/repos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!response.ok) {
    throw new Error((await response.text()) || `add failed: ${response.status}`);
  }
  return response.json();
}

/** Open a native folder picker on the server machine; returns the chosen path
 *  (or null if cancelled). */
export async function pickFolder(): Promise<string | null> {
  const response = await fetch("/api/pick", { method: "POST" });
  if (!response.ok) {
    throw new Error(`pick failed: ${response.status}`);
  }
  const data = (await response.json()) as { path: string | null };
  return data.path;
}

/** Open a repository folder (or a repository-relative file when `path` is
 * given) with the OS default handler on the server machine. */
export async function revealPath(repo: string, path?: string): Promise<void> {
  const response = await fetch("/api/reveal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo, path }),
  });
  if (!response.ok) {
    throw new Error((await response.text()) || `reveal failed: ${response.status}`);
  }
}

/** Drop the server's cached signature verdicts and re-verify — the SPA
 * reloads on the resulting update. Use after adding a key to gpg. */
export async function refreshVerdicts(): Promise<void> {
  const response = await fetch("/api/refresh", { method: "POST" });
  if (!response.ok) {
    throw new Error(`refresh failed: ${response.status}`);
  }
}

/** Remove a repository. Returns the authoritative updated repo list. */
export async function removeRepo(id: string): Promise<RepoListEntry[]> {
  const response = await fetch("/api/repos", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: id }),
  });
  if (!response.ok) {
    throw new Error(`remove failed: ${response.status}`);
  }
  return response.json();
}
