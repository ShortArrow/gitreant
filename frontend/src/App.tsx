import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addRepo,
  fetchCommandLog,
  fetchRemotes,
  fetchRepoList,
  fetchRepoView,
  refreshVerdicts,
  removeRepo,
  revealPath,
  type CommandLogEntry,
  type RepoListEntry,
  type RepoView,
} from "./api";
import { CommandPalette } from "./CommandPalette";
import { ContextMenu } from "./ContextMenu";
import { Drawer } from "./Drawer";
import { FetchIcon, LogIcon, ReloadIcon, SettingsIcon } from "./Icons";
import { LabeledButton } from "./LabeledButton";
import { LogPane } from "./LogPane";
import * as paneModel from "./paneModel";
import {
  CommandRegistryContext,
  useCommandRegistry,
  type PaletteCommand,
} from "./palette";
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
  storeSquashLinks,
  storedSquashLinks,
  type ButtonStyle,
} from "./settings";
import { ThemeToggle } from "./ThemeToggle";

const PAGE_SIZE_KEY = "gitreant-page-size";

/** Graph rows fetched per page; overridable for tests via localStorage. */
function pageSize(): number {
  try {
    const stored = Number(localStorage.getItem(PAGE_SIZE_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : 500;
  } catch {
    return 500;
  }
}

export function App() {
  const [repos, setRepos] = useState<RepoListEntry[]>([]);
  // Each repository view lands independently as its (parallel) read ends.
  const [views, setViews] = useState<Map<string, RepoView>>(new Map());
  // Loading the repo list and running a fetch fail independently; a successful
  // reload right after a failed fetch must not wipe the fetch error.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  // Which repository is open in which pane (ADR 0022). All transitions
  // live in paneModel; this component just dispatches them.
  const [layout, setLayout] = useState(paneModel.emptyLayout);

  // Concurrent updates (initial load, SSE refreshes, add/remove) can resolve out
  // of order. A monotonic sequence marks the newest state; older results that
  // resolve late are ignored so they can't clobber a fresher repo list.
  const fetchSeq = useRef(0);

  // Apply an authoritative repo list (from an add/remove response). Bumping the
  // sequence invalidates any older in-flight fetch so it cannot overwrite this.
  // How many rows each repository has asked for so far (ADR 0023 paging).
  const limitsRef = useRef(new Map<string, number>());
  const loadView = useCallback((id: string, seq: number) => {
    fetchRepoView(id, limitsRef.current.get(id) ?? pageSize())
      .then((view) => {
        if (seq === fetchSeq.current) {
          setViews((prev) => new Map(prev).set(id, view));
        }
      })
      .catch(() => {});
  }, []);

  const loadViews = useCallback(
    (list: RepoListEntry[], seq: number) => {
      for (const entry of list) {
        loadView(entry.id, seq);
      }
    },
    [loadView],
  );

  // The pane scrolled near its end (or cannot fill yet): fetch the next
  // page of rows for this repository.
  const loadMore = useCallback(
    (id: string) => {
      const current = limitsRef.current.get(id) ?? pageSize();
      limitsRef.current.set(id, current + pageSize());
      loadView(id, fetchSeq.current);
    },
    [loadView],
  );

  const applyRepos = useCallback(
    (data: RepoListEntry[]) => {
      const seq = ++fetchSeq.current;
      setRepos(data);
      setLoadError(null);
      loadViews(data, seq);
    },
    [loadViews],
  );

  // Until the first repo list arrives, "no repositories" would be a lie.
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const seq = ++fetchSeq.current;
    try {
      const list = await fetchRepoList();
      if (seq === fetchSeq.current) {
        setRepos(list);
        setLoadError(null);
        loadViews(list, seq);
      }
    } catch (e) {
      if (seq === fetchSeq.current) setLoadError(String(e));
    } finally {
      setLoaded(true);
    }
  }, [loadViews]);

  // Running commit counters of the server-side reads in flight, by repo id.
  const [analyzing, setAnalyzing] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    // Subscribe before the first list request: a server still reading its
    // startup repositories answers that request late, and the progress
    // events streamed meanwhile must not be missed.
    const events = new EventSource("/api/events");
    reload();
    events.addEventListener("update", () => reload());
    // Routine reads finish in milliseconds; a read only surfaces after
    // 300ms so the indicator never flickers. Parallel reads each keep
    // their own counter and reveal timer, keyed by repository id.
    const timers = new Map<string, number>();
    const latest = new Map<string, number>();
    events.addEventListener("analyzing", (e) => {
      const info = JSON.parse((e as MessageEvent<string>).data) as {
        id: string;
        commits: number;
      };
      latest.set(info.id, info.commits);
      setAnalyzing((prev) =>
        prev.has(info.id) ? new Map(prev).set(info.id, info.commits) : prev,
      );
      if (!timers.has(info.id)) {
        timers.set(
          info.id,
          window.setTimeout(() => {
            setAnalyzing((prev) =>
              new Map(prev).set(info.id, latest.get(info.id) ?? 0),
            );
          }, 300),
        );
      }
    });
    events.addEventListener("analyzed", (e) => {
      const id = (e as MessageEvent<string>).data;
      window.clearTimeout(timers.get(id));
      timers.delete(id);
      latest.delete(id);
      setAnalyzing((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    });
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      events.close();
    };
  }, [reload]);

  // Keep tabs/selection consistent when the repo set changes.
  useEffect(() => {
    const ids = new Set(repos.map((r) => r.id));
    setLayout((prev) => paneModel.retainRepos(prev, ids));
    setViews((prev) => {
      if ([...prev.keys()].every((id) => ids.has(id))) return prev;
      return new Map([...prev].filter(([id]) => ids.has(id)));
    });
  }, [repos]);

  const repoById = useMemo(
    () => new Map(repos.map((r) => [r.id, r])),
    [repos],
  );

  const openTab = useCallback((id: string) => {
    setLayout((prev) => paneModel.openTab(prev, id));
  }, []);

  const openRight = useCallback((id: string) => {
    setLayout((prev) => paneModel.moveTab(prev, id, 1));
  }, []);

  const closeTab = useCallback((id: string) => {
    setLayout((prev) => paneModel.closeTab(prev, id));
  }, []);

  // Which tab's context menu is open, and in which pane it lives.
  const [tabMenu, setTabMenu] = useState<{
    x: number;
    y: number;
    id: string;
    pane: number;
  } | null>(null);

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

  // The path whose analysis the server is still working on; shown as a
  // pending drawer entry and in the empty pane until the add resolves.
  const [pendingAdd, setPendingAdd] = useState<string | null>(null);
  const handleAdd = useCallback(
    async (path: string) => {
      recordAction(`Add repository ${path}`);
      setPendingAdd(path);
      try {
        const { id, repos: next } = await addRepo(path);
        applyRepos(next);
        // Never yank a pane someone is reading: the new repository only
        // auto-opens when the focused pane sits empty.
        setLayout((prev) =>
          prev.panes[prev.focused].activeId
            ? prev
            : paneModel.openTab(prev, id),
        );
      } finally {
        setPendingAdd(null);
      }
    },
    [applyRepos, recordAction],
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

  const focusedActiveId = layout.panes[layout.focused]?.activeId ?? null;

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
  const [squashLinks, setSquashLinks] = useState<boolean>(storedSquashLinks);
  const changeSquashLinks = (on: boolean) => {
    setSquashLinks(on);
    storeSquashLinks(on);
  };
  const lang = resolveLang(langSetting, navigator.language);
  const settings = useMemo(
    () => ({ buttonStyle, lang, squashLinks }),
    [buttonStyle, lang, squashLinks],
  );
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

  // Every feature registers its palette commands through this registry
  // (usually via useCommands next to the feature); the palette just reads
  // the merged list, so nothing has to be hand-added here.
  const registry = useCommandRegistry();
  const registryContext = useMemo(
    () => ({ register: registry.register }),
    [registry.register],
  );
  const globalCommands = useMemo<PaletteCommand[]>(
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
        {
          id: "squash-links",
          title: m.cmdToggleSquashLinks,
          run: () => changeSquashLinks(!storedSquashLinks()),
        },
        ...(["icon", "icon-label", "label"] as const).map((style) => ({
          id: `buttons:${style}`,
          title: `${m.settingsButtons}: ${
            m[
              style === "icon"
                ? "buttonsIcon"
                : style === "icon-label"
                  ? "buttonsIconLabel"
                  : "buttonsLabel"
            ]
          }`,
          run: () => changeButtonStyle(style),
        })),
        ...(
          [
            ["auto", m.langAuto],
            ["en", m.langEn],
            ["ja", m.langJa],
          ] as const
        ).map(([value, label]) => ({
          id: `language:${value}`,
          title: `${m.settingsLanguage}: ${label}`,
          run: () => changeLangSetting(value),
        })),
        ...repos.map((repo) => ({
          id: `open:${repo.id}`,
          title: format(m.cmdOpenRepo, { name: repo.name }),
          run: () => openTab(repo.id),
        })),
        ...repos.map((repo) => ({
          id: `open-right:${repo.id}`,
          title: format(m.cmdOpenRepoRight, { name: repo.name }),
          run: () => openRight(repo.id),
        })),
      ];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setters are stable
    [repos, collapsed, lang, runFetch, reload, recordAction, openTab, openRight],
  );
  useEffect(
    () => registry.register(globalCommands),
    [registry.register, globalCommands],
  );

  return (
    <SettingsContext.Provider value={settings}>
    <CommandRegistryContext.Provider value={registryContext}>
    <div className={`layout${collapsed ? " layout-collapsed" : ""}`}>
      <Drawer
        repos={repos}
        activeId={focusedActiveId}
        collapsed={collapsed}
        pending={pendingAdd}
        analyzing={analyzing}
        loaded={loaded}
        onToggle={() => setCollapsed((c) => !c)}
        onSelect={openTab}
        onOpenRight={openRight}
        onReveal={(id) => {
          recordAction(`Reveal ${id}`);
          revealPath(id).catch(() => {});
        }}
        onRemove={handleRemove}
        onAdd={handleAdd}
      />

      <main className="main">
        <div className="topbar">
          <div className="topbar-spacer" />
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
                <legend>{t("settingsGraph")}</legend>
                <label className="settings-option">
                  <input
                    type="checkbox"
                    data-testid="squash-links-toggle"
                    checked={squashLinks}
                    onChange={(e) => changeSquashLinks(e.target.checked)}
                  />
                  {t("squashLinksSetting")}
                </label>
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
              <fieldset className="settings-group">
                <legend>{t("settingsMaintenance")}</legend>
                <button
                  type="button"
                  className="settings-action"
                  data-testid="reverify"
                  title={t("reverifyHint")}
                  onClick={() => {
                    recordAction("Re-verify signatures");
                    refreshVerdicts().catch(() => {});
                    setSettingsOpen(false);
                  }}
                >
                  {t("reverifySignatures")}
                </button>
              </fieldset>
            </div>
          </div>
        )}

        {paletteOpen && (
          <CommandPalette
            commands={registry.commands}
            onClose={() => setPaletteOpen(false)}
          />
        )}

        {(loadError ?? fetchError) && (
          <p className="app-error">{loadError ?? fetchError}</p>
        )}

        {tabMenu && (
          <ContextMenu
            x={tabMenu.x}
            y={tabMenu.y}
            items={
              tabMenu.pane === 0
                ? [
                    {
                      id: "tab-open-right",
                      label: t("openRightPane"),
                      run: () => openRight(tabMenu.id),
                    },
                  ]
                : [
                    {
                      id: "tab-move-left",
                      label: t("moveLeftPane"),
                      run: () =>
                        setLayout((prev) =>
                          paneModel.moveTab(prev, tabMenu.id, 0),
                        ),
                    },
                  ]
            }
            onClose={() => setTabMenu(null)}
          />
        )}

        <div className="panes">
          {layout.panes.map((pane, index) => {
            const view = pane.activeId ? views.get(pane.activeId) : undefined;
            const entry = pane.activeId
              ? repoById.get(pane.activeId)
              : undefined;
            return (
              <section
                key={index}
                className={`pane-slot${
                  index === layout.focused ? " pane-focused" : ""
                }`}
                data-testid="pane-slot"
                onMouseDownCapture={() =>
                  setLayout((prev) => paneModel.focusPane(prev, index))
                }
              >
                {pane.tabs.length > 0 && (
                  <div className="tabbar">
                    {pane.tabs.map((id) => {
                      const tabRepo = repoById.get(id);
                      if (!tabRepo) return null;
                      return (
                        <div
                          key={id}
                          className={`tab${
                            id === pane.activeId ? " active" : ""
                          }`}
                          data-testid="tab"
                          data-tab-name={tabRepo.name}
                          onClick={() => openTab(id)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setTabMenu({
                              x: e.clientX,
                              y: e.clientY,
                              id,
                              pane: index,
                            });
                          }}
                        >
                          <span className="tab-name">{tabRepo.name}</span>
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
                )}
                <div className="pane">
                  {view ? (
                    <RepoCard
                      key={view.id}
                      repo={view}
                      focused={index === layout.focused}
                      onLoadMore={() => loadMore(view.id)}
                    />
                  ) : entry ? (
                    <div className="pane-empty" data-testid="pane-empty">
                      {t("analyzingRepo", { path: entry.path })}
                      {(analyzing.get(entry.id) ?? 0) > 0
                        ? ` (${t("commitsCount", { n: analyzing.get(entry.id)! })})`
                        : ""}
                    </div>
                  ) : (
                    <div className="pane-empty" data-testid="pane-empty">
                      {pendingAdd
                        ? t("analyzingRepo", { path: pendingAdd })
                        : t("emptyPane")}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        {logOpen && <LogPane items={logItems} />}
      </main>
    </div>
    </CommandRegistryContext.Provider>
    </SettingsContext.Provider>
  );
}
