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
}

export interface GraphEdge {
  from: string;
  to: string;
  from_lane: number;
  to_lane: number;
  color: number;
}

export interface RefView {
  /** Short name; remote-tracking refs carry the remote separately. */
  name: string;
  target: string;
  remote?: string;
}

export interface RepoView {
  id: string;
  name: string;
  path: string;
  head: string | null;
  refs: RefView[];
  commits: CommitView[];
  edges: GraphEdge[];
  lane_count: number;
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

export interface PullRequestView {
  number: number;
  url: string;
  /** Head branch name the PR belongs to. */
  branch: string;
}

/** Open PRs of one repository via the server's `gh` lookup. Empty when gh is
 *  missing, unauthenticated, or the repository has no GitHub remote. */
export async function fetchPrs(repoId: string): Promise<PullRequestView[]> {
  const response = await fetch("/api/prs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: repoId }),
  });
  if (!response.ok) {
    throw new Error(`pr lookup failed: ${response.status}`);
  }
  const data = (await response.json()) as { prs: PullRequestView[] };
  return data.prs;
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

export async function fetchRepos(): Promise<RepoView[]> {
  const response = await fetch("/api/repos");
  if (!response.ok) {
    throw new Error(`failed to load repositories: ${response.status}`);
  }
  return response.json();
}

export interface AddRepoResponse {
  /** Id of the repository the path resolved to (whether or not it was new). */
  id: string;
  added: boolean;
  repos: RepoView[];
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

/** Remove a repository. Returns the authoritative updated repo list. */
export async function removeRepo(id: string): Promise<RepoView[]> {
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
