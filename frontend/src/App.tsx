import { useCallback, useEffect, useMemo, useState } from "react";
import { addRepo, fetchRepos, removeRepo, type RepoView } from "./api";
import { Drawer } from "./Drawer";
import { RepoCard } from "./RepoCard";

export function App() {
  const [repos, setRepos] = useState<RepoView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setRepos(await fetchRepos());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    reload();
    const events = new EventSource("/api/events");
    events.addEventListener("update", () => reload());
    return () => events.close();
  }, [reload]);

  // Keep tabs/selection consistent when the repo set changes.
  useEffect(() => {
    const ids = new Set(repos.map((r) => r.id));
    setOpenTabs((prev) => prev.filter((id) => ids.has(id)));
  }, [repos]);

  useEffect(() => {
    if (activeId && !openTabs.includes(activeId)) {
      setActiveId(openTabs[openTabs.length - 1] ?? null);
    }
  }, [openTabs, activeId]);

  const repoById = useMemo(
    () => new Map(repos.map((r) => [r.id, r])),
    [repos],
  );

  const openTab = useCallback((id: string) => {
    setOpenTabs((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActiveId(id);
  }, []);

  const closeTab = useCallback((id: string) => {
    setOpenTabs((prev) => prev.filter((t) => t !== id));
  }, []);

  const handleRemove = useCallback(
    async (id: string) => {
      await removeRepo(id);
      await reload();
    },
    [reload],
  );

  const handleAdd = useCallback(
    async (path: string) => {
      const before = new Set(repos.map((r) => r.id));
      await addRepo(path);
      const next = await fetchRepos();
      setRepos(next);
      const added = next.find((r) => !before.has(r.id));
      if (added) openTab(added.id);
    },
    [repos, openTab],
  );

  const activeRepo = activeId ? repoById.get(activeId) : undefined;

  return (
    <div className={`layout${collapsed ? " layout-collapsed" : ""}`}>
      <Drawer
        repos={repos}
        activeId={activeId}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        onSelect={openTab}
        onRemove={handleRemove}
        onAdd={handleAdd}
      />

      <main className="main">
        <div className="tabbar">
          {openTabs.map((id) => {
            const repo = repoById.get(id);
            if (!repo) return null;
            return (
              <div
                key={id}
                className={`tab${id === activeId ? " active" : ""}`}
                data-testid="tab"
                data-tab-name={repo.name}
                onClick={() => setActiveId(id)}
              >
                <span className="tab-name">{repo.name}</span>
                <button
                  className="tab-close"
                  title="Close tab"
                  data-testid="tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(id);
                  }}
                  type="button"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        {error && <p className="app-error">{error}</p>}

        <div className="pane">
          {activeRepo ? (
            <RepoCard repo={activeRepo} />
          ) : (
            <div className="pane-empty" data-testid="pane-empty">
              左のドロワーからリポジトリを選択してください。
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
