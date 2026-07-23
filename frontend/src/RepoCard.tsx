import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CommitHash } from "./CommitHash";
import { CommitMenu } from "./CommitMenu";
import {
  checkoutRef,
  createBranch,
  createTag,
  deleteTag,
  fetchCommitDetail,
  fetchCommitDiff,
  fetchFileDiff,
  fetchPrs,
  fetchSubmoduleGraphs,
  mergeRef,
  revealPath,
  type BranchOpResult,
  type CommitDetail,
  type FileDiff,
  type MergedPullRequestView,
  type PrLookupView,
  type PullRequestView,
  type RefView,
  type RepoView,
  type SubmoduleGraph,
} from "./api";
import { DraggableDashed } from "./DraggableDashed";
import {
  BranchBadgeIcon,
  PrLinkIcon,
  StashBadgeIcon,
  TagBadgeIcon,
} from "./Icons";
import { RefMenu, type RefMenuTarget } from "./RefMenu";
import { format, MESSAGES } from "./i18n";
import { useCommands, type PaletteCommand } from "./palette";
import {
  SettingsContext,
  useAvatars,
  useSquashLinks,
  useStashInternals,
  useSubmoduleLinks,
  useT,
} from "./settings";
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
  laneSpan,
  linkPath,
  rowTime,
  squashLinks,
  stashView,
  crossPath,
  submoduleCrossLinks,
  submoduleRegions,
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

const NO_COMMANDS: PaletteCommand[] = [];

