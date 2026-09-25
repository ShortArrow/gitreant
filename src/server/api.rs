//! REST + SSE handlers and shared state.

use std::collections::{HashMap, VecDeque};
use std::convert::Infallible;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, watch};
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::{Stream, StreamExt};

use crate::app::{CommitDetailView, FileDiffView, RepoView, Session};
use crate::git::UNCOMMITTED_ID;

use super::{assets, PING_MARKER};

/// One executed external command, kept for the UI's command log.
#[derive(Clone, Serialize)]
struct CommandLogEntry {
    /// Seconds since the Unix epoch when the command finished.
    time: i64,
    /// The repository id (canonical path) the command ran in.
    repo: String,
    /// The full command line.
    command: String,
    ok: bool,
    /// stderr on failure, empty on success.
    message: String,
}

/// Oldest entries are dropped beyond this many.
const COMMAND_LOG_CAPACITY: usize = 200;

/// How long a repository's PR lookup stays cached before `gh` runs again.
const PR_CACHE_TTL: Duration = Duration::from_secs(300);

/// One repository's cached `gh` lookup: open PRs and recently merged ones.
#[derive(Clone, Default)]
struct PrLookup {
    open: Vec<crate::git::PullRequest>,
    merged: Vec<crate::git::MergedPullRequest>,
}

/// How far a repository read has come, streamed to SSE listeners as the
/// `analyzing` event payload (ADR 0023: per-repository, counter only).
#[derive(Clone, Debug, Serialize)]
struct AnalyzeProgress {
    /// The repository id (canonical path) being read.
    id: String,
    /// Commits read so far in this repository.
    commits: usize,
}

/// What the server broadcasts to SSE listeners.
#[derive(Clone, Debug)]
enum ServerEvent {
    /// The repository set or contents changed; clients should reload.
    Update,
    /// A (potentially slow) read of a repository is in progress.
    Analyzing(AnalyzeProgress),
    /// This repository's read finished; its indicator can clear.
    Analyzed(String),
}

/// How often per-repository read progress is streamed at most.
const ANALYZE_THROTTLE: Duration = Duration::from_millis(200);

/// Shared, cloneable server state.
#[derive(Clone)]
pub struct AppState {
    session: Arc<Mutex<Session>>,
    updates: broadcast::Sender<ServerEvent>,
    shutdown: watch::Sender<bool>,
    command_log: Arc<Mutex<VecDeque<CommandLogEntry>>>,
    pr_cache: Arc<Mutex<HashMap<String, (Instant, PrLookup)>>>,
    /// Per repository, the remote each tag was pushed to (tag name → remote
    /// name), refreshed on fetch — lets the UI mark pushed tags apart from
    /// local-only ones and name the remote.
    remote_tags: Arc<Mutex<HashMap<String, HashMap<String, String>>>>,
    /// Repositories whose tag remotes were already refreshed this session,
    /// so the automatic `ls-remote` runs once per repository rather than on
    /// every listing.
    tag_refresh_started: Arc<Mutex<std::collections::HashSet<String>>>,
    /// Author email → GitHub avatar URL, resolved via a `gh` user search for
    /// emails the free noreply parse could not place. Shared across repos.
    avatars: Arc<Mutex<HashMap<String, String>>>,
    /// Emails a `gh` avatar search was already attempted for, so each email is
    /// queried at most once per session (whether or not it matched).
    avatar_started: Arc<Mutex<std::collections::HashSet<String>>>,
}

impl AppState {
    pub fn new(session: Session) -> Self {
        let (updates, _) = broadcast::channel(16);
        let (shutdown, _) = watch::channel(false);
        Self {
            session: Arc::new(Mutex::new(session)),
            updates,
            shutdown,
            command_log: Arc::new(Mutex::new(VecDeque::new())),
            pr_cache: Arc::new(Mutex::new(HashMap::new())),
            remote_tags: Arc::new(Mutex::new(HashMap::new())),
            tag_refresh_started: Arc::new(Mutex::new(std::collections::HashSet::new())),
            avatars: Arc::new(Mutex::new(HashMap::new())),
            avatar_started: Arc::new(Mutex::new(std::collections::HashSet::new())),
        }
    }

    /// Learn which remote each tag was pushed to for any repository not yet
    /// refreshed this session, in the background, then tell clients to
    /// reload so the pushed-tag badges appear without a manual fetch.
    /// `ls-remote` is a network call, so this runs off the request path and
    /// at most once per repository.
    fn ensure_tag_remotes(&self) {
        let fresh: Vec<(String, PathBuf)> = {
            let mut started = self.tag_refresh_started.lock().expect("tag refresh mutex");
            self.repo_paths()
                .into_iter()
                .filter(|(id, _)| started.insert(id.clone()))
                .collect()
        };
        if fresh.is_empty() {
            return;
        }
        let state = self.clone();
        tokio::spawn(async move {
            let worker = state.clone();
            let changed = tokio::task::spawn_blocking(move || {
                let mut changed = false;
                for (id, path) in fresh {
                    let map = fold_tag_remotes(&path);
                    changed |= !map.is_empty();
                    worker
                        .remote_tags
                        .lock()
                        .expect("remote tags mutex")
                        .insert(id, map);
                }
                changed
            })
            .await
            .unwrap_or(false);
            if changed {
                // Wake clients only when something is actually on a remote.
                let _ = state.updates.send(ServerEvent::Update);
            }
        });
    }

