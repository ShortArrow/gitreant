import { Fragment, useState } from "react";
import { pickFolder, type RepoListEntry, type RepoStatus } from "./api";
import { ContextMenu } from "./ContextMenu";
import {
  AddIcon,
  BrowseIcon,
  CollapseIcon,
  DirtyIcon,
  DisclosureIcon,
  ExpandIcon,
  LocalBranchIcon,
  UnpushedIcon,
  WorktreeIcon,
} from "./Icons";
import { LabeledButton } from "./LabeledButton";
import { ResizeHandle, useStoredWidth } from "./Resizer";
import { useT } from "./settings";
import type { MsgKey } from "./i18n";

/** How the repository list is ordered: as added, or alphabetically by name
 * or path. */
export type RepoSort = "added" | "name" | "path";

const SORT_KEY = "gitreant-repo-sort";

export function storedRepoSort(): RepoSort {
  try {
    const value = localStorage.getItem(SORT_KEY);
    return value === "name" || value === "path" ? value : "added";
  } catch {
    return "added";
  }
}

export function storeRepoSort(sort: RepoSort) {
  try {
    localStorage.setItem(SORT_KEY, sort);
  } catch {
    // localStorage may be unavailable; the state change alone is enough.
  }
}

/** Filter by a case-insensitive substring of the name or path, then order.
 * "added" keeps the server's order; the alphabetical sorts are locale-aware
 * and case-insensitive. Pure, so the ordering is unit-testable. */
export function arrangeRepos(
  repos: RepoListEntry[],
  filter: string,
  sort: RepoSort,
): RepoListEntry[] {
  const needle = filter.trim().toLowerCase();
  const filtered = needle
    ? repos.filter(
        (r) =>
          r.name.toLowerCase().includes(needle) ||
          r.path.toLowerCase().includes(needle),
      )
    : repos;
  if (sort === "added") return filtered;
  return [...filtered].sort((a, b) =>
    a[sort].localeCompare(b[sort], undefined, { sensitivity: "base" }),
  );
}

/** Keyboard activation for a row that acts as a button: Enter and Space run
 * the action, as a real button would, and Space is stopped from scrolling. */
export function activateOnKey(run: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    run();
  };
}

/** The rows the drawer lists at top level. An attached submodule stays under
 * its superproject's accordion, and a linked worktree under its main
 * worktree's — but only while that main worktree is listed, so a linked
 * worktree added on its own keeps a row (with the main one nested). Pure,
 * so the nesting rules are unit-testable. */
export function topLevelRepos(repos: RepoListEntry[]): RepoListEntry[] {
  const nested = new Set(
    repos.flatMap((r) => (r.submodules ?? []).map((s) => s.path)),
  );
  const listed = new Set(repos.map((r) => r.path));
  return repos.filter(
    (r) =>
      !nested.has(r.path) &&
      !(r.worktrees ?? []).some((w) => w.main && listed.has(w.path)),
  );
}

/** The analyzing note next to a repository name: the running commit
 * counter of its in-flight read (ADR 0023 — no percentage, a stuck or
 * unbounded walk must not fake completion). */
export function analyzeNote(
  commits: number,
  t: (key: MsgKey, params?: Record<string, string | number>) => string,
): string {
  const label = t("analyzing");
  return commits > 0 ? `${label} (${t("commitsCount", { n: commits })})` : label;
}

/** Small drawer indicators for a repository's uncommitted / unpushed state;
 * each count is hidden when zero, so a clean repository shows nothing. */