export function RepoCard({
  repo,
  focused = true,
  onLoadMore,
  loadDetail = fetchCommitDetail,
  loadDiff = fetchFileDiff,
  loadCommitDiff = fetchCommitDiff,
  loadPrs = fetchPrs,
  loadSubmodules = fetchSubmoduleGraphs,
}: {
  repo: RepoView;
  /** Only the focused pane's card feeds the command palette (ADR 0022). */
  focused?: boolean;
  /** Ask for the next page of graph rows (ADR 0023). */
  onLoadMore?: () => void;
  /** Injectable for Storybook; defaults to the real API. */
  loadDetail?: (repoId: string, commitId: string) => Promise<CommitDetail>;
  loadDiff?: (
    repoId: string,
    commitId: string,
    path: string,
  ) => Promise<FileDiff>;
  loadCommitDiff?: (repoId: string, commitId: string) => Promise<FileDiff[]>;
  loadPrs?: (repoId: string) => Promise<PrLookupView>;
  loadSubmodules?: (repoId: string) => Promise<SubmoduleGraph[]>;
}) {
  const t = useT();
  // Fold each stash to a single node unless the internals toggle reveals its
  // dashed helper structure; everything the graph renders reads off `view`.
  const showStashInternals = useStashInternals();
  const showAvatars = useAvatars();
  const view = useMemo(
    () => stashView(repo, showStashInternals),
    [repo, showStashInternals],
  );
  const rowOf = useMemo(() => rowIndex(view.commits), [view.commits]);
  const refMap = useMemo(() => refsByCommit(repo), [repo.refs]);

  // PRs by head branch name (open) plus merged ones for squash links; loads
  // lazily and silently stays empty when the server has no gh (or the repo
  // no GitHub remote).
  const [prByBranch, setPrByBranch] = useState<Map<string, PullRequestView>>(
    new Map(),
  );
  const [mergedPrs, setMergedPrs] = useState<MergedPullRequestView[]>([]);
  useEffect(() => {
    let stale = false;
    loadPrs(repo.id)
      .then((lookup) => {
        if (stale) return;
        setPrByBranch(new Map(lookup.prs.map((pr) => [pr.branch, pr])));
        setMergedPrs(lookup.merged);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [repo.id, loadPrs]);

  // Submodule graphs render as their own regions left of the main graph,
  // with dashed pointer-correlation links across (item 9). Loaded lazily;
  // a repository without submodules answers an empty list.
  const showSubmodules = useSubmoduleLinks();
  const [subGraphs, setSubGraphs] = useState<SubmoduleGraph[]>([]);
  useEffect(() => {
    if (!showSubmodules) {
      setSubGraphs([]);
      return;
    }
    let stale = false;
    loadSubmodules(repo.id)
      .then((graphs) => {
        if (!stale) setSubGraphs(graphs);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [repo.id, showSubmodules, loadSubmodules]);

  const [refMenu, setRefMenu] = useState<RefMenuTarget | null>(null);
  // Right-clicking a commit row offers actions on that commit.
  const [commitMenu, setCommitMenu] = useState<{
    x: number;
    y: number;
    commit: string;
  } | null>(null);
  // Result of the last branch operation that failed; cleared on the next one.
  const [opError, setOpError] = useState<string | null>(null);
  const runBranchOp = useCallback(
    (
      op: (repoId: string, reference: string) => Promise<BranchOpResult>,
      reference: string,
    ) => {
      setOpError(null);
      op(repo.id, reference)
        .then((result) => {
          if (!result.ok) setOpError(result.message);
        })
        .catch((e) => setOpError(String(e)));
    },
    [repo.id],
  );

  // The visible repo's local branches double as palette commands; they
  // unregister when the card unmounts, so the palette only ever offers
  // operations on what is on screen.
  const { lang } = useContext(SettingsContext);
  const branchCommands = useMemo<PaletteCommand[]>(
    () =>
      repo.refs
        .filter(
          (ref) =>
            ref.kind === "branch" &&
            !ref.remote &&
            ref.name !== repo.head_branch,
        )
        .map((ref) => ({
          id: `checkout:${repo.id}:${ref.name}`,
          title: format(MESSAGES[lang].cmdCheckoutBranch, { name: ref.name }),
          run: () => runBranchOp(checkoutRef, ref.name),
        })),
    [repo.id, repo.refs, repo.head_branch, lang, runBranchOp],
  );
  useCommands(focused ? branchCommands : NO_COMMANDS);

  // ADR 0023 paging: ask for the next rows when the scroll approaches the
  // end of a prefix view — or when the prefix cannot even fill the pane.
  const scrollRef = useRef<HTMLDivElement>(null);
  const requestedAt = useRef(0);
  const maybeLoadMore = () => {
    const el = scrollRef.current;
    if (!el || !onLoadMore) return;
    if (repo.commits.length >= repo.total) return;
    if (requestedAt.current === repo.commits.length) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
      requestedAt.current = repo.commits.length;
      onLoadMore();
    }
  };
  useEffect(maybeLoadMore);

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

  const showSquashLinks = useSquashLinks();
  const links = showSquashLinks ? squashLinks(view, mergedPrs) : [];
  // Submodule regions sit left of the main graph; everything main-graph
  // shaped below draws inside a group shifted by mainOffset.
  const { regions, mainOffset } = submoduleRegions(subGraphs);
  const subLinks = submoduleCrossLinks(view, mainOffset, regions);
  // Link corridors beyond the real lanes widen the drawing.
  const width = mainOffset + graphWidth(laneSpan(view.lane_count, links));
  const height = graphHeight(
    Math.max(
      view.commits.length,
      ...regions.map((r) => r.graph.view.commits.length),
    ),
  );
  const selectedCommit = selected
    ? repo.commits.find((c) => c.id === selected)
    : undefined;

  return (
    <section className="repo">
      <header className="repo-header">
        <h2>{repo.name}</h2>
        <span className="repo-path">{repo.path}</span>
        <span className="repo-count">
          {t("commitsCount", { n: repo.total })}
        </span>
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
          onDeleteTag={(name) => runBranchOp(deleteTag, name)}
          onClose={() => setRefMenu(null)}
        />
      )}

      {commitMenu && (
        <CommitMenu
          x={commitMenu.x}
          y={commitMenu.y}
          commit={commitMenu.commit}
          onCreateTag={(name) =>
            runBranchOp(
              (repoId, value) => createTag(repoId, value, commitMenu.commit),
              name,
            )
          }
          onCreateBranch={(name) =>
            runBranchOp(
              (repoId, value) => createBranch(repoId, value, commitMenu.commit),
              name,
            )
          }
          onClose={() => setCommitMenu(null)}
        />
      )}

      <div className="repo-body">
      {selected && diffTarget ? (
        <FileDiffPane
          files={diffFiles}
          error={diffError}
          commitId={selected}
          parentId={selectedCommit?.parents[0]}
          githubUrl={repo.github_url}
          onClose={() => setDiffTarget(null)}
        />
      ) : (
      <div
        className="graph-and-list"
        data-testid="graph-scroll"
        ref={scrollRef}
        onScroll={maybeLoadMore}
      >
        <svg
          className="graph"
          data-testid="graph"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {regions.map((region) => {
            // Each submodule graph draws in its own region with local lane
            // coordinates; a divider marks where the next region begins.
            const subRowOf = rowIndex(region.graph.view.commits);
            return (
              <g
                key={region.graph.path}
                data-testid="submodule-region"
                transform={`translate(${region.offset},0)`}
              >
                {region.graph.view.edges.map((edge, i) => (
                  <path
                    key={`se${i}`}
                    d={edgePath(edge, subRowOf)}
                    fill="none"
                    stroke={laneColor(edge.color)}
                    strokeWidth={1.5}
                    opacity={0.7}
                  />
                ))}
                {region.graph.view.commits.map((commit) => (
                  <circle
                    key={commit.id}
                    className="node node-submodule"
                    cx={nodeX(commit.lane)}
                    cy={nodeY(commit.row)}
                    r={NODE_RADIUS - 1.5}
                    fill={laneColor(commit.color)}
                    opacity={0.8}
                  >
                    <title>{`${region.graph.name}: ${commit.summary}`}</title>
                  </circle>
                ))}
                <line
                  className="region-divider"
                  x1={region.width + 5}
                  x2={region.width + 5}
                  y1={0}
                  y2={height}
                  stroke="var(--border)"
                />
              </g>
            );
          })}
          {subLinks.map((link, i) => (
            // A superproject commit that moved this submodule's pointer,
            // linked across the regions to the submodule commit it named.
            <DraggableDashed
              key={`x${i}`}
              testId="submodule-edge"
              d={crossPath(link)}
              x1={link.x1}
              y1={link.y1}
              x2={link.x2}
              y2={link.y2}
              stroke={laneColor(link.color)}
              strokeWidth={1.5}
            />
          ))}
          <g transform={`translate(${mainOffset},0)`}>
          {view.edges.map((edge, i) => {
            // A stash's helper links are auxiliary structure: dashed (and
            // grabbable), like the squash-merge links below, rather than
            // first-class ancestry.
            const childRow = rowOf.get(edge.from);
            const parentRow = rowOf.get(edge.to);
            if (edge.dashed && childRow !== undefined && parentRow !== undefined) {
              return (
                <DraggableDashed
                  key={`e${i}`}
                  testId="stash-edge"
                  d={edgePath(edge, rowOf)}
                  x1={nodeX(edge.from_lane)}
                  y1={nodeY(childRow)}
                  x2={nodeX(edge.to_lane)}
                  y2={nodeY(parentRow)}
                  stroke={laneColor(edge.color)}
                  strokeWidth={2}
                />
              );
            }
            return (
              <path
                key={`e${i}`}
                d={edgePath(edge, rowOf)}
                fill="none"
                stroke={laneColor(edge.color)}
                strokeWidth={2}
              />
            );
          })}
          {links.map((link, i) => (
            // A squash-merged PR's branch has no ancestry line to the commit
            // it landed as; the dashed link comes from GitHub's PR data and
            // runs through its own virtual lane so it crosses nothing.
            <DraggableDashed
              key={`q${i}`}
              testId="squash-edge"
              d={linkPath(link)}
              x1={nodeX(link.fromLane)}
              y1={nodeY(link.fromRow)}
              x2={nodeX(link.toLane)}
              y2={nodeY(link.toRow)}
              stroke={laneColor(link.color)}
              strokeWidth={2}
            />
          ))}
          {view.commits.map((commit) =>
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
          </g>
        </svg>

        <ul className="commits">
          {view.commits.map((commit) => {
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
                onContextMenu={(e) => {
                  e.preventDefault();
                  setCommitMenu({
                    x: e.clientX,
                    y: e.clientY,
                    commit: commit.id,
                  });
                }}
              >
                {isHead && <span className="badge badge-head">HEAD</span>}
                {refs.map((ref) => {
                  const isBranch = ref.kind === "branch";
                  const pr = isBranch ? prByBranch.get(ref.name) : undefined;
                  const qualified = ref.remote
                    ? `${ref.remote}/${ref.name}`
                    : ref.name;
                  return (
                    <span
                      key={`${ref.kind}:${qualified}`}
                      className={`badge badge-ref badge-kind-${ref.kind}${
                        ref.remote ? " badge-remote" : ""
                      }`}
                      onContextMenu={(e) => {
                        // Branches get checkout/merge, tags get delete; the
                        // stash and other refs have no operations.
                        if (ref.kind !== "branch" && ref.kind !== "tag") return;
                        e.preventDefault();
                        e.stopPropagation();
                        setRefMenu({
                          x: e.clientX,
                          y: e.clientY,
                          // A tag's remote marker only says it exists on
                          // origin; operations still address the plain name.
                          reference: ref.kind === "tag" ? ref.name : qualified,
                          kind: ref.kind,
                        });
                      }}
                    >
                      {ref.remote && (
                        <span className="badge-remote-name" data-testid="badge-remote">
                          {ref.remote}
                        </span>
                      )}
                      <span className="badge-ref-name">
                        {ref.kind === "branch" && <BranchBadgeIcon />}
                        {ref.kind === "tag" && <TagBadgeIcon />}
                        {ref.kind === "stash" && <StashBadgeIcon />}
                        {ref.name}
                      </span>
                      {pr && (
                        <a
                          className="badge-pr"
                          data-testid="badge-pr"
                          href={pr.url}
                          target="_blank"
                          rel="noreferrer"
                          title={t("openPr", { number: pr.number })}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <PrLinkIcon />
                          <span className="badge-pr-number">
                            #{pr.number}
                          </span>
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
                  {showAvatars && commit.avatar && (
                    <img
                      className="commit-avatar"
                      data-testid="commit-avatar"
                      src={commit.avatar}
                      alt=""
                      loading="lazy"
                      width={16}
                      height={16}
                      onError={(e) => {
                        // Offline or a stale URL: drop the broken image quietly.
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  )}
                  {commit.author} ·{" "}
                  <span
                    className="commit-time"
                    data-testid="commit-time"
                    title={new Date(commit.time * 1000).toLocaleString()}
                  >
                    {rowTime(new Date(commit.time * 1000))}
                  </span>{" "}
                  · <CommitHash id={commit.id} />
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
          onOpenFile={(path) => {
            revealPath(repo.id, path).catch(() => {});
          }}
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