    /// Resolve `emails` to GitHub avatars with a `gh` user search, in the
    /// background, then tell clients to reload so the newly-found avatars
    /// appear. Each email is searched at most once per session; the search is a
    /// network call skipped entirely when `gh` is absent, so a missing avatar
    /// never surfaces as an error.
    fn ensure_avatars(&self, emails: Vec<String>) {
        if !crate::git::gh_available() {
            return;
        }
        let fresh: Vec<String> = {
            let mut started = self.avatar_started.lock().expect("avatar started mutex");
            emails
                .into_iter()
                .filter(|e| !e.is_empty() && started.insert(e.clone()))
                .collect()
        };
        if fresh.is_empty() {
            return;
        }
        let state = self.clone();
        tokio::spawn(async move {
            let worker = state.clone();
            let found = tokio::task::spawn_blocking(move || {
                let mut found = false;
                for email in fresh {
                    if let Some(url) = crate::git::gh_search_avatar(&email) {
                        worker
                            .avatars
                            .lock()
                            .expect("avatars mutex")
                            .insert(email, url);
                        found = true;
                    }
                }
                found
            })
            .await
            .unwrap_or(false);
            if found {
                let _ = state.updates.send(ServerEvent::Update);
            }
        });
    }

    /// The cached PR lookup of a repository, unless it went stale.
    fn cached_prs(&self, repo: &str) -> Option<PrLookup> {
        let cache = self.pr_cache.lock().expect("pr cache mutex");
        cache
            .get(repo)
            .filter(|(at, _)| at.elapsed() < PR_CACHE_TTL)
            .map(|(_, lookup)| lookup.clone())
    }

    fn store_prs(&self, repo: &str, lookup: PrLookup) {
        let mut cache = self.pr_cache.lock().expect("pr cache mutex");
        cache.insert(repo.to_string(), (Instant::now(), lookup));
    }

    fn push_log(&self, entry: CommandLogEntry) {
        let mut log = self.command_log.lock().expect("command log mutex");
        if log.len() == COMMAND_LOG_CAPACITY {
            log.pop_front();
        }
        log.push_back(entry);
    }

    /// Watch for a shutdown requested via `POST /api/shutdown`.
    pub(super) fn shutdown_requested(&self) -> watch::Receiver<bool> {
        self.shutdown.subscribe()
    }

    /// Read one repository's view, streaming its analyzing counter to SSE
    /// listeners, logging any external command the read ran (signature
    /// verification) and marking tags known to exist on origin.
    fn read_one(&self, path: &std::path::Path) -> RepoView {
        let id = path.to_string_lossy().into_owned();
        // Stream the walk's running commit count. The first update goes out
        // at once and the rest are throttled so a huge walk cannot flood the
        // SSE channel; there is no leading zero to get stuck on screen.
        let mut last_sent: Option<Instant> = None;
        let mut sent_count: Option<usize> = None;
        let mut last_count = 0;
        let (mut view, executed) = crate::app::read_view(&self.session, path, |commits| {
            last_count = commits;
            if last_sent.is_some_and(|at| at.elapsed() < ANALYZE_THROTTLE) {
                return;
            }
            last_sent = Some(Instant::now());
            sent_count = Some(commits);
            let _ = self.updates.send(ServerEvent::Analyzing(AnalyzeProgress {
                id: id.clone(),
                commits,
            }));
        });
        // Always land on the true total, even when the throttle swallowed
        // the final walk update.
        if sent_count != Some(last_count) {
            let _ = self.updates.send(ServerEvent::Analyzing(AnalyzeProgress {
                id: id.clone(),
                commits: last_count,
            }));
        }
        let _ = self.updates.send(ServerEvent::Analyzed(id));
        if let Some(command) = executed {
            self.push_log(CommandLogEntry {
                time: epoch_now(),
                repo: command.repo,
                command: command.command,
                ok: command.ok,
                message: command.message,
            });
        }
        {
            let remote_tags = self.remote_tags.lock().expect("remote tags mutex");
            if let Some(tag_remotes) = remote_tags.get(&view.id) {
                for r in &mut view.refs {
                    if r.kind == "tag" && r.remote.is_none() {
                        if let Some(remote) = tag_remotes.get(&r.name) {
                            r.remote = Some(remote.clone());
                        }
                    }
                }
            }
        }
        // Fill avatars the free noreply parse left open from the gh-search
        // cache, and schedule a search for any still-unknown author email.
        let mut unresolved: Vec<String> = Vec::new();
        {
            let avatars = self.avatars.lock().expect("avatars mutex");
            for c in &mut view.commits {
                if c.avatar.is_some() || c.email.is_empty() {
                    continue;
                }
                match avatars.get(&c.email) {
                    Some(url) => c.avatar = Some(url.clone()),
                    None => unresolved.push(c.email.clone()),
                }
            }
        }
        if !unresolved.is_empty() {
            self.ensure_avatars(unresolved);
        }
        view
    }