function RepoStats({ status }: { status?: RepoStatus }) {
  const t = useT();
  if (!status) return null;
  const { dirty, unpushed, local_branches: local } = status;
  if (dirty === 0 && unpushed === 0 && local === 0) return null;
  return (
    <span className="repo-item-status" data-testid="repo-status">
      {dirty > 0 && (
        <span
          className="repo-stat repo-stat-dirty"
          data-testid="stat-dirty"
          title={t("dirtyCount", { n: dirty })}
        >
          <DirtyIcon /> {dirty}
        </span>
      )}
      {unpushed > 0 && (
        <span
          className="repo-stat repo-stat-unpushed"
          data-testid="stat-unpushed"
          title={t("unpushedCount", { n: unpushed })}
        >
          <UnpushedIcon /> {unpushed}
        </span>
      )}
      {local > 0 && (
        <span
          className="repo-stat repo-stat-branch"
          data-testid="stat-branch"
          title={t("localBranchCount", { n: local })}
        >
          <LocalBranchIcon /> {local}
        </span>
      )}
    </span>
  );
}

interface DrawerProps {
  repos: RepoListEntry[];
  activeId: string | null;
  collapsed: boolean;
  /** A path whose analysis is still running server-side, if any. */
  pending?: string | null;
  /** Running commit counters of in-flight reads, by repository id. */
  analyzing?: Map<string, number> | null;
  /** Per-repo uncommitted/unpushed summary, by repository id. */
  statuses?: Map<string, RepoStatus> | null;
  /** False until the first repository list arrived. */
  loaded?: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  /** Open the repository in the right pane (ADR 0022). */
  onOpenRight: (id: string) => void;
  /** Reveal the repository folder in the OS file manager. */
  onReveal: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: (path: string) => Promise<void>;
}

