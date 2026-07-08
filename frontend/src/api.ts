export interface CommitView {
  id: string;
  row: number;
  lane: number;
  color: number;
  parents: string[];
  summary: string;
  author: string;
  time: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  from_lane: number;
  to_lane: number;
  color: number;
}

export interface RefView {
  name: string;
  target: string;
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

export async function fetchRepos(): Promise<RepoView[]> {
  const response = await fetch("/api/repos");
  if (!response.ok) {
    throw new Error(`failed to load repositories: ${response.status}`);
  }
  return response.json();
}

export async function addRepo(path: string): Promise<void> {
  const response = await fetch("/api/repos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!response.ok) {
    throw new Error((await response.text()) || `add failed: ${response.status}`);
  }
}

export async function removeRepo(id: string): Promise<void> {
  const response = await fetch("/api/repos", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: id }),
  });
  if (!response.ok) {
    throw new Error(`remove failed: ${response.status}`);
  }
}
