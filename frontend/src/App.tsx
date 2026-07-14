import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addRepo,
  fetchCommandLog,
  fetchRemotes,
  fetchRepos,
  removeRepo,
  type CommandLogEntry,
  type RepoView,
} from "./api";
import { Drawer } from "./Drawer";
import { FetchIcon, LogIcon, ReloadIcon, SettingsIcon } from "./Icons";
import { LabeledButton } from "./LabeledButton";
import { LogPane } from "./LogPane";
import { mergeLog, type UserAction } from "./logModel";
import { RepoCard } from "./RepoCard";
import {
  SettingsContext,
  storeButtonStyle,
  storedButtonStyle,
  type ButtonStyle,
} from "./settings";
import { ThemeToggle } from "./ThemeToggle";

export function App() {
  const [repos, setRepos] = useState<RepoView[]>([]);
  // Loading the repo list and running a fetch fail independently; a successful
  // reload right after a failed fetch must not wipe the fetch error.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
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
    setLoadError(null);
  }, []);

  const reload = useCallback(async () => {
    const seq = ++fetchSeq.current;
    try {
      const data = await fetchRepos();
      if (seq === fetchSeq.current) {
        setRepos(data);
        setLoadError(null);
      }
    } catch (e) {
      if (seq === fetchSeq.current) setLoadError(String(e));
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

  // UI interactions shown back to the user in the log pane. Client-side only:
  // the server's command log stays a record of executed external commands.
  const [actions, setActions] = useState<UserAction[]>([]);
  const recordAction = useCallback((text: string) => {
    const time = Math.floor(Date.now() / 1000);
    setActions((prev) => [...prev, { time, text }]);
  }, []);

  const handleRemove = useCallback(
    async (id: string) => {
      recordAction(`Remove repository ${id}`);
      applyRepos(await removeRepo(id));
    },
    [applyRepos, recordAction],
  );

  const handleAdd = useCallback(
    async (path: string) => {
      recordAction(`Add repository ${path}`);
      const { id, repos: next } = await addRepo(path);
      applyRepos(next);
      openTab(id);
    },
    [applyRepos, openTab, recordAction],
  );

  const [logOpen, setLogOpen] = useState(false);
  const [logEntries, setLogEntries] = useState<CommandLogEntry[]>([]);

  // Refresh the log whenever it is visible and the repo state moved (reload
  // after fetch, SSE updates, add/remove all funnel through `repos`).
  useEffect(() => {
    if (!logOpen) return;
    let stale = false;
    fetchCommandLog()
      .then((entries) => {
        if (!stale) setLogEntries(entries);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [logOpen, repos]);

  const [fetching, setFetching] = useState(false);
  const runFetch = useCallback(async () => {
    recordAction("Fetch remotes");
    setFetching(true);
    try {
      const result = await fetchRemotes();
      setFetchError(
        result.errors.length
          ? result.errors.map((e) => `${e.repo}: ${e.message}`).join(" / ")
          : null,
      );
      await reload();
    } catch (e) {
      setFetchError(String(e));
    } finally {
      setFetching(false);
    }
  }, [reload, recordAction]);

  const logItems = useMemo(
    () => mergeLog(logEntries, actions),
    [logEntries, actions],
  );

  const activeRepo = activeId ? repoById.get(activeId) : undefined;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [buttonStyle, setButtonStyle] = useState<ButtonStyle>(storedButtonStyle);
  const changeButtonStyle = (style: ButtonStyle) => {
    setButtonStyle(style);
    storeButtonStyle(style);
  };
  const settings = useMemo(() => ({ buttonStyle }), [buttonStyle]);

  return (
    <SettingsContext.Provider value={settings}>
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
          <LabeledButton
            icon={<FetchIcon />}
            label="Fetch"
            testId="fetch"
            className="topbar-btn"
            onClick={runFetch}
            disabled={fetching}
          />
          <LabeledButton
            icon={<LogIcon />}
            label="Log"
            testId="log-toggle"
            className="topbar-btn"
            active={logOpen}
            onClick={() => setLogOpen((open) => !open)}
          />
          <LabeledButton
            icon={<ReloadIcon />}
            label="Reload"
            testId="reload"
            className="topbar-btn"
            onClick={() => {
              recordAction("Reload repositories");
              reload();
            }}
          />
          <LabeledButton
            icon={<SettingsIcon />}
            label="Settings"
            testId="settings-toggle"
            className="topbar-btn"
            active={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
          />
          <ThemeToggle />
        </div>

        {settingsOpen && (
          <div className="settings-panel" data-testid="settings-panel">
            <span className="settings-title">Buttons</span>
            {(
              [
                ["icon", "Icon"],
                ["icon-label", "Icon + label"],
                ["label", "Label"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="settings-option">
                <input
                  type="radio"
                  name="button-style"
                  data-testid={`button-style-${value}`}
                  checked={buttonStyle === value}
                  onChange={() => changeButtonStyle(value)}
                />
                {label}
              </label>
            ))}
          </div>
        )}

        {(loadError ?? fetchError) && (
          <p className="app-error">{loadError ?? fetchError}</p>
        )}

        <div className="pane">
          {activeRepo ? (
            <RepoCard key={activeRepo.id} repo={activeRepo} />
          ) : (
            <div className="pane-empty" data-testid="pane-empty">
              左のドロワーからリポジトリを選択してください。
            </div>
          )}
        </div>

        {logOpen && <LogPane items={logItems} />}
      </main>
    </div>
    </SettingsContext.Provider>
  );
}