    /// Read the view of the repository identified by `id`, if displayed.
    fn view_of(&self, id: &str) -> Option<RepoView> {
        let path = self.repo_path(id)?;
        Some(self.read_one(&path))
    }

    /// Drop cached signature verdicts and tell clients to reload, so the
    /// next read re-verifies every signed commit (e.g. after a key was
    /// added to the local gpg keyring).
    fn refresh(&self) {
        self.session
            .lock()
            .expect("session mutex")
            .clear_verify_cache();
        let _ = self.updates.send(ServerEvent::Update);
    }

    /// Add a repository; returns whether it was newly added. Notifies SSE
    /// listeners on a successful, non-duplicate add. Returns the repository id
    /// and whether it was newly added.
    fn add_repo(&self, path: &str) -> Result<(String, bool), String> {
        let (id, added) = self
            .session
            .lock()
            .expect("session mutex")
            .add(&PathBuf::from(path))?;
        if added {
            let _ = self.updates.send(ServerEvent::Update);
        }
        Ok((id, added))
    }

    /// Remove a repository by id. Notifies SSE listeners when one was removed.
    fn remove_repo(&self, id: &str) -> bool {
        let removed = self.session.lock().expect("session mutex").remove(id);
        if removed {
            let _ = self.updates.send(ServerEvent::Update);
        }
        removed
    }

    /// The root path of a displayed repository, if `id` is known.
    fn repo_path(&self, id: &str) -> Option<PathBuf> {
        self.session
            .lock()
            .expect("session mutex")
            .path_of(id)
            .cloned()
    }

    /// Ids and root paths of every displayed repository.
    fn repo_paths(&self) -> Vec<(String, PathBuf)> {
        self.session
            .lock()
            .expect("session mutex")
            .paths()
            .iter()
            .map(|p| (p.to_string_lossy().into_owned(), p.clone()))
            .collect()
    }
}

/// Build the application router.
pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/ping", get(ping))
        .route("/api/about", get(about))
        .route("/api/repos", post(add_repo).delete(remove_repo))
        .route("/api/list", get(list_light))
        .route("/api/view", post(repo_view))
        .route("/api/status", post(repo_status))
        .route("/api/refresh", post(refresh))
        .route("/api/commit", post(commit_detail))
        .route("/api/diff", post(file_diff))
        .route("/api/commit-diff", post(commit_diff))
        .route("/api/fetch", post(fetch_remotes))
        .route("/api/checkout", post(checkout))
        .route("/api/merge", post(merge))
        .route("/api/tag", post(create_tag).delete(delete_tag))
        .route("/api/branch", post(create_branch))
        .route("/api/prs", post(list_prs))
        .route("/api/log", get(command_log))
        .route("/api/events", get(events))
        .route("/api/pick", post(pick_folder))
        .route("/api/reveal", post(reveal))
        .route("/api/submodules", post(submodule_graphs))
        .route("/api/shutdown", post(shutdown))
        .fallback(assets::static_handler)
        .with_state(state)
}

async fn ping() -> &'static str {
    PING_MARKER
}

/// What this server was built from, for the info dialog.
#[derive(Serialize)]
struct AboutView {
    version: &'static str,
    /// Short commit hash baked in at build time ("unknown" without git).
    commit: &'static str,
}

async fn about() -> Json<AboutView> {
    Json(AboutView {
        version: env!("CARGO_PKG_VERSION"),
        commit: env!("GITREANT_COMMIT"),
    })
}

/// View reads run gix and (for signed commits) git/gpg subprocesses; keep
/// them off the async workers so the listener stays responsive.
/// One entry of the instant repository list (ADR 0023): everything the
/// drawer needs before any graph has been read.
#[derive(Serialize)]
struct RepoListEntry {
    id: String,
    name: String,
    path: String,
    /// Submodules declared in the repository's `.gitmodules`, so the drawer
    /// can group them under their superproject.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    submodules: Vec<SubmoduleEntry>,
    /// The repository's other worktrees, so the drawer can nest a linked
    /// worktree under its main one and open either as its own view.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    worktrees: Vec<WorktreeEntry>,
}

/// Another worktree of a listed repository, as the drawer consumes it.
#[derive(Serialize)]
struct WorktreeEntry {
    name: String,
    /// Canonical absolute path; opening it attaches the worktree as its own
    /// view, and the drawer matches it against attached repository ids.
    path: String,
    /// The branch checked out there; absent when its HEAD is detached.
    #[serde(skip_serializing_if = "Option::is_none")]
    branch: Option<String>,
    /// The main worktree, as opposed to a linked one.
    main: bool,
}

/// A submodule of a listed repository, as the drawer consumes it.
#[derive(Serialize)]
struct SubmoduleEntry {
    name: String,
    /// Absolute path; opening it attaches the submodule as its own view.
    path: String,
}

/// A declared submodule is only usable once initialized (its directory holds
/// a `.git`). An uninitialized one is an empty directory: opening it would
/// make `gix::discover` walk up and find the superproject itself, silently
/// presenting the parent's graph as the submodule's.
fn initialized(sub: &crate::git::Submodule) -> bool {
    sub.path.join(".git").exists()
}

