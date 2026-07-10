import { useState } from "react";
import { pickFolder, type RepoView } from "./api";
import { ResizeHandle, useStoredWidth } from "./Resizer";

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
    <aside className="drawer" style={{ width }}>
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
        <button
          type="button"
          className="browse"
          title="Choose a folder…"
          data-testid="add-browse"
          onClick={browse}
          disabled={adding}
        >
          📁
        </button>
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
