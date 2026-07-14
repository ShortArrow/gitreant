import { useEffect, useMemo, useState } from "react";
import { CommitHash } from "./CommitHash";
import {
  checkoutRef,
  fetchCommitDetail,
  fetchCommitDiff,
  fetchFileDiff,
  fetchPrs,
  mergeRef,
  type BranchOpResult,
  type CommitDetail,
  type FileDiff,
  type PullRequestView,
  type RefView,
  type RepoView,
} from "./api";
import { RefMenu, type RefMenuTarget } from "./RefMenu";
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

/** Badge for a signed commit, following GitHub's wording: "Verified" only
 * when gpg actually validated the signature, "Unverified" when it judged it
 * invalid, and a plain "Signed" when it could not be checked. */
export function signatureBadge(verified?: boolean): {
  label: string;
  className: string;
  title: string;
} {
  if (verified === true) {
    return {
      label: "Verified",
      className: "badge badge-signed badge-verified",
      title: "Signature verified against your local gpg keyring",
    };
  }
  if (verified === false) {
    return {
      label: "Unverified",
      className: "badge badge-signed badge-unverified",
      title: "Signature did not verify (invalid, expired or revoked)",
    };
  }
  return {
    label: "Signed",
    className: "badge badge-signed",
    title: "Carries a signature gitreant could not check",
  };
}

export function RepoCard({
  repo,
  loadDetail = fetchCommitDetail,
  loadDiff = fetchFileDiff,
  loadCommitDiff = fetchCommitDiff,
  loadPrs = fetchPrs,
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
  loadPrs?: (repoId: string) => Promise<PullRequestView[]>;
}) {
  const rowOf = useMemo(() => rowIndex(repo.commits), [repo.commits]);
  const refMap = useMemo(() => refsByCommit(repo), [repo.refs]);

  // Open PRs by head branch name; loads lazily and silently stays empty when
  // the server has no gh (or the repo no GitHub remote).
  const [prByBranch, setPrByBranch] = useState<Map<string, PullRequestView>>(
    new Map(),
  );
  useEffect(() => {
    let stale = false;
    loadPrs(repo.id)
      .then((prs) => {
        if (!stale) setPrByBranch(new Map(prs.map((pr) => [pr.branch, pr])));
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [repo.id, loadPrs]);

  const [refMenu, setRefMenu] = useState<RefMenuTarget | null>(null);
  // Result of the last branch operation that failed; cleared on the next one.
  const [opError, setOpError] = useState<string | null>(null);
  const runBranchOp = (
    op: (repoId: string, reference: string) => Promise<BranchOpResult>,
    reference: string,
  ) => {
    setOpError(null);
    op(repo.id, reference)
      .then((result) => {
        if (!result.ok) setOpError(result.message);
      })
      .catch((e) => setOpError(String(e)));
  };

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
  const selectedCommit = selected
    ? repo.commits.find((c) => c.id === selected)
    : undefined;

  return (
    <section className="repo">
      <header className="repo-header">
        <h2>{repo.name}</h2>
        <span className="repo-path">{repo.path}</span>
        <span className="repo-count">{repo.commits.length} commits</span>
      </header>

      {opError && (
        <p className="repo-error" data-testid="op-error">
          {opError}
        </p>
      )}

      {refMenu && (
        <RefMenu
          target={refMenu}
          headBranch={repo.head_branch}
          onCheckout={(reference) => runBranchOp(checkoutRef, reference)}
          onMerge={(reference) => runBranchOp(mergeRef, reference)}
          onClose={() => setRefMenu(null)}
        />
      )}

      <div className="repo-body">
      {selected && diffTarget ? (
        <FileDiffPane
          files={diffFiles}
          error={diffError}
          commitId={selected}
          githubUrl={repo.github_url}
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
                {refs.map((ref) => {
                  const pr = prByBranch.get(ref.name);
                  const qualified = ref.remote
                    ? `${ref.remote}/${ref.name}`
                    : ref.name;
                  return (
                    <span
                      key={qualified}
                      className={`badge badge-ref${ref.remote ? " badge-remote" : ""}`}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setRefMenu({
                          x: e.clientX,
                          y: e.clientY,
                          reference: qualified,
                        });
                      }}
                    >
                      {ref.remote && (
                        <span className="badge-remote-name" data-testid="badge-remote">
                          {ref.remote}
                        </span>
                      )}
                      <span className="badge-ref-name">{ref.name}</span>
                      {pr && (
                        <a
                          className="badge-pr"
                          data-testid="badge-pr"
                          href={pr.url}
                          target="_blank"
                          rel="noreferrer"
                          title={`Open pull request #${pr.number} on GitHub`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          #{pr.number}
                        </a>
                      )}
                    </span>
                  );
                })}
                <span
                  className={`commit-summary${
                    commit.parents.length > 1 ? " commit-summary-merge" : ""
                  }`}
                >
                  {commit.summary}
                </span>
                <span className="commit-meta">
                  {commit.signature &&
                    (() => {
                      const badge = signatureBadge(commit.verified);
                      return (
                        <span
                          className={badge.className}
                          data-testid="badge-signed"
                          title={badge.title}
                        >
                          {badge.label}
                        </span>
                      );
                    })()}
                  {commit.author} · <CommitHash id={commit.id} />
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
          verified={selectedCommit?.verified}
          signatureKey={selectedCommit?.signature_key}
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
