import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addRepo, fetchRepos, removeRepo, type RepoView } from "./api";
import { Drawer } from "./Drawer";
import { RepoCard } from "./RepoCard";
import { ThemeToggle } from "./ThemeToggle";

export function App() {
  const [repos, setRepos] = useState<RepoView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Concurrent updates (initial load, SSE refreshes, add/remove) can resolve out
  // of order. A monotonic sequence marks the newest state; older results that
  // resolve late are ignored so they can't clobber a fresher repo list.
  const fetchSeq = useRef(0);

  // Apply an authoritative repo list (from an add/remove response). Bumping the
  // sequence invalidates any older in-flight fetch so it cannot overwrite this.
  const applyRepos = useCallback((data: RepoView[]) => {
    fetchSeq.current += 1;
    setRepos(data);
    setError(null);
  }, []);

  const reload = useCallback(async () => {
    const seq = ++fetchSeq.current;
    try {
      const data = await fetchRepos();
      if (seq === fetchSeq.current) {
        setRepos(data);
        setError(null);
      }
    } catch (e) {
      if (seq === fetchSeq.current) setError(String(e));
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
      applyRepos(await removeRepo(id));
    },
    [applyRepos],
  );

  const handleAdd = useCallback(
    async (path: string) => {
      const before = new Set(repos.map((r) => r.id));
      const { repos: next } = await addRepo(path);
      applyRepos(next);
      const added = next.find((r) => !before.has(r.id));
      if (added) openTab(added.id);
    },
    [repos, applyRepos, openTab],
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
        <div className="topbar">
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
          <ThemeToggle />
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