fn light_list(state: &AppState) -> Vec<RepoListEntry> {
    state
        .repo_paths()
        .into_iter()
        .map(|(id, path)| RepoListEntry {
            name: path
                .file_name()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| "repo".to_string()),
            submodules: crate::git::read_submodules(&path)
                .into_iter()
                .filter(initialized)
                .map(|s| SubmoduleEntry {
                    name: s.name,
                    // Canonical, so the drawer can match it against attached
                    // repository ids (which are canonical paths).
                    path: crate::app::canonical(&s.path)
                        .to_string_lossy()
                        .into_owned(),
                })
                .collect(),
            worktrees: crate::git::read_worktrees(&path)
                .into_iter()
                .map(|w| WorktreeEntry {
                    name: w.name,
                    path: crate::app::canonical(&w.path)
                        .to_string_lossy()
                        .into_owned(),
                    branch: w.branch,
                    main: w.main,
                })
                .collect(),
            path: path.to_string_lossy().into_owned(),
            id,
        })
        .collect()
}

/// Fold every remote's tag listing into a tag→remote map, preferring
/// `origin` when a tag is on several remotes. Best effort: a remote whose
/// `ls-remote` failed contributes nothing.
fn fold_tag_remotes(path: &std::path::Path) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for listing in crate::git::tag_remotes(path) {
        if let Ok(tags) = listing.result {
            for tag in tags {
                let entry = map.entry(tag).or_insert_with(|| listing.remote.clone());
                if listing.remote == "origin" {
                    *entry = "origin".to_string();
                }
            }
        }
    }
    map
}

async fn list_light(State(state): State<AppState>) -> Json<Vec<RepoListEntry>> {
    let entries = light_list(&state);
    state.ensure_tag_remotes();
    Json(entries)
}

#[derive(Deserialize)]
struct RepoViewRequest {
    repo: String,
    /// Page cap: rows beyond this stay server-side until requested.
    limit: Option<usize>,
}

async fn repo_view(
    State(state): State<AppState>,
    Json(req): Json<RepoViewRequest>,
) -> Result<Json<RepoView>, (StatusCode, String)> {
    let reader = state.clone();
    let id = req.repo.clone();
    let limit = req.limit;
    tokio::task::spawn_blocking(move || {
        let view = reader.view_of(&id)?;
        Some(match limit {
            Some(limit) => view.truncate(limit),
            None => view,
        })
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .map(Json)
    .ok_or((
        StatusCode::NOT_FOUND,
        format!("unknown repository: {}", req.repo),
    ))
}

#[derive(Deserialize)]
struct SubmodulesRequest {
    repo: String,
}

/// One submodule's graph beside its superproject: its own (truncated) view
/// plus the superproject commits that moved its pointer (ADR 0022-style
/// correlation regions; the frontend draws the cross-region dashed links).
#[derive(Serialize)]
struct SubmoduleGraphView {
    name: String,
    path: String,
    view: RepoView,
    updates: Vec<GitlinkUpdateView>,
}

#[derive(Serialize)]
struct GitlinkUpdateView {
    /// The superproject commit that moved the pointer.
    commit: String,
    /// The submodule commit the pointer now names.
    sha: String,
}

/// Submodule graphs are correlation context, not the main view; cap their
/// rows so a huge submodule cannot swamp the response.
const SUBMODULE_VIEW_LIMIT: usize = 300;

/// The graphs and pointer history of a repository's submodules. Reads the
/// submodule repositories ad hoc — they need not be attached to the session.
/// An unreadable (e.g. uninitialized) submodule is skipped.
async fn submodule_graphs(
    State(state): State<AppState>,
    Json(req): Json<SubmodulesRequest>,
) -> Result<Json<Vec<SubmoduleGraphView>>, (StatusCode, String)> {
    let Some(root) = state.repo_path(&req.repo) else {
        return Err((
            StatusCode::NOT_FOUND,
            format!("unknown repository: {}", req.repo),
        ));
    };
    tokio::task::spawn_blocking(move || {
        crate::git::read_submodules(&root)
            .into_iter()
            // An uninitialized submodule would resolve to the superproject
            // itself (see `initialized`) — its region must simply not exist.
            .filter(initialized)
            .filter_map(|sub| {
                let data = crate::git::read_repo(&sub.path).ok()?;
                let view = crate::app::build_view(&sub.path, &data, 0).truncate(SUBMODULE_VIEW_LIMIT);
                let updates = crate::git::gitlink_updates(&root, &sub.rel)
                    .into_iter()
                    .map(|u| GitlinkUpdateView {
                        commit: u.commit,
                        sha: u.sha,
                    })
                    .collect();
                Some(SubmoduleGraphView {
                    name: sub.name,
                    path: sub.path.to_string_lossy().into_owned(),
                    view,
                    updates,
                })
            })
            .collect::<Vec<_>>()
    })
    .await
    .map(Json)
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

/// Drop cached signature verdicts; clients reload and the reads re-verify.
async fn refresh(State(state): State<AppState>) -> StatusCode {
    state.refresh();
    StatusCode::OK
}

#[derive(Deserialize)]
struct StatusRequest {
    repo: String,
}

/// A repository's uncommitted / unpushed summary, for the drawer indicators.
#[derive(Serialize)]
struct StatusResponse {
    dirty: usize,
    unpushed: usize,
    local_branches: usize,
}

/// The git-state summary of one repository (uncommitted changes, unpushed
/// commits, local-only branches). Runs git subprocesses, so it is loaded
/// per repository after the instant list, not folded into it.
async fn repo_status(
    State(state): State<AppState>,
    Json(req): Json<StatusRequest>,
) -> Result<Json<StatusResponse>, (StatusCode, String)> {
    let path = state.repo_path(&req.repo).ok_or((
        StatusCode::NOT_FOUND,
        format!("unknown repository: {}", req.repo),
    ))?;
    let status = tokio::task::spawn_blocking(move || crate::git::read_status(&path))
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(StatusResponse {
        dirty: status.dirty,
        unpushed: status.unpushed,
        local_branches: status.local_branches,
    }))
}

#[derive(Deserialize)]
struct RevealRequest {
    /// The repository id (its canonical path).
    repo: String,
    /// Repository-relative file to open; the folder itself when absent.
    #[serde(default)]
    path: Option<String>,
}

/// The absolute path to reveal inside `root`: the folder, or a
/// repository-relative file. Rejects absolute paths and any `..`, so a
/// request can never open something outside the repository.
fn resolve_reveal_target(root: &Path, rel: Option<&str>) -> Result<PathBuf, String> {
    let Some(rel) = rel.filter(|r| !r.is_empty()) else {
        return Ok(root.to_path_buf());
    };
    let rel_path = Path::new(rel);
    let escapes = rel_path.components().any(|c| {
        matches!(
            c,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    });
    if rel_path.is_absolute() || escapes {
        return Err("path must stay inside the repository".to_string());
    }
    Ok(root.join(rel_path))
}

/// Open a repository folder — or a file inside it — with the OS default
/// handler (Explorer / Finder / xdg-open): the drawer reveals a repo, the
/// commit file list opens a file. A local, single-user desktop action.
async fn reveal(
    State(state): State<AppState>,
    Json(req): Json<RevealRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    let root = state.repo_path(&req.repo).ok_or((
        StatusCode::NOT_FOUND,
        format!("unknown repository: {}", req.repo),
    ))?;
    let target = resolve_reveal_target(&root, req.path.as_deref())
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    #[cfg(not(target_os = "android"))]
    {
        tokio::task::spawn_blocking(move || open::that(target))
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("open failed: {e}"),
                )
            })?;
        Ok(StatusCode::OK)
    }
    #[cfg(target_os = "android")]
    {
        // Termux has no file manager to hand the path to.
        let _ = target;
        Err((
            StatusCode::NOT_IMPLEMENTED,
            "revealing files is not available on Android".to_string(),
        ))
    }
}

