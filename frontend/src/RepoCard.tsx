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
import { ContextMenu } from "./ContextMenu";
import {
  checkoutRef,
  checkoutDetached,
  createBranch,
  createTag,
  deleteTag,
  fetchCommitDetail,
  fetchCommitDiff,
  fetchRangeDiff,
  fetchFileDiff,
  fetchPrs,
  fetchSubmoduleGraphs,
  mergeRef,
  revealPath,
  type BranchOpResult,
  type CommitDetail,
  type CommitView,
  type FileDiff,
  type GraphEdge,
  type MergedPullRequestView,
  type PrLookupView,
  type PullRequestView,
  type RefView,
  type RepoView,
  type SubmoduleGraph,
  UNCOMMITTED_ID,
} from "./api";
import { DraggableDashed } from "./DraggableDashed";
import {
  BranchBadgeIcon,
  CalendarIcon,
  CumulativeIcon,
  PrLinkIcon,
  StashBadgeIcon,
  TagBadgeIcon,
  WorktreeIcon,
} from "./Icons";
import { Calendar } from "./Calendar";
import { CumulativeChart } from "./CumulativeChart";
import { LabeledButton } from "./LabeledButton";
import { Thickness } from "./Thickness";
import {
  rowsInView,
  START_TILT,
  thickness,
  THICKNESS_REACH,
  tiltBy,
} from "./thicknessModel";
import { createThicknessView } from "./thicknessView";
import { RefMenu, type RefMenuTarget } from "./RefMenu";
import { countKey, format, MESSAGES } from "./i18n";
import { useCommands, type PaletteCommand } from "./palette";
import {
  SettingsContext,
  storeCollapsedSubmodules,
  storedCollapsedSubmodules,
  useAvatars,
  useSquashLinks,
  useLineCounts,
  useThickness,
  useVimKeys,
  useStashInternals,
  useSubmoduleLinks,
  useT,
  useTime,
} from "./settings";
import { absoluteTime } from "./time";
import { CommitDetailPanel } from "./CommitDetailPanel";
import { FileDiffPane } from "./FileDiffPane";
import { CompareDetailPanel } from "./CompareDetailPanel";
import { keyboardTaken } from "./keyboard";
import {
  childrenOf,
  compareRange,
  edgeRow,
  keyMove,
  laneStep,
  parentsOf,
  rowStep,
} from "./navigation";
import {
  edgePath,
  graphHeight,
  graphWidth,
  laneColor,
  nodeX,
  nodeY,
  reachableFrom,
  firstParentChain,
  edgeWithin,
  rowIndex,
  ROW_HEIGHT,
  NODE_RADIUS,
  STASH_DOT_RADIUS,
  laneSpan,
  linkPath,
  loadedCommitCount,
  shortId,
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
/** A clickable part of the graph drawing that collapses or expands a
 * submodule region; a button to the keyboard and assistive tech too. */
function RegionToggle({
  testId,
  className,
  expanded,
  label,
  onToggle,
  children,
}: {
  testId: string;
  className: string;
  /** Whether the region it toggles is expanded. */
  expanded: boolean;
  label: string;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <g
      className={`region-toggle ${className}`}
      data-testid={testId}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-expanded={expanded}
      // A mouse press must not leave a focus ring on the strip that
      // replaces the button; the keyboard keeps focus across the swap.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        onToggle();
      }}
    >
      <title>{label}</title>
      {children}
    </g>
  );
}

/** A commit's page on the origin of the repository `view` shows, when that
 * origin is on a known host. */
function webUrlOf(view: RepoView, commit: string): string | undefined {
  return view.commit_url_base && `${view.commit_url_base}${commit}`;
}

export type DiffTarget =
  | { kind: "file"; path: string }
  | { kind: "all" }
  /** Two commits compared from the selection's menu (ADR 0035). */
  | { kind: "range"; base: string; target: string };

/** Badge for a signed commit, following GitHub's wording: "Verified" only
 * when gpg actually validated the signature, "Unverified" when it judged it
 * invalid, and a plain "Signed" when it could not be checked. While the
 * check still runs (ADR 0037), a pulsing skeleton of the badge. */