export function Drawer({
  repos,
  activeId,
  collapsed,
  pending = null,
  analyzing = null,
  statuses = null,
  loaded = true,
  onToggle,
  onSelect,
  onOpenRight,
  onReveal,
  onRemove,
  onAdd,
}: DrawerProps) {
  const t = useT();
  const [path, setPath] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(
    null,
  );
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<RepoSort>(storedRepoSort);
  const changeSort = (value: RepoSort) => {
    setSort(value);
    storeRepoSort(value);
  };
  // Which repositories have their submodule / worktree accordion open.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  // Attaching a submodule or worktree makes it viewable; then show it in a
  // pane. Opening it on the right sits its graph beside its parent's
  // (ADR 0022).
  const openChild = async (path: string, side: "here" | "right" = "here") => {
    setError(null);
    try {
      await onAdd(path);
      side === "right" ? onOpenRight(path) : onSelect(path);
    } catch (err) {
      setError(String(err));
    }
  };
  // Context menu for a nested row: a submodule or a worktree.
  const [childMenu, setChildMenu] = useState<{
    x: number;
    y: number;
    path: string;
    kind: "submodule" | "worktree";
  } | null>(null);
  const [width, setWidth] = useStoredWidth("gitreant-drawer-width", 260, 180, 480);
  const arranged = arrangeRepos(topLevelRepos(repos), filter, sort);

  const runAdd = async (value: string) => {
    setAdding(true);
    setError(null);
    try {
      await onAdd(value);
      setPath("");
    } catch (err) {
      setError(String(err));
    } finally {
      setAdding(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = path.trim();
    if (value) await runAdd(value);
  };

  const browse = async () => {
    setError(null);
    try {
      const picked = await pickFolder();
      if (picked) await runAdd(picked);
    } catch (err) {
      setError(String(err));
    }
  };

  if (collapsed) {
    return (
      <aside className="drawer drawer-collapsed">
        <LabeledButton
          icon={<ExpandIcon />}
          label={t("expand")}
          testId="drawer-expand"
          className="icon-btn"
          onClick={onToggle}
        />
      </aside>
    );
  }

  return (
    <aside className="drawer" style={{ width }}>
      <div className="drawer-head">
        <span className="drawer-title">{t("repositories")}</span>
        <LabeledButton
          icon={<CollapseIcon />}
          label={t("collapse")}
          testId="drawer-collapse"
          className="icon-btn"
          onClick={onToggle}
        />
      </div>

      <form className="drawer-add" onSubmit={submit}>
        <input
          type="text"
          placeholder={t("addRepoPlaceholder")}
          data-testid="add-input"
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />
        <LabeledButton
          icon={<BrowseIcon />}
          label={t("browse")}
          testId="add-browse"
          className="browse"
          onClick={browse}
          disabled={adding}
        />
        <LabeledButton
          icon={<AddIcon />}
          label={adding ? "…" : t("add")}
          testId="add-submit"
          type="submit"
          disabled={adding}
        />
      </form>
      {error && <p className="drawer-error">{error}</p>}

      {repos.length > 0 && (
        <div className="drawer-arrange">
          <input
            type="search"
            className="drawer-filter"
            placeholder={t("filterRepos")}
            data-testid="repo-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select
            className="drawer-sort"
            aria-label={t("sortBy")}
            title={t("sortBy")}
            data-testid="repo-sort"
            value={sort}
            onChange={(e) => changeSort(e.target.value as RepoSort)}
          >
            <option value="added">{t("sortAdded")}</option>
            <option value="name">{t("sortName")}</option>
            <option value="path">{t("sortPath")}</option>
          </select>
        </div>
      )}

      <ul className="repo-list">
        {arranged.map((repo) => {
          const subs = repo.submodules ?? [];
          const worktrees = repo.worktrees ?? [];
          const isOpen = expanded.has(repo.id);
          return (
            <Fragment key={repo.id}>
              <li
                className={`repo-item${repo.id === activeId ? " active" : ""}${
                  analyzing?.has(repo.id) ? " repo-pending" : ""
                }`}
                data-testid="repo-item"
                data-repo-name={repo.name}
                role="button"
                tabIndex={0}
                aria-current={repo.id === activeId ? true : undefined}
                onClick={() => onSelect(repo.id)}
                onKeyDown={activateOnKey(() => onSelect(repo.id))}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, id: repo.id });
                }}
              >
                <span className="repo-item-name">
                  {subs.length + worktrees.length > 0 && (
                    <button
                      className="repo-disclosure"
                      type="button"
                      title={t(
                        subs.length > 0 && worktrees.length > 0
                          ? "toggleNested"
                          : worktrees.length > 0
                            ? "toggleWorktrees"
                            : "toggleSubmodules",
                      )}
                      aria-expanded={isOpen}
                      data-testid="repo-disclosure"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(repo.id);
                      }}
                    >
                      <DisclosureIcon open={isOpen} />
                    </button>
                  )}
                  {repo.name}
                  {analyzing?.has(repo.id) && (
                    <span
                      className="repo-item-analyzing"
                      data-testid="repo-analyzing"
                    >
                      {" "}
                      {analyzeNote(analyzing.get(repo.id) ?? 0, t)}
                    </span>
                  )}
                </span>
                <span className="repo-item-path" title={repo.path}>
                  {repo.path}
                </span>
                <RepoStats status={statuses?.get(repo.id) ?? undefined} />
                <button
                  className="icon-btn repo-remove"
                  title={t("removeFromView")}
                  data-testid="repo-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(repo.id);
                  }}
                  type="button"
                >
                  ×
                </button>
              </li>
              {isOpen &&
                subs.map((sub) => (
                  <li
                    key={`${repo.id}//${sub.path}`}
                    className={`repo-item repo-submodule${
                      sub.path === activeId ? " active" : ""
                    }`}
                    data-testid="repo-submodule"
                    data-repo-name={sub.name}
                    title={t("openSubmodule")}
                    role="button"
                    tabIndex={0}
                    aria-current={sub.path === activeId ? true : undefined}
                    onClick={() => openChild(sub.path)}
                    onKeyDown={activateOnKey(() => openChild(sub.path))}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setChildMenu({
                        x: e.clientX,
                        y: e.clientY,
                        path: sub.path,
                        kind: "submodule",
                      });
                    }}
                  >
                    <span className="repo-item-name">{sub.name}</span>
                    <span className="repo-item-path" title={sub.path}>
                      {sub.path}
                    </span>
                  </li>
                ))}
              {isOpen &&
                worktrees.map((wt) => (
                  // Another worktree of the same repository: named after its
                  // directory, with the branch it has checked out.
                  <li
                    key={`${repo.id}//${wt.path}`}
                    className={`repo-item repo-submodule repo-worktree${
                      wt.path === activeId ? " active" : ""
                    }`}
                    data-testid="repo-worktree"
                    data-repo-name={wt.name}
                    title={t("openWorktree")}
                    role="button"
                    tabIndex={0}
                    aria-current={wt.path === activeId ? true : undefined}
                    onClick={() => openChild(wt.path)}
                    onKeyDown={activateOnKey(() => openChild(wt.path))}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setChildMenu({
                        x: e.clientX,
                        y: e.clientY,
                        path: wt.path,
                        kind: "worktree",
                      });
                    }}
                  >
                    <span className="repo-item-name">
                      <WorktreeIcon /> {wt.name}
                      <span
                        className="repo-worktree-branch"
                        data-testid="repo-worktree-branch"
                      >
                        {wt.branch ?? t("detachedHead")}
                        {wt.main && ` · ${t("mainWorktree")}`}
                      </span>
                    </span>
                    <span className="repo-item-path" title={wt.path}>
                      {wt.path}
                    </span>
                  </li>
                ))}
            </Fragment>
          );
        })}
        {pending && (
          <li className="repo-item repo-pending" data-testid="repo-pending">
            <span className="repo-item-name">{t("analyzing")}</span>
            <span className="repo-item-path" title={pending}>
              {pending}
            </span>
          </li>
        )}
        {repos.length === 0 && !pending && (
          <li className="repo-empty">
            {loaded ? t("noRepositories") : t("loadingRepos")}
          </li>
        )}
        {repos.length > 0 && arranged.length === 0 && (
          <li className="repo-empty" data-testid="repo-no-match">
            {t("noReposMatch")}
          </li>
        )}
      </ul>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={[
            {
              id: "drawer-open-right",
              label: t("openRightPane"),
              run: () => onOpenRight(menu.id),
            },
            {
              id: "drawer-reveal",
              label: t("revealInExplorer"),
              run: () => onReveal(menu.id),
            },
            {
              id: "drawer-copy-path",
              label: t("copyAbsolutePath"),
              run: () => {
                const repo = repos.find((r) => r.id === menu.id);
                if (repo) navigator.clipboard?.writeText(repo.path);
              },
            },
          ]}
          onClose={() => setMenu(null)}
        />
      )}

      {childMenu && (
        <ContextMenu
          x={childMenu.x}
          y={childMenu.y}
          items={[
            {
              id: `${childMenu.kind}-open`,
              label: t(
                childMenu.kind === "worktree" ? "openWorktree" : "openSubmodule",
              ),
              run: () => openChild(childMenu.path),
            },
            {
              id: `${childMenu.kind}-open-right`,
              label: t("openRightPane"),
              run: () => openChild(childMenu.path, "right"),
            },
            {
              id: `${childMenu.kind}-copy-path`,
              label: t("copyAbsolutePath"),
              run: () => navigator.clipboard?.writeText(childMenu.path),
            },
            // An opened nested repository has no top-level row of its own,
            // so its detach lives here.
            ...(() => {
              const attached = repos.find((r) => r.path === childMenu.path);
              return attached
                ? [
                    {
                      id: `${childMenu.kind}-remove`,
                      label: t("removeFromView"),
                      run: () => onRemove(attached.id),
                    },
                  ]
                : [];
            })(),
          ]}
          onClose={() => setChildMenu(null)}
        />
      )}

      <ResizeHandle
        width={width}
        onWidth={setWidth}
        direction={1}
        label="Resize repository list"
        testId="drawer-resize"
      />
    </aside>
  );
}
