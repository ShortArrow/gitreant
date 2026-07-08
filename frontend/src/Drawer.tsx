import { useState } from "react";
import type { RepoView } from "./api";

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
  const [path, setPath] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = path.trim();
    if (!value) return;
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

  if (collapsed) {
    return (
      <aside className="drawer drawer-collapsed">
        <button
          className="icon-btn"
          title="Expand"
          data-testid="drawer-expand"
          onClick={onToggle}
          type="button"
        >
          ›
        </button>
      </aside>
    );
  }

  return (
    <aside className="drawer">
      <div className="drawer-head">
        <span className="drawer-title">Repositories</span>
        <button
          className="icon-btn"
          title="Collapse"
          data-testid="drawer-collapse"
          onClick={onToggle}
          type="button"
        >
          ‹
        </button>
      </div>

      <form className="drawer-add" onSubmit={submit}>
        <input
          type="text"
          placeholder="Add repository path…"
          data-testid="add-input"
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />
        <button type="submit" data-testid="add-submit" disabled={adding}>
          {adding ? "…" : "Add"}
        </button>
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
              title="Remove from view"
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
        {repos.length === 0 && <li className="repo-empty">No repositories.</li>}
      </ul>
    </aside>
  );
}
