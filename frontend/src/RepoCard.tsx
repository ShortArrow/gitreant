import { useMemo } from "react";
import type { RepoView } from "./api";
import {
  edgePath,
  graphHeight,
  graphWidth,
  laneColor,
  nodeX,
  nodeY,
  rowIndex,
  ROW_HEIGHT,
  NODE_RADIUS,
  shortId,
} from "./graph";

/** Group refs by the commit id they point at, so each row can show its badges. */
function refsByCommit(repo: RepoView): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const ref of repo.refs) {
    const list = map.get(ref.target) ?? [];
    list.push(ref.name);
    map.set(ref.target, list);
  }
  return map;
}

export function RepoCard({ repo }: { repo: RepoView }) {
  const rowOf = useMemo(() => rowIndex(repo.commits), [repo.commits]);
  const refMap = useMemo(() => refsByCommit(repo), [repo.refs]);

  if (repo.error) {
    return (
      <section className="repo">
        <header className="repo-header">
          <h2>{repo.name}</h2>
          <span className="repo-path">{repo.path}</span>
        </header>
        <p className="repo-error">{repo.error}</p>
      </section>
    );
  }

  const width = graphWidth(repo.lane_count);
  const height = graphHeight(repo.commits.length);

  return (
    <section className="repo">
      <header className="repo-header">
        <h2>{repo.name}</h2>
        <span className="repo-path">{repo.path}</span>
        <span className="repo-count">{repo.commits.length} commits</span>
      </header>

      <div className="graph-and-list">
        <svg
          className="graph"
          data-testid="graph"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {repo.edges.map((edge, i) => (
            <path
              key={`e${i}`}
              d={edgePath(edge, rowOf)}
              fill="none"
              stroke={laneColor(edge.color)}
              strokeWidth={2}
            />
          ))}
          {repo.commits.map((commit) => (
            <circle
              key={commit.id}
              cx={nodeX(commit.lane)}
              cy={nodeY(commit.row)}
              r={NODE_RADIUS}
              fill={laneColor(commit.color)}
              stroke="#0d1117"
              strokeWidth={1.5}
            />
          ))}
        </svg>

        <ul className="commits">
          {repo.commits.map((commit) => {
            const refs = refMap.get(commit.id) ?? [];
            const isHead = repo.head === commit.id;
            return (
              <li
                key={commit.id}
                className="commit"
                data-testid="commit-row"
                style={{ height: ROW_HEIGHT }}
              >
                {isHead && <span className="badge badge-head">HEAD</span>}
                {refs.map((name) => (
                  <span key={name} className="badge badge-ref">
                    {name}
                  </span>
                ))}
                <span className="commit-summary">{commit.summary}</span>
                <span className="commit-meta">
                  {shortId(commit.id)} · {commit.author}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