export function signatureBadge(
  verified?: boolean,
  verifying = false,
): {
  label: string;
  className: string;
  title: string;
} {
  if (verifying) {
    return {
      label: "Signed",
      className: "badge badge-signed badge-checking",
      title: "Checking the signature…",
    };
  }
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
  onOpenSubmodule,
  loadDetail = fetchCommitDetail,
  loadDiff = fetchFileDiff,
  loadCommitDiff = fetchCommitDiff,
  loadRangeDiff = fetchRangeDiff,
  loadPrs = fetchPrs,
  loadSubmodules = fetchSubmoduleGraphs,
}: {
  repo: RepoView;
  /** Only the focused pane's card feeds the command palette (ADR 0022). */
  focused?: boolean;
  /** Ask for the next page of graph rows (ADR 0023). */
  onLoadMore?: () => void;
  /** Attach a submodule and show it here or in the right pane. */
  onOpenSubmodule?: (path: string, side: "here" | "right") => Promise<void>;
  /** Injectable for Storybook; defaults to the real API. */
  loadDetail?: (repoId: string, commitId: string) => Promise<CommitDetail>;
  loadDiff?: (
    repoId: string,
    commitId: string,
    path: string,
  ) => Promise<FileDiff>;
  loadCommitDiff?: (repoId: string, commitId: string) => Promise<FileDiff[]>;
  loadRangeDiff?: (
    repoId: string,
    base: string,
    target: string,
  ) => Promise<FileDiff[]>;
  loadPrs?: (repoId: string) => Promise<PrLookupView>;
  loadSubmodules?: (repoId: string) => Promise<SubmoduleGraph[]>;
}) {
  const t = useT();
  const time = useTime();
  // Fold each stash to a single node unless the internals toggle reveals its
  // dashed helper structure; everything the graph renders reads off `view`.
  const showStashInternals = useStashInternals();
  const showAvatars = useAvatars();
  const view = useMemo(
    () => stashView(repo, showStashInternals),
    [repo, showStashInternals],
  );
  const rowOf = useMemo(() => rowIndex(view.commits), [view.commits]);
  // While a branch badge is hovered, the commits its tip reaches (#17);
  // while a node is hovered, its first-parent chain (ADR 0035). Every other
  // row, node and edge fades.
  const [focus, setFocus] = useState<{
    tip: string;
    lineage: boolean;
  } | null>(null);
  const kept = useMemo(
    () =>
      focus === null
        ? null
        : focus.lineage
          ? firstParentChain(view.commits, focus.tip)
          : reachableFrom(view.commits, focus.tip),
    [view.commits, focus],
  );
  const fadedNode = (id: string) => (kept && !kept.has(id) ? " faded" : "");
  const fadedEdge = (edge: GraphEdge) =>
    kept && !edgeWithin(edge, kept) ? "faded" : undefined;
  const refMap = useMemo(() => refsByCommit(repo), [repo.refs]);
  // Which other worktree has each local branch checked out: its badge gets
  // a marker, and its menu cannot check it out here.
  const worktreeOf = useMemo(
    () =>
      new Map(
        (repo.worktrees ?? [])
          .filter((w) => w.branch !== undefined)
          .map((w) => [w.branch as string, w.path]),
      ),
    [repo.worktrees],
  );

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
  // Submodule regions collapsed to a strip, by path, kept per repository.
  const [collapsedSubs, setCollapsedSubs] = useState<Set<string>>(() =>
    storedCollapsedSubmodules(repo.id),
  );
  const toggleSubmodule = (path: string) => {
    const next = new Set(collapsedSubs);
    if (!next.delete(path)) next.add(path);
    setCollapsedSubs(next);
    storeCollapsedSubmodules(repo.id, next);
  };
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
  // Right-clicking a commit row or node offers actions on that commit.
  // `webUrl` is the commit's page on its own repository's origin; `refs`
  // offers tag and branch creation, which only this repository takes (a
  // submodule's commit lives in another repository).
  const [commitMenu, setCommitMenu] = useState<{
    x: number;
    y: number;
    commit: string;
    webUrl?: string;
    refs: boolean;
    /** Opened from the chart's list of a period's commits (ADR 0048). */
    fromChart?: boolean;
  } | null>(null);
  // Result of the last branch operation that failed; cleared on the next one.
  const [opError, setOpError] = useState<string | null>(null);
  // The menu of a submodule region, opened from its background or strip.
  const [regionMenu, setRegionMenu] = useState<{
    x: number;
    y: number;
    path: string;
  } | null>(null);
  const openRegionMenu = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    setRegionMenu({ x: e.clientX, y: e.clientY, path });
  };
  const openSubmodule = (path: string, side: "here" | "right") => {
    setOpError(null);
    onOpenSubmodule?.(path, side).catch((err) => setOpError(String(err)));
  };
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
  const cardRef = useRef<HTMLElement>(null);
  const requestedAt = useRef(0);
  const hasMore =
    onLoadMore !== undefined && loadedCommitCount(repo) < repo.total;
  // Asks for the next page, once for each count of rows read so far.
  const loadNextPage = () => {
    const loaded = loadedCommitCount(repo);
    if (!onLoadMore || loaded >= repo.total) return;
    if (requestedAt.current === loaded) return;
    requestedAt.current = loaded;
    onLoadMore();
  };
  const maybeLoadMore = () => {
    const el = scrollRef.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
      loadNextPage();
    }
  };
  useEffect(maybeLoadMore);

  // How the graph's thickness is seen: its tilt (ADR 0045) and the rows
  // near the scroll it is drawn for (ADR 0044). Kept outside the card's
  // state, so a drag or a scroll redraws only the thickness.
  const [thicknessView] = useState(() =>
    createThicknessView(rowsInView(0, window.innerHeight)),
  );
  const trackThickRows = () => {
    const el = scrollRef.current;
    if (el) thicknessView.setRows(rowsInView(el.scrollTop, el.clientHeight));
  };
  useEffect(trackThickRows);
  // Where the drag on the graph's background that is tilting it began.
  const tiltDrag = useRef<{ x: number; y: number } | null>(null);
  const onGraphPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    // Pressed inside a text selection, the browser would drag the
    // selection instead and cancel this pointer.
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    tiltDrag.current = { x: e.clientX, y: e.clientY };
  };
  const onGraphPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = tiltDrag.current;
    if (drag === null) return;
    thicknessView.setTilt(
      tiltBy(START_TILT, e.clientX - drag.x, e.clientY - drag.y),
    );
  };
  const onGraphPointerUp = () => {
    tiltDrag.current = null;
    thicknessView.setTilt(START_TILT);
  };
  const [selected, setSelected] = useState<string | null>(null);
  // Clicking a row or its graph node toggles the detail panel for it.
  const toggleSelected = (id: string) => {
    setSelected((s) => (s === id ? null : id));
    setDiffTarget(null);
  };
  // A selection moved from the keyboard or the menu, whose row is brought
  // into view once it renders.
  const [revealed, setRevealed] = useState<string | null>(null);
  const select = (id: string | null) => {
    if (id === null) return;
    setSelected(id);
    setDiffTarget(null);
    setRevealed(id);
  };
  useEffect(() => {
    if (revealed === null) return;
    scrollRef.current
      ?.querySelector(".commits .commit.selected")
      ?.scrollIntoView({ block: "nearest" });
    setRevealed(null);
  }, [revealed]);
  // The graph node under the pointer, whose hash shows in a tooltip.
  const [hoverNode, setHoverNode] = useState<{
    x: number;
    y: number;
    label: string;
    /** The main graph's commit it names; absent for a submodule's node. */
    commit?: string;
  } | null>(null);
  // The uncommitted-changes row is not a commit: nothing can be tagged or
  // branched at it, so its menu stays closed and it names itself, not a hash.
  const openCommitMenu = (e: React.MouseEvent, commit: CommitView) => {
    e.preventDefault();
    if (commit.uncommitted !== undefined) return;
    setCommitMenu({
      x: e.clientX,
      y: e.clientY,
      commit: commit.id,
      webUrl: webUrlOf(repo, commit.id),
      refs: true,
    });
  };
  const openChartCommitMenu = (e: React.MouseEvent, commit: CommitView) => {
    openCommitMenu(e, commit);
    setCommitMenu((menu) => menu && { ...menu, fromChart: true });
  };
  const nodeLabel = (commit: CommitView) =>
    commit.uncommitted !== undefined
      ? t("uncommittedChanges")
      : shortId(commit.id);
  // Graph nodes carry the same interactions as their rows: click selects,
  // right-click opens the commit menu, and hovering names the commit.
  const nodeProps = (commit: CommitView) => ({
    "data-testid": "graph-node",
    onClick: () => toggleSelected(commit.id),
    onContextMenu: (e: React.MouseEvent) => openCommitMenu(e, commit),
    onMouseEnter: (e: React.MouseEvent) => {
      setHoverNode({
        x: e.clientX,
        y: e.clientY,
        label: nodeLabel(commit),
        commit: commit.id,
      });
      setFocus({ tip: commit.id, lineage: true });
    },
    onMouseLeave: () => {
      setHoverNode(null);
      setFocus(null);
    },
  });
  // A submodule's nodes name and offer their commit the same way, from the
  // submodule's own view; they have no row to select.
  const submoduleNodeProps = (graph: SubmoduleGraph, commit: CommitView) => ({
    "data-testid": "submodule-node",
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      setCommitMenu({
        x: e.clientX,
        y: e.clientY,
        commit: commit.id,
        webUrl: webUrlOf(graph.view, commit.id),
        refs: false,
      });
    },
    onMouseEnter: (e: React.MouseEvent) =>
      setHoverNode({
        x: e.clientX,
        y: e.clientY,
        label: `${shortId(commit.id)} ${graph.name}: ${commit.summary}`,
      }),
    onMouseLeave: () => setHoverNode(null),
  });
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [diffTarget, setDiffTarget] = useState<DiffTarget | null>(null);
  const [diffFiles, setDiffFiles] = useState<FileDiff[] | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  // The cumulative chart (ADR 0043) takes the place of the rows.
  const [chart, setChart] = useState(false);
  // The calendar (ADR 0050) sits under whatever the body shows.
  const [calendar, setCalendar] = useState(false);

  // The focused pane's graph takes the selection keys (ADR 0035) while the
  // graph is shown and nothing else has the keyboard: no text field, no
  // menu, no dialog or palette.
  const vimKeys = useVimKeys();
  useEffect(() => {
    if (!focused || diffTarget !== null || chart) return;
    let previous: string | null = null;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (keyboardTaken()) return;
      const move = keyMove(e.key, vimKeys, previous);
      previous = move === "top" ? null : e.key;
      if (move === null) return;
      if ((move === "diff" || move === "clear") && selected === null) return;
      e.preventDefault();
      const commits = view.commits;
      switch (move) {
        case "up":
          return select(rowStep(commits, selected, -1));
        case "down":
          return select(rowStep(commits, selected, 1));
        case "left":
          return select(laneStep(commits, selected, -1));
        case "right":
          return select(laneStep(commits, selected, 1));
        case "top":
        case "bottom":
          return select(edgeRow(commits, move));
        case "diff":
          return setDiffTarget({ kind: "all" });
        case "clear":
          return setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused, diffTarget, chart, vimKeys, selected, view.commits]);

  // A reload can drop the selected row (the tree became clean, or the
  // history was rewritten): nothing may keep showing a commit that is gone.
  useEffect(() => {
    if (selected && !repo.commits.some((c) => c.id === selected)) {
      setSelected(null);
      setDiffTarget(null);
    }
  }, [repo.commits, selected]);
  // A reload can unmount the hovered node or badge before the pointer
  // leaves it, and then no mouseleave fires: the tooltip and focus go with
  // the old view. A node the reload keeps keeps them, since batches of
  // verdicts and counts reload the view under a still pointer (ADR 0041).
  useEffect(() => {
    const kept = new Set(view.commits.map((c) => c.id));
    setHoverNode((hover) =>
      hover?.commit !== undefined && kept.has(hover.commit) ? hover : null,
    );
    setFocus((now) => (now?.lineage && kept.has(now.tip) ? now : null));
  }, [view.commits]);
  // Commits are immutable, the working tree is not: while the changes row
  // is selected, every reload re-reads its files and diffs.
  const uncommittedGeneration =
    selected === UNCOMMITTED_ID ? repo.commits : null;

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
  }, [selected, repo.id, loadDetail, uncommittedGeneration]);

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
        : diffTarget.kind === "range"
          ? loadRangeDiff(repo.id, diffTarget.base, diffTarget.target)
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
  }, [
    selected,
    diffTarget,
    repo.id,
    loadDiff,
    loadCommitDiff,
    loadRangeDiff,
    uncommittedGeneration,
  ]);

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
  const showThickness = useThickness();
  const lineCounts = useLineCounts();
  const links = showSquashLinks ? squashLinks(view, mergedPrs) : [];
  // Submodule regions sit left of the main graph; everything main-graph
  // shaped below draws inside a group shifted by mainOffset. A thickness
  // reaches past the lanes on both sides, so it moves them in by as much.
  const reach = showThickness ? THICKNESS_REACH : 0;
  const regionsAndMain = submoduleRegions(subGraphs, collapsedSubs);
  const { regions } = regionsAndMain;
  const mainOffset = regionsAndMain.mainOffset + reach;
  const subLinks = submoduleCrossLinks(view, mainOffset, regions);
  // Link corridors beyond the real lanes widen the drawing.
  const width =
    mainOffset + graphWidth(laneSpan(view.lane_count, links)) + reach;
  const height = graphHeight(
    Math.max(
      view.commits.length,
      ...regions
        .filter((r) => !r.collapsed)
        .map((r) => r.graph.view.commits.length),
    ),
  );
  const selectedCommit = selected
    ? repo.commits.find((c) => c.id === selected)
    : undefined;
  const commitOf = (id: string) => view.commits.find((c) => c.id === id);
  const compareBase =
    diffTarget?.kind === "range" ? commitOf(diffTarget.base) : undefined;
  const compareTarget =
    diffTarget?.kind === "range" ? commitOf(diffTarget.target) : undefined;

  return (
    <section className="repo" ref={cardRef}>
      <header className="repo-header">
        <h2>{repo.name}</h2>
        <span className="repo-path">{repo.path}</span>
        <span className="repo-count">
          {t("commitsCount", { n: repo.total })}
        </span>
        <LabeledButton
          icon={<CumulativeIcon />}
          label={t("cumulative")}
          testId="cumulative-toggle"
          className="cumulative-toggle"
          active={chart}
          onClick={() => setChart((on) => !on)}
        />
        <LabeledButton
          icon={<CalendarIcon />}
          label={t("calendar")}
          testId="calendar-toggle"
          className="cumulative-toggle"
          active={calendar}
          onClick={() => setCalendar((on) => !on)}
        />
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

      {regionMenu && (
        <ContextMenu
          x={regionMenu.x}
          y={regionMenu.y}
          items={[
            ...(onOpenSubmodule
              ? [
                  {
                    id: "region-open",
                    label: t("openSubmodule"),
                    run: () => openSubmodule(regionMenu.path, "here"),
                  },
                  {
                    id: "region-open-right",
                    label: t("openRightPane"),
                    run: () => openSubmodule(regionMenu.path, "right"),
                  },
                ]
              : []),
            {
              id: "region-copy-path",
              label: t("copyAbsolutePath"),
              run: () => navigator.clipboard?.writeText(regionMenu.path),
            },
          ]}
          onClose={() => setRegionMenu(null)}
        />
      )}

      {commitMenu && (
        <CommitMenu
          x={commitMenu.x}
          y={commitMenu.y}
          commit={commitMenu.commit}
          webUrl={commitMenu.webUrl}
          onCreateTag={
            commitMenu.refs
              ? (name) =>
                  runBranchOp(
                    (repoId, value) =>
                      createTag(repoId, value, commitMenu.commit),
                    name,
                  )
              : undefined
          }
          onCreateBranch={
            commitMenu.refs
              ? (name) =>
                  runBranchOp(
                    (repoId, value) =>
                      createBranch(repoId, value, commitMenu.commit),
                    name,
                  )
              : undefined
          }
          parents={
            commitMenu.refs
              ? parentsOf(view.commits, commitMenu.commit)
              : undefined
          }
          children={
            commitMenu.refs
              ? childrenOf(view.commits, commitMenu.commit)
              : undefined
          }
          onGoTo={select}
          onShowInRows={
            commitMenu.fromChart
              ? () => {
                  setChart(false);
                  select(commitMenu.commit);
                }
              : undefined
          }
          onCheckoutDetached={
            commitMenu.refs
              ? () =>
                  runBranchOp(
                    (repoId) => checkoutDetached(repoId, commitMenu.commit),
                    commitMenu.commit,
                  )
              : undefined
          }
          onCompare={
            commitMenu.refs &&
            selected !== null &&
            selected !== UNCOMMITTED_ID &&
            selected !== commitMenu.commit
              ? () =>
                  setDiffTarget({
                    kind: "range",
                    ...compareRange(view.commits, selected, commitMenu.commit),
                  })
              : undefined
          }
          onClose={() => setCommitMenu(null)}
        />
      )}

      <div className="repo-body">
      {chart ? (
        <CumulativeChart
          commits={view.commits}
          head={view.head}
          onCommitMenu={openChartCommitMenu}
          menuOpen={commitMenu !== null}
        />
      ) : selected && diffTarget ? (
        <FileDiffPane
          files={diffFiles}
          error={diffError}
          commitId={
            diffTarget.kind === "range"
              ? diffTarget.target
              : selectedCommit && selectedCommit.uncommitted === undefined
                ? selected
                : undefined
          }
          parentId={
            diffTarget.kind === "range"
              ? diffTarget.base
              : selectedCommit?.parents[0]
          }
          range={diffTarget.kind === "range" ? diffTarget : undefined}
          githubUrl={repo.github_url}
          onClose={() => setDiffTarget(null)}
        />
      ) : (
      <div
        className="graph-and-list"
        data-testid="graph-scroll"
        ref={scrollRef}
        onScroll={() => {
          maybeLoadMore();
          trackThickRows();
        }}
      >
        <svg
          className="graph"
          data-testid="graph"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          onPointerDown={showThickness ? onGraphPointerDown : undefined}
          onPointerMove={onGraphPointerMove}
          onPointerUp={onGraphPointerUp}
          onPointerCancel={onGraphPointerUp}
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
                onContextMenu={(e) => openRegionMenu(e, region.graph.path)}
              >
                {!region.collapsed && (
                  // The region's empty background, under its edges.
                  <rect
                    data-testid="submodule-region-hit"
                    className="region-hit"
                    width={region.width}
                    height={height}
                  />
                )}
                {region.collapsed ? (
                  <RegionToggle
                    testId="region-expand"
                    className="region-strip"
                    expanded={false}
                    label={t("expandSubmodule", { name: region.graph.name })}
                    onToggle={() => toggleSubmodule(region.graph.path)}
                  >
                    <rect width={region.width} height={height} rx={4} />
                    <text
                      dominantBaseline="central"
                      transform={`translate(${region.width / 2},8) rotate(90)`}
                    >
                      {region.graph.name}
                    </text>
                  </RegionToggle>
                ) : null}
                {!region.collapsed &&
                  region.graph.view.edges.map((edge, i) => (
                  <path
                    key={`se${i}`}
                    d={edgePath(edge, subRowOf)}
                    fill="none"
                    stroke={laneColor(edge.color)}
                    strokeWidth={1.5}
                    opacity={0.7}
                  />
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
          {regions
            .filter((region) => !region.collapsed)
            .map((region) => (
            // Submodule nodes and the collapse button sit above the dashed
            // links, whose wide hit stroke would otherwise cover them.
            <g
              key={region.graph.path}
              transform={`translate(${region.offset},0)`}
            >
              {region.graph.view.commits.map((commit) => (
                <circle
                  key={commit.id}
                  className="node node-submodule"
                  cx={nodeX(commit.lane)}
                  cy={nodeY(commit.row)}
                  r={NODE_RADIUS - 1.5}
                  fill={laneColor(commit.color)}
                  opacity={0.8}
                  {...submoduleNodeProps(region.graph, commit)}
                />
              ))}
              <RegionToggle
                testId="region-collapse"
                className="region-collapse"
                expanded
                label={t("collapseSubmodule", { name: region.graph.name })}
                onToggle={() => toggleSubmodule(region.graph.path)}
              >
                {/* Above the first row's nodes and the links they end in. */}
                <rect
                  x={region.width - 2}
                  y={0}
                  width={14}
                  height={10}
                  rx={3}
                />
                <text x={region.width + 5} y={8.5}>
                  ‹
                </text>
              </RegionToggle>
            </g>
          ))}
          <g transform={`translate(${mainOffset},0)`}>
          {showThickness && (
            <Thickness
              commits={view.commits}
              edges={view.edges}
              rowOf={rowOf}
              fadedNode={fadedNode}
              fadedEdge={fadedEdge}
              view={thicknessView}
            />
          )}
          {view.edges.map((edge, i) => {
            // A stash's helper links are auxiliary structure: dashed (and
            // grabbable), like the squash-merge links below, rather than
            // first-class ancestry.
            const childRow = rowOf.get(edge.from);
            const parentRow = rowOf.get(edge.to);
            if (edge.from === UNCOMMITTED_ID) {
              // The working tree is not history yet: its link down to HEAD
              // is dashed, like every other auxiliary line.
              return (
                <path
                  key={`e${i}`}
                  className={`edge-uncommitted${fadedNode(UNCOMMITTED_ID)}`}
                  d={edgePath(edge, rowOf)}
                  fill="none"
                  stroke={laneColor(edge.color)}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                />
              );
            }
            if (edge.dashed && childRow !== undefined && parentRow !== undefined) {
              return (
                <g key={`e${i}`} className={fadedEdge(edge)}>
                  <DraggableDashed
                    testId="stash-edge"
                    d={edgePath(edge, rowOf)}
                    x1={nodeX(edge.from_lane)}
                    y1={nodeY(childRow)}
                    x2={nodeX(edge.to_lane)}
                    y2={nodeY(parentRow)}
                    stroke={laneColor(edge.color)}
                    strokeWidth={2}
                  />
                </g>
              );
            }
            return (
              <path
                key={`e${i}`}
                className={fadedEdge(edge)}
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
            <g key={`q${i}`} className={kept ? "faded" : undefined}>
              <DraggableDashed
                testId="squash-edge"
                d={linkPath(link)}
                x1={nodeX(link.fromLane)}
                y1={nodeY(link.fromRow)}
                x2={nodeX(link.toLane)}
                y2={nodeY(link.toRow)}
                stroke={laneColor(link.color)}
                strokeWidth={2}
              />
            </g>
          ))}
          {view.commits.map((commit) =>
            commit.uncommitted !== undefined ? (
              // The working tree: a dashed hollow ring in HEAD's color, a
              // commit-to-be rather than a commit.
              <circle
                key={commit.id}
                className={`node node-uncommitted${fadedNode(commit.id)}`}
                cx={nodeX(commit.lane)}
                cy={nodeY(commit.row)}
                r={NODE_RADIUS}
                strokeDasharray="2 2"
                style={{ stroke: laneColor(commit.color), fill: "var(--bg-elev)" }}
                {...nodeProps(commit)}
              />
            ) : commit.stash ? (
              // A stash: a ring around a dot, like vscode-git-graph, so it
              // reads apart from the commits of the line it sits on.
              <g key={commit.id}>
                <circle
                  className={`node node-stash${fadedNode(commit.id)}`}
                  cx={nodeX(commit.lane)}
                  cy={nodeY(commit.row)}
                  r={NODE_RADIUS}
                  style={{ stroke: laneColor(commit.color), fill: "var(--bg-elev)" }}
                  {...nodeProps(commit)}
                />
                <circle
                  className={`node-stash-dot${fadedNode(commit.id)}`}
                  cx={nodeX(commit.lane)}
                  cy={nodeY(commit.row)}
                  r={STASH_DOT_RADIUS}
                  style={{ fill: laneColor(commit.color) }}
                />
              </g>
            ) : commit.id === repo.head ? (
              // HEAD: a ring in the branch color with the center punched out
              // to the card background, like vscode-git-graph. Both colors go
              // through `style` — inline styles resolve var() and win over the
              // .node CSS, while a `fill` attribute would not resolve it.
              <circle
                key={commit.id}
                className={`node node-head${fadedNode(commit.id)}`}
                cx={nodeX(commit.lane)}
                cy={nodeY(commit.row)}
                r={NODE_RADIUS}
                style={{ stroke: laneColor(commit.color), fill: "var(--bg-elev)" }}
                {...nodeProps(commit)}
              />
            ) : (
              <circle
                key={commit.id}
                className={`node${fadedNode(commit.id)}`}
                cx={nodeX(commit.lane)}
                cy={nodeY(commit.row)}
                r={NODE_RADIUS}
                fill={laneColor(commit.color)}
                {...nodeProps(commit)}
              />
            ),
          )}
          </g>
        </svg>
        {hoverNode && (
          <span
            className="node-tip"
            data-testid="node-tip"
            style={{ left: hoverNode.x + 12, top: hoverNode.y + 12 }}
          >
            {hoverNode.label}
          </span>
        )}

        <ul className="commits">
          {view.commits.map((commit) => {
            const refs = refMap.get(commit.id) ?? [];
            const isHead = repo.head === commit.id;
            const uncommitted = commit.uncommitted;
            return (
              <li
                key={commit.id}
                className={`commit${commit.id === selected ? " selected" : ""}${
                  uncommitted !== undefined ? " commit-uncommitted" : ""
                }${kept && !kept.has(commit.id) ? " commit-faded" : ""}`}
                data-testid="commit-row"
                style={{ height: ROW_HEIGHT }}
                onClick={() => toggleSelected(commit.id)}
                onContextMenu={(e) => openCommitMenu(e, commit)}
              >
                {lineCounts === "bars" &&
                  // At the row's start, so every row's axis lines up; a row
                  // not counted yet keeps the room (ADR 0046).
                  (commit.stat ? (
                    <span
                      className="commit-stat stat-bars"
                      data-testid="commit-stat"
                      title={t("lineStat", {
                        added: commit.stat.added,
                        deleted: commit.stat.deleted,
                      })}
                    >
                      <span className="stat-side stat-side-deleted">
                        <span
                          className="stat-bar-deleted"
                          style={{ width: thickness(commit.stat.deleted) }}
                        />
                      </span>
                      <span className="stat-axis" />
                      <span className="stat-side">
                        <span
                          className="stat-bar-added"
                          style={{ width: thickness(commit.stat.added) }}
                        />
                      </span>
                    </span>
                  ) : (
                    <span className="stat-bars stat-bars-empty" />
                  ))}
                {isHead && <span className="badge badge-head">HEAD</span>}
                {refs.map((ref) => {
                  const isBranch = ref.kind === "branch";
                  const pr = isBranch ? prByBranch.get(ref.name) : undefined;
                  const qualified = ref.remote
                    ? `${ref.remote}/${ref.name}`
                    : ref.name;
                  const worktreePath =
                    isBranch && !ref.remote
                      ? worktreeOf.get(ref.name)
                      : undefined;
                  return (
                    <span
                      key={`${ref.kind}:${qualified}`}
                      className={`badge badge-ref badge-kind-${ref.kind}${
                        ref.remote ? " badge-remote" : ""
                      }`}
                      onMouseEnter={
                        isBranch
                          ? () => setFocus({ tip: commit.id, lineage: false })
                          : undefined
                      }
                      onMouseLeave={
                        isBranch ? () => setFocus(null) : undefined
                      }
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
                          worktreePath,
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
                      {worktreePath !== undefined && (
                        <span
                          className="badge-worktree"
                          data-testid="badge-worktree"
                          title={t("checkedOutIn", { path: worktreePath })}
                        >
                          <WorktreeIcon />
                        </span>
                      )}
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
                {uncommitted !== undefined ? (
                  // The working tree has no author, time or hash: the row
                  // names itself and counts what it holds.
                  <>
                    <span className="commit-summary">
                      {t("uncommittedChanges")}
                    </span>
                    <span className="commit-meta">
                      {t(countKey("filesCount", uncommitted), {
                        n: uncommitted,
                      })}
                    </span>
                  </>
                ) : (
                <>
                <span
                  className={`commit-summary${
                    commit.parents.length > 1 ? " commit-summary-merge" : ""
                  }`}
                >
                  {commit.summary}
                </span>
                <span className="commit-meta">
                  {commit.stat && lineCounts === "numbers" && (
                    <span
                      className="commit-stat"
                      data-testid="commit-stat"
                      title={t("lineStat", {
                        added: commit.stat.added,
                        deleted: commit.stat.deleted,
                      })}
                    >
                      <span className="stat-added">+{commit.stat.added}</span>{" "}
                      <span className="stat-deleted">−{commit.stat.deleted}</span>
                    </span>
                  )}
                  {commit.signature &&
                    (() => {
                      const badge = signatureBadge(commit.verified, commit.verifying);
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
                    title={absoluteTime(new Date(commit.time * 1000))}
                  >
                    {time(commit.time)}
                  </span>{" "}
                  · <CommitHash id={commit.id} />
                </span>
                </>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      )}

      {compareBase && compareTarget ? (
        <CompareDetailPanel
          base={compareBase}
          target={compareTarget}
          files={diffFiles}
          error={diffError}
          onSelectFile={(path) =>
            cardRef.current
              ?.querySelector(`[data-diff-path="${CSS.escape(path)}"]`)
              ?.scrollIntoView({ block: "start" })
          }
          onClose={() => setDiffTarget(null)}
        />
      ) : selected && (
        <CommitDetailPanel
          detail={detail}
          error={detailError}
          repoPath={repo.path}
          verified={selectedCommit?.verified}
          verifying={selectedCommit?.verifying}
          signatureKey={selectedCommit?.signature_key}
          onSelectFile={(path) => setDiffTarget({ kind: "file", path })}
          onOpenFile={(path) => {
            revealPath(repo.id, path).catch(() => {});
          }}
          allDiffsShown={diffTarget?.kind === "all"}
          onToggleAllDiffs={() =>
            setDiffTarget((target) =>
              target?.kind === "all" ? null : { kind: "all" },
            )
          }
          onClose={() => {
            setSelected(null);
            setDiffTarget(null);
          }}
        />
      )}
      </div>
      {calendar && (
        <Calendar
          commits={view.commits}
          selected={selected}
          hasOlder={hasMore}
          onOlder={loadNextPage}
          onPick={(id) => {
            setChart(false);
            select(id);
          }}
        />
      )}
    </section>
  );
}
