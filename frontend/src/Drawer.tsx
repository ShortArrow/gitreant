import { useState } from "react";
import { pickFolder, type RepoView } from "./api";
import { AddIcon, BrowseIcon, CollapseIcon, ExpandIcon } from "./Icons";
import { LabeledButton } from "./LabeledButton";
import { ResizeHandle, useStoredWidth } from "./Resizer";
import { useT } from "./settings";

interface DrawerProps {
  repos: RepoView[];
  activeId: string | null;
  collapsed: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: (path: string) => Promise<void>;
}

export function Drawer({
  repos,
  activeId,
  collapsed,
  onToggle,
  onSelect,
  onRemove,
  onAdd,
}: DrawerProps) {
  const t = useT();
  const [path, setPath] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
            className={`repo-item${repo.id === activeId ? " active" : ""}`}
            data-testid="repo-item"
            data-repo-name={repo.name}
            onClick={() => onSelect(repo.id)}
          >
            <span className="repo-item-name">{repo.name}</span>
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
        {repos.length === 0 && (
          <li className="repo-empty">{t("noRepositories")}</li>
        )}
      </ul>

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
