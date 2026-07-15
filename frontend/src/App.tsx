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
import { CommandPalette } from "./CommandPalette";
import { Drawer } from "./Drawer";
import { FetchIcon, LogIcon, ReloadIcon, SettingsIcon } from "./Icons";
import { LabeledButton } from "./LabeledButton";
import { LogPane } from "./LogPane";
import { type PaletteCommand } from "./palette";
import { applyTheme, currentTheme, toggleTheme } from "./theme";
import { mergeLog, type UserAction } from "./logModel";
import { RepoCard } from "./RepoCard";
import { resolveLang, MESSAGES, format, type LangSetting } from "./i18n";
import {
  SettingsContext,
  storeButtonStyle,
  storedButtonStyle,
  storeLangSetting,
  storedLangSetting,
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
  const [langSetting, setLangSetting] = useState<LangSetting>(storedLangSetting);
  const changeLangSetting = (setting: LangSetting) => {
    setLangSetting(setting);
    storeLangSetting(setting);
  };
  const lang = resolveLang(langSetting, navigator.language);
  const settings = useMemo(() => ({ buttonStyle, lang }), [buttonStyle, lang]);
  const t = (key: keyof typeof MESSAGES.en, params?: Record<string, string | number>) =>
    format(MESSAGES[lang][key], params);

  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
        setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const paletteCommands = useMemo<PaletteCommand[]>(
    () => {
      const m = MESSAGES[lang];
      return [
        { id: "fetch", title: m.cmdFetch, run: runFetch },
        {
          id: "reload",
          title: m.cmdReload,
          run: () => {
            recordAction("Reload repositories");
            reload();
          },
        },
        {
          id: "log",
          title: m.cmdToggleLog,
          run: () => setLogOpen((open) => !open),
        },
        { id: "settings", title: m.cmdOpenSettings, run: () => setSettingsOpen(true) },
        {
          id: "theme",
          title: m.cmdToggleTheme,
          run: () => applyTheme(toggleTheme(currentTheme())),
        },
        {
          id: "drawer",
          title: collapsed ? m.cmdExpandDrawer : m.cmdCollapseDrawer,
          run: () => setCollapsed((c) => !c),
        },
        ...repos.map((repo) => ({
          id: `open:${repo.id}`,
          title: format(m.cmdOpenRepo, { name: repo.name }),
          run: () => openTab(repo.id),
        })),
      ];
    },
    [repos, collapsed, lang, runFetch, reload, recordAction, openTab],
  );

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
                  title={t("closeTab")}
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
            label={t("fetch")}
            testId="fetch"
            className="topbar-btn"
            onClick={runFetch}
            disabled={fetching}
          />
          <LabeledButton
            icon={<LogIcon />}
            label={t("log")}
            testId="log-toggle"
            className="topbar-btn"
            active={logOpen}
            onClick={() => setLogOpen((open) => !open)}
          />
          <LabeledButton
            icon={<ReloadIcon />}
            label={t("reload")}
            testId="reload"
            className="topbar-btn"
            onClick={() => {
              recordAction("Reload repositories");
              reload();
            }}
          />
          <LabeledButton
            icon={<SettingsIcon />}
            label={t("settings")}
            testId="settings-toggle"
            className="topbar-btn"
            active={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
          />
          <ThemeToggle />
        </div>

        {settingsOpen && (
          <div
            className="modal-backdrop"
            onMouseDown={() => setSettingsOpen(false)}
          >
            <div
              className="settings-modal"
              data-testid="settings-panel"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <header className="modal-head">
                <h3>{t("settings")}</h3>
                <button
                  className="icon-btn"
                  title={t("closeSettings")}
                  data-testid="settings-close"
                  onClick={() => setSettingsOpen(false)}
                  type="button"
                >
                  ×
                </button>
              </header>
              <fieldset className="settings-group">
                <legend>{t("settingsButtons")}</legend>
                {(
                  [
                    ["icon", t("buttonsIcon")],
                    ["icon-label", t("buttonsIconLabel")],
                    ["label", t("buttonsLabel")],
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
              </fieldset>
              <fieldset className="settings-group">
                <legend>{t("settingsLanguage")}</legend>
                {(
                  [
                    ["auto", t("langAuto")],
                    ["en", t("langEn")],
                    ["ja", t("langJa")],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="settings-option">
                    <input
                      type="radio"
                      name="language"
                      data-testid={`language-${value}`}
                      checked={langSetting === value}
                      onChange={() => changeLangSetting(value)}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
            </div>
          </div>
        )}

        {paletteOpen && (
          <CommandPalette
            commands={paletteCommands}
            onClose={() => setPaletteOpen(false)}
          />
        )}

        {(loadError ?? fetchError) && (
          <p className="app-error">{loadError ?? fetchError}</p>
        )}

        <div className="pane">
          {activeRepo ? (
            <RepoCard key={activeRepo.id} repo={activeRepo} />
          ) : (
            <div className="pane-empty" data-testid="pane-empty">
              {t("emptyPane")}
            </div>
          )}
        </div>

        {logOpen && <LogPane items={logItems} />}
      </main>
    </div>
    </SettingsContext.Provider>
  );
}