#[derive(Deserialize)]
struct AddRepoRequest {
    path: String,
}

#[derive(Serialize)]
struct AddRepoResponse {
    /// The id of the repository the path resolved to (whether or not it was new).
    id: String,
    added: bool,
    repos: Vec<RepoListEntry>,
}

async fn add_repo(
    State(state): State<AppState>,
    Json(req): Json<AddRepoRequest>,
) -> Result<Json<AddRepoResponse>, (StatusCode, String)> {
    let adder = state.clone();
    // Registering is quick (repository discovery only); the graph loads
    // through POST /api/view like everywhere else.
    let result = tokio::task::spawn_blocking(move || adder.add_repo(&req.path))
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    match result {
        Ok((id, added)) => Ok(Json(AddRepoResponse {
            id,
            added,
            repos: light_list(&state),
        })),
        Err(message) => Err((StatusCode::BAD_REQUEST, message)),
    }
}

#[derive(Deserialize)]
struct RemoveRepoRequest {
    /// The repository id (its canonical path, as returned in `RepoView::id`).
    path: String,
}

async fn remove_repo(
    State(state): State<AppState>,
    Json(req): Json<RemoveRepoRequest>,
) -> Json<Vec<RepoListEntry>> {
    state.remove_repo(&req.path);
    Json(light_list(&state))
}

#[derive(Deserialize)]
struct CommitDetailRequest {
    /// The repository id (its canonical path, as returned in `RepoView::id`).
    repo: String,
    /// The full commit id.
    id: String,
}

/// Details of one commit (full message + per-file changes), read on demand so
/// the repo list stays cheap. Ids are paths, hence a JSON body instead of a URL.
async fn commit_detail(
    State(state): State<AppState>,
    Json(req): Json<CommitDetailRequest>,
) -> Result<Json<CommitDetailView>, (StatusCode, String)> {
    let Some(path) = state.repo_path(&req.repo) else {
        return Err((
            StatusCode::NOT_FOUND,
            format!("unknown repository: {}", req.repo),
        ));
    };
    let detail = tokio::task::spawn_blocking(move || {
        if req.id == UNCOMMITTED_ID {
            crate::git::read_uncommitted(&path)
        } else {
            crate::git::read_commit(&path, &req.id)
        }
    })
    .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .map_err(|message| (StatusCode::NOT_FOUND, message))?;
    Ok(Json(detail.into()))
}

