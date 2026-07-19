import { useState } from "react";
import { pickFolder, type RepoListEntry } from "./api";
import { ContextMenu } from "./ContextMenu";
import { AddIcon, BrowseIcon, CollapseIcon, ExpandIcon } from "./Icons";
import { LabeledButton } from "./LabeledButton";
import { ResizeHandle, useStoredWidth } from "./Resizer";
import { useT } from "./settings";
import type { MsgKey } from "./i18n";

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

interface DrawerProps {
  repos: RepoListEntry[];
  activeId: string | null;
  collapsed: boolean;
  /** A path whose analysis is still running server-side, if any. */
  pending?: string | null;
  /** Running commit counters of in-flight reads, by repository id. */
  analyzing?: Map<string, number> | null;
  /** False until the first repository list arrived. */
  loaded?: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  /** Open the repository in the right pane (ADR 0022). */
  onOpenRight: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: (path: string) => Promise<void>;
}

export function Drawer({
  repos,
  activeId,
  collapsed,
  pending = null,
  analyzing = null,
  loaded = true,
  onToggle,
  onSelect,
  onOpenRight,
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
  const [width, setWidth] = useStoredWidth("gitreant-drawer-width", 260, 180, 480);

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

      <ul className="repo-list">
        {repos.map((repo) => (
          <li
            key={repo.id}
            className={`repo-item${repo.id === activeId ? " active" : ""}${
              analyzing?.has(repo.id) ? " repo-pending" : ""
            }`}
            data-testid="repo-item"
            data-repo-name={repo.name}
            onClick={() => onSelect(repo.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, id: repo.id });
            }}
          >
            <span className="repo-item-name">
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
        ))}
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
          ]}
          onClose={() => setMenu(null)}
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
