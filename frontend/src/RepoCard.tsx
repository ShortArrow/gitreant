import { useEffect, useMemo, useState } from "react";
import {
  fetchCommitDetail,
  fetchCommitDiff,
  fetchFileDiff,
  type CommitDetail,
  type FileDiff,
  type RefView,
  type RepoView,
} from "./api";
import { CommitDetailPanel } from "./CommitDetailPanel";
import { FileDiffPane } from "./FileDiffPane";
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
function refsByCommit(repo: RepoView): Map<string, RefView[]> {
  const map = new Map<string, RefView[]>();
  for (const ref of repo.refs) {
    const list = map.get(ref.target) ?? [];
    list.push(ref);
    map.set(ref.target, list);
  }
  return map;
}

/** What the diff pane shows: one file, or everything the commit changed. */
export type DiffTarget = { kind: "file"; path: string } | { kind: "all" };

export function RepoCard({
  repo,
  loadDetail = fetchCommitDetail,
  loadDiff = fetchFileDiff,
  loadCommitDiff = fetchCommitDiff,
}: {
  repo: RepoView;
  /** Injectable for Storybook; defaults to the real API. */
  loadDetail?: (repoId: string, commitId: string) => Promise<CommitDetail>;
  loadDiff?: (
    repoId: string,
    commitId: string,
    path: string,
  ) => Promise<FileDiff>;
  loadCommitDiff?: (repoId: string, commitId: string) => Promise<FileDiff[]>;
}) {
  const rowOf = useMemo(() => rowIndex(repo.commits), [repo.commits]);
  const refMap = useMemo(() => refsByCommit(repo), [repo.refs]);

  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [diffTarget, setDiffTarget] = useState<DiffTarget | null>(null);
  const [diffFiles, setDiffFiles] = useState<FileDiff[] | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let stale = false;
    setDetail(null);
    setDetailError(null);
    loadDetail(repo.id, selected)
      .then((data) => {
        if (!stale) setDetail(data);
      })
      .catch((e) => {
        if (!stale) setDetailError(String(e));
      });
    return () => {
      stale = true;
    };
  }, [selected, repo.id, loadDetail]);

  useEffect(() => {
    if (!selected || !diffTarget) {
      setDiffFiles(null);
      setDiffError(null);
      return;
    }
    let stale = false;
    setDiffFiles(null);
    setDiffError(null);
    const load =
      diffTarget.kind === "file"
        ? loadDiff(repo.id, selected, diffTarget.path).then((d) => [d])
        : loadCommitDiff(repo.id, selected);
    load
      .then((data) => {
        if (!stale) setDiffFiles(data);
      })
      .catch((e) => {
        if (!stale) setDiffError(String(e));
      });
    return () => {
      stale = true;
    };
  }, [selected, diffTarget, repo.id, loadDiff, loadCommitDiff]);

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

      <div className="repo-body">
      {selected && diffTarget ? (
        <FileDiffPane
          files={diffFiles}
          error={diffError}
          onClose={() => setDiffTarget(null)}
        />
      ) : (
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
          {repo.commits.map((commit) =>
            commit.id === repo.head ? (
              // HEAD: a ring in the branch color with the center punched out
              // to the card background, like vscode-git-graph. Both colors go
              // through `style` — inline styles resolve var() and win over the
              // .node CSS, while a `fill` attribute would not resolve it.
              <circle
                key={commit.id}
                className="node node-head"
                cx={nodeX(commit.lane)}
                cy={nodeY(commit.row)}
                r={NODE_RADIUS}
                style={{ stroke: laneColor(commit.color), fill: "var(--bg-elev)" }}
              />
            ) : (
              <circle
                key={commit.id}
                className="node"
                cx={nodeX(commit.lane)}
                cy={nodeY(commit.row)}
                r={NODE_RADIUS}
                fill={laneColor(commit.color)}
              />
            ),
          )}
        </svg>

        <ul className="commits">
          {repo.commits.map((commit) => {
            const refs = refMap.get(commit.id) ?? [];
            const isHead = repo.head === commit.id;
            return (
              <li
                key={commit.id}
                className={`commit${commit.id === selected ? " selected" : ""}`}
                data-testid="commit-row"
                style={{ height: ROW_HEIGHT }}
                onClick={() => {
                  setSelected((s) => (s === commit.id ? null : commit.id));
                  setDiffTarget(null);
                }}
              >
                {isHead && <span className="badge badge-head">HEAD</span>}
                {refs.map((ref) => (
                  <span
                    key={ref.remote ? `${ref.remote}/${ref.name}` : ref.name}
                    className={`badge badge-ref${ref.remote ? " badge-remote" : ""}`}
                  >
                    {ref.remote && (
                      <span className="badge-remote-name" data-testid="badge-remote">
                        {ref.remote}
                      </span>
                    )}
                    <span className="badge-ref-name">{ref.name}</span>
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
      )}

      {selected && (
        <CommitDetailPanel
          detail={detail}
          error={detailError}
          onSelectFile={(path) => setDiffTarget({ kind: "file", path })}
          onShowAllDiffs={() => setDiffTarget({ kind: "all" })}
          onClose={() => {
            setSelected(null);
            setDiffTarget(null);
          }}
        />
      )}
      </div>
    </section>
  );
}