#[derive(Deserialize)]
struct FileDiffRequest {
    /// The repository id (its canonical path, as returned in `RepoView::id`).
    repo: String,
    /// The full commit id.
    id: String,
    /// Repository-relative path of the changed file.
    path: String,
}

/// One file's unified diff against the commit's first parent, read on demand
/// when a file is opened from the commit detail pane.
async fn file_diff(
    State(state): State<AppState>,
    Json(req): Json<FileDiffRequest>,
) -> Result<Json<FileDiffView>, (StatusCode, String)> {
    let Some(repo) = state.repo_path(&req.repo) else {
        return Err((
            StatusCode::NOT_FOUND,
            format!("unknown repository: {}", req.repo),
        ));
    };
    let diff = tokio::task::spawn_blocking(move || {
        if req.id == UNCOMMITTED_ID {
            crate::git::read_uncommitted_diff(&repo, &req.path)
        } else {
            crate::git::read_file_diff(&repo, &req.id, &req.path)
        }
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .map_err(|message| (StatusCode::NOT_FOUND, message))?;
    Ok(Json(diff.into()))
}

/// The unified diffs of every file changed by one commit, read on demand when
/// the whole-commit diff is opened from the detail pane.
async fn commit_diff(
    State(state): State<AppState>,
    Json(req): Json<CommitDetailRequest>,
) -> Result<Json<Vec<FileDiffView>>, (StatusCode, String)> {
    let Some(repo) = state.repo_path(&req.repo) else {
        return Err((
            StatusCode::NOT_FOUND,
            format!("unknown repository: {}", req.repo),
        ));
    };
    let diffs = tokio::task::spawn_blocking(move || {
        if req.id == UNCOMMITTED_ID {
            crate::git::read_uncommitted_diffs(&repo)
        } else {
            crate::git::read_commit_diff(&repo, &req.id)
        }
    })
    .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .map_err(|message| (StatusCode::NOT_FOUND, message))?;
    Ok(Json(diffs.into_iter().map(Into::into).collect()))
}

#[derive(Serialize)]
struct FetchError {
    /// The repository id (its canonical path).
    repo: String,
    message: String,
}

#[derive(Serialize)]
struct FetchResponse {
    /// One entry per repository whose fetch failed; empty on full success.
    errors: Vec<FetchError>,
}

/// Fetch all remotes of every displayed repository via the `git` CLI (which
/// carries the user's authentication setup), then notify SSE listeners.
/// Every executed command lands in the command log.
async fn fetch_remotes(State(state): State<AppState>) -> Json<FetchResponse> {
    let repos = state.repo_paths();
    let logger = state.clone();
    let errors = tokio::task::spawn_blocking(move || {
        repos
            .into_iter()
            .filter_map(|(repo, path)| {
                let result = crate::git::fetch_remotes(&path);
                logger.push_log(CommandLogEntry {
                    time: epoch_now(),
                    repo: repo.clone(),
                    command: crate::git::fetch_command(&path),
                    ok: result.is_ok(),
                    message: result.as_ref().err().cloned().unwrap_or_default(),
                });
                // Refresh which remote (if any) each tag was pushed to, so the
                // views can mark pushed tags apart from local-only ones and
                // name the remote. origin wins when a tag is on several.
                let mut tag_remotes: HashMap<String, String> = HashMap::new();
                for listing in crate::git::tag_remotes(&path) {
                    logger.push_log(CommandLogEntry {
                        time: epoch_now(),
                        repo: repo.clone(),
                        command: listing.command,
                        ok: listing.result.is_ok(),
                        message: listing.result.as_ref().err().cloned().unwrap_or_default(),
                    });
                    if let Ok(tags) = listing.result {
                        for tag in tags {
                            let entry = tag_remotes
                                .entry(tag)
                                .or_insert_with(|| listing.remote.clone());
                            if listing.remote == "origin" {
                                *entry = "origin".to_string();
                            }
                        }
                    }
                }
                logger
                    .remote_tags
                    .lock()
                    .expect("remote tags mutex")
                    .insert(repo.clone(), tag_remotes);
                result.err().map(|message| FetchError { repo, message })
            })
            .collect()
    })
    .await
    .unwrap_or_default();
    let _ = state.updates.send(ServerEvent::Update);
    Json(FetchResponse { errors })
}

#[derive(Deserialize)]
struct BranchOpRequest {
    /// The repository id (its canonical path, as returned in `RepoView::id`).
    repo: String,
    /// A local branch name, or a remote-tracking ref like "origin/main".
    reference: String,
}

#[derive(Serialize)]
struct BranchOpResponse {
    ok: bool,
    /// git's stderr when the operation failed (e.g. merge conflicts).
    message: String,
}

/// Run one branch operation via the git CLI, log it, and notify SSE listeners
/// so every client re-reads the changed repository.
async fn branch_op(
    state: AppState,
    req: BranchOpRequest,
    command: fn(&std::path::Path, &str) -> String,
    run: fn(&std::path::Path, &str) -> Result<(), String>,
) -> Result<Json<BranchOpResponse>, (StatusCode, String)> {
    let Some(path) = state.repo_path(&req.repo) else {
        return Err((
            StatusCode::NOT_FOUND,
            format!("unknown repository: {}", req.repo),
        ));
    };
    let logger = state.clone();
    let result = tokio::task::spawn_blocking(move || {
        let result = run(&path, &req.reference);
        logger.push_log(CommandLogEntry {
            time: epoch_now(),
            repo: req.repo,
            command: command(&path, &req.reference),
            ok: result.is_ok(),
            message: result.as_ref().err().cloned().unwrap_or_default(),
        });
        result
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let _ = state.updates.send(ServerEvent::Update);
    Ok(Json(BranchOpResponse {
        ok: result.is_ok(),
        message: result.err().unwrap_or_default(),
    }))
}

/// Switch the checked-out branch of one repository.
async fn checkout(
    State(state): State<AppState>,
    Json(req): Json<BranchOpRequest>,
) -> Result<Json<BranchOpResponse>, (StatusCode, String)> {
    branch_op(
        state,
        req,
        crate::git::checkout_command,
        crate::git::checkout,
    )
    .await
}

/// Merge a reference into the checked-out branch of one repository.
async fn merge(
    State(state): State<AppState>,
    Json(req): Json<BranchOpRequest>,
) -> Result<Json<BranchOpResponse>, (StatusCode, String)> {
    branch_op(state, req, crate::git::merge_command, crate::git::merge).await
}

#[derive(Deserialize)]
struct CreateTagRequest {
    /// The repository id (its canonical path, as returned in `RepoView::id`).
    repo: String,
    name: String,
    /// The full commit id the tag points at.
    commit: String,
}

/// Create a lightweight tag via the git CLI, log it, and notify listeners.
async fn create_tag(
    State(state): State<AppState>,
    Json(req): Json<CreateTagRequest>,
) -> Result<Json<BranchOpResponse>, (StatusCode, String)> {
    let Some(path) = state.repo_path(&req.repo) else {
        return Err((
            StatusCode::NOT_FOUND,
            format!("unknown repository: {}", req.repo),
        ));
    };
    let logger = state.clone();
    let result = tokio::task::spawn_blocking(move || {
        let result = crate::git::create_tag(&path, &req.name, &req.commit);
        logger.push_log(CommandLogEntry {
            time: epoch_now(),
            repo: req.repo,
            command: crate::git::create_tag_command(&path, &req.name, &req.commit),
            ok: result.is_ok(),
            message: result.as_ref().err().cloned().unwrap_or_default(),
        });
        result
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let _ = state.updates.send(ServerEvent::Update);
    Ok(Json(BranchOpResponse {
        ok: result.is_ok(),
        message: result.err().unwrap_or_default(),
    }))
}

/// Create a branch at a commit (no checkout) via the git CLI, log it, and
/// notify listeners. Shares the create-tag request shape.
async fn create_branch(
    State(state): State<AppState>,
    Json(req): Json<CreateTagRequest>,
) -> Result<Json<BranchOpResponse>, (StatusCode, String)> {
    let Some(path) = state.repo_path(&req.repo) else {
        return Err((
            StatusCode::NOT_FOUND,
            format!("unknown repository: {}", req.repo),
        ));
    };
    let logger = state.clone();
    let result = tokio::task::spawn_blocking(move || {
        let result = crate::git::create_branch(&path, &req.name, &req.commit);
        logger.push_log(CommandLogEntry {
            time: epoch_now(),
            repo: req.repo,
            command: crate::git::create_branch_command(&path, &req.name, &req.commit),
            ok: result.is_ok(),
            message: result.as_ref().err().cloned().unwrap_or_default(),
        });
        result
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let _ = state.updates.send(ServerEvent::Update);
    Ok(Json(BranchOpResponse {
        ok: result.is_ok(),
        message: result.err().unwrap_or_default(),
    }))
}

#[derive(Deserialize)]
struct DeleteTagRequest {
    /// The repository id (its canonical path, as returned in `RepoView::id`).
    repo: String,
    name: String,
}

/// Delete a local tag via the git CLI, log it, and notify listeners.
async fn delete_tag(
    State(state): State<AppState>,
    Json(req): Json<DeleteTagRequest>,
) -> Result<Json<BranchOpResponse>, (StatusCode, String)> {
    let Some(path) = state.repo_path(&req.repo) else {
        return Err((
            StatusCode::NOT_FOUND,
            format!("unknown repository: {}", req.repo),
        ));
    };
    let logger = state.clone();
    let result = tokio::task::spawn_blocking(move || {
        let result = crate::git::delete_tag(&path, &req.name);
        logger.push_log(CommandLogEntry {
            time: epoch_now(),
            repo: req.repo,
            command: crate::git::delete_tag_command(&path, &req.name),
            ok: result.is_ok(),
            message: result.as_ref().err().cloned().unwrap_or_default(),
        });
        result
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let _ = state.updates.send(ServerEvent::Update);
    Ok(Json(BranchOpResponse {
        ok: result.is_ok(),
        message: result.err().unwrap_or_default(),
    }))
}

#[derive(Deserialize)]
struct PrsRequest {
    /// The repository id (its canonical path, as returned in `RepoView::id`).
    repo: String,
}

#[derive(Serialize)]
struct PrsResponse {
    /// Open pull requests, keyed by their head branch name. Empty when gh is
    /// missing, unauthenticated, or the repository has no GitHub remote.
    prs: Vec<crate::git::PullRequest>,
    /// Recently merged pull requests, for squash-merge links in the graph.
    merged: Vec<crate::git::MergedPullRequest>,
}

/// Open and recently merged pull requests of one repository, via the user's
/// `gh` CLI. Results are cached per repository for a few minutes; executed
/// lookups land in the command log.
async fn list_prs(
    State(state): State<AppState>,
    Json(req): Json<PrsRequest>,
) -> Result<Json<PrsResponse>, (StatusCode, String)> {
    let Some(path) = state.repo_path(&req.repo) else {
        return Err((
            StatusCode::NOT_FOUND,
            format!("unknown repository: {}", req.repo),
        ));
    };
    if let Some(lookup) = state.cached_prs(&req.repo) {
        return Ok(Json(PrsResponse {
            prs: lookup.open,
            merged: lookup.merged,
        }));
    }
    if !crate::git::gh_available() {
        return Ok(Json(PrsResponse {
            prs: Vec::new(),
            merged: Vec::new(),
        }));
    }
    let logger = state.clone();
    let repo = req.repo.clone();
    let lookup = tokio::task::spawn_blocking(move || {
        let log = |command: String, error: Option<&String>| {
            logger.push_log(CommandLogEntry {
                time: epoch_now(),
                repo: repo.clone(),
                command,
                ok: error.is_none(),
                message: error.cloned().unwrap_or_default(),
            });
        };
        let open = crate::git::list_prs(&path);
        log(crate::git::pr_command(), open.as_ref().err());
        // A failed open lookup (no gh auth, non-GitHub remote) would fail
        // again here; skip the second call and its log noise.
        let merged = if open.is_ok() {
            let merged = crate::git::list_merged_prs(&path);
            log(crate::git::merged_pr_command(), merged.as_ref().err());
            merged.unwrap_or_default()
        } else {
            Vec::new()
        };
        PrLookup {
            open: open.unwrap_or_default(),
            merged,
        }
    })
    .await
    .unwrap_or_default();
    state.store_prs(&req.repo, lookup.clone());
    Ok(Json(PrsResponse {
        prs: lookup.open,
        merged: lookup.merged,
    }))
}

fn epoch_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// The executed external commands, oldest first.
async fn command_log(State(state): State<AppState>) -> Json<Vec<CommandLogEntry>> {
    let log = state.command_log.lock().expect("command log mutex");
    Json(log.iter().cloned().collect())
}

#[derive(Serialize)]
struct PickResponse {
    /// The chosen directory, or `null` if the dialog was cancelled.
    path: Option<String>,
}

/// Open a native folder-picker on the machine running the server (the user's own
/// machine, since gitreant is a local tool) and return the chosen path.
#[cfg(not(target_os = "android"))]
async fn pick_folder() -> Json<PickResponse> {
    let picked = tokio::task::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("Select a git repository")
            .pick_folder()
    })
    .await
    .ok()
    .flatten()
    .map(|p| p.to_string_lossy().into_owned());
    Json(PickResponse { path: picked })
}

/// Android (Termux) has no native folder-picker; answer "cancelled" so the
/// SPA's Browse button quietly does nothing and paths are typed instead.
#[cfg(target_os = "android")]
async fn pick_folder() -> Json<PickResponse> {
    Json(PickResponse { path: None })
}

async fn shutdown(State(state): State<AppState>) -> &'static str {
    let _ = state.shutdown.send(true);
    "shutting down"
}

async fn events(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let stream = BroadcastStream::new(state.updates.subscribe()).map(|event| {
        Ok(match event {
            // A lagged receiver missed events; a reload resyncs it.
            Ok(ServerEvent::Update) | Err(_) => Event::default().event("update").data("changed"),
            Ok(ServerEvent::Analyzing(progress)) => Event::default()
                .event("analyzing")
                .data(serde_json::to_string(&progress).unwrap_or_default()),
            Ok(ServerEvent::Analyzed(id)) => Event::default().event("analyzed").data(id),
        })
    });
    Sse::new(stream).keep_alive(KeepAlive::default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reveal_target_defaults_to_the_repository_folder() {
        let root = Path::new("/repos/demo");
        assert_eq!(resolve_reveal_target(root, None).unwrap(), root);
        assert_eq!(resolve_reveal_target(root, Some("")).unwrap(), root);
    }

    #[test]
    fn reveal_target_joins_a_relative_file() {
        let root = Path::new("/repos/demo");
        assert_eq!(
            resolve_reveal_target(root, Some("src/main.rs")).unwrap(),
            root.join("src/main.rs"),
        );
    }

    #[test]
    fn reveal_target_rejects_escaping_paths() {
        let root = Path::new("/repos/demo");
        assert!(resolve_reveal_target(root, Some("../secret")).is_err());
        assert!(resolve_reveal_target(root, Some("a/../../b")).is_err());
        assert!(resolve_reveal_target(root, Some("/etc/passwd")).is_err());
    }
}
