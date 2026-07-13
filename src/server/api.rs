//! REST + SSE handlers and shared state.

use std::collections::{HashMap, VecDeque};
use std::convert::Infallible;
use std::path::PathBuf;
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

/// Shared, cloneable server state.
#[derive(Clone)]
pub struct AppState {
    session: Arc<Mutex<Session>>,
    updates: broadcast::Sender<()>,
    shutdown: watch::Sender<bool>,
    command_log: Arc<Mutex<VecDeque<CommandLogEntry>>>,
    pr_cache: Arc<Mutex<HashMap<String, (Instant, Vec<crate::git::PullRequest>)>>>,
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
        }
    }

    /// The cached PR list of a repository, unless it went stale.
    fn cached_prs(&self, repo: &str) -> Option<Vec<crate::git::PullRequest>> {
        let cache = self.pr_cache.lock().expect("pr cache mutex");
        cache
            .get(repo)
            .filter(|(at, _)| at.elapsed() < PR_CACHE_TTL)
            .map(|(_, prs)| prs.clone())
    }

    fn store_prs(&self, repo: &str, prs: Vec<crate::git::PullRequest>) {
        let mut cache = self.pr_cache.lock().expect("pr cache mutex");
        cache.insert(repo.to_string(), (Instant::now(), prs));
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

    /// Read every repository view, logging any external commands the read ran
    /// (signature verification).
    fn views(&self) -> Vec<RepoView> {
        let (views, executed) = self.session.lock().expect("session mutex").views();
        for command in executed {
            self.push_log(CommandLogEntry {
                time: epoch_now(),
                repo: command.repo,
                command: command.command,
                ok: command.ok,
                message: command.message,
            });
        }
        views
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
            let _ = self.updates.send(());
        }
        Ok((id, added))
    }

    /// Remove a repository by id. Notifies SSE listeners when one was removed.
    fn remove_repo(&self, id: &str) -> bool {
        let removed = self.session.lock().expect("session mutex").remove(id);
        if removed {
            let _ = self.updates.send(());
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
        .route(
            "/api/repos",
            get(list_repos).post(add_repo).delete(remove_repo),
        )
        .route("/api/commit", post(commit_detail))
        .route("/api/diff", post(file_diff))
        .route("/api/commit-diff", post(commit_diff))
        .route("/api/fetch", post(fetch_remotes))
        .route("/api/prs", post(list_prs))
        .route("/api/log", get(command_log))
        .route("/api/events", get(events))
        .route("/api/pick", post(pick_folder))
        .route("/api/shutdown", post(shutdown))
        .fallback(assets::static_handler)
        .with_state(state)
}

async fn ping() -> &'static str {
    PING_MARKER
}

async fn list_repos(State(state): State<AppState>) -> Json<Vec<RepoView>> {
    Json(state.views())
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
    repos: Vec<RepoView>,
}

async fn add_repo(
    State(state): State<AppState>,
    Json(req): Json<AddRepoRequest>,
) -> Result<Json<AddRepoResponse>, (StatusCode, String)> {
    match state.add_repo(&req.path) {
        Ok((id, added)) => Ok(Json(AddRepoResponse {
            id,
            added,
            repos: state.views(),
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
) -> Json<Vec<RepoView>> {
    state.remove_repo(&req.path);
    Json(state.views())
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
        return Err((StatusCode::NOT_FOUND, format!("unknown repository: {}", req.repo)));
    };
    let detail = tokio::task::spawn_blocking(move || crate::git::read_commit(&path, &req.id))
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
        return Err((StatusCode::NOT_FOUND, format!("unknown repository: {}", req.repo)));
    };
    let diff =
        tokio::task::spawn_blocking(move || crate::git::read_file_diff(&repo, &req.id, &req.path))
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
        return Err((StatusCode::NOT_FOUND, format!("unknown repository: {}", req.repo)));
    };
    let diffs =
        tokio::task::spawn_blocking(move || crate::git::read_commit_diff(&repo, &req.id))
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
                result.err().map(|message| FetchError { repo, message })
            })
            .collect()
    })
    .await
    .unwrap_or_default();
    let _ = state.updates.send(());
    Json(FetchResponse { errors })
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
}

/// Open pull requests of one repository, via the user's `gh` CLI. Results are
/// cached per repository for a few minutes; executed lookups land in the
/// command log.
async fn list_prs(
    State(state): State<AppState>,
    Json(req): Json<PrsRequest>,
) -> Result<Json<PrsResponse>, (StatusCode, String)> {
    let Some(path) = state.repo_path(&req.repo) else {
        return Err((StatusCode::NOT_FOUND, format!("unknown repository: {}", req.repo)));
    };
    if let Some(prs) = state.cached_prs(&req.repo) {
        return Ok(Json(PrsResponse { prs }));
    }
    if !crate::git::gh_available() {
        return Ok(Json(PrsResponse { prs: Vec::new() }));
    }
    let logger = state.clone();
    let repo = req.repo.clone();
    let prs = tokio::task::spawn_blocking(move || {
        let result = crate::git::list_prs(&path);
        logger.push_log(CommandLogEntry {
            time: epoch_now(),
            repo,
            command: crate::git::pr_command(),
            ok: result.is_ok(),
            message: result.as_ref().err().cloned().unwrap_or_default(),
        });
        result.unwrap_or_default()
    })
    .await
    .unwrap_or_default();
    state.store_prs(&req.repo, prs.clone());
    Ok(Json(PrsResponse { prs }))
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

async fn shutdown(State(state): State<AppState>) -> &'static str {
    let _ = state.shutdown.send(true);
    "shutting down"
}

async fn events(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let stream = BroadcastStream::new(state.updates.subscribe())
        .map(|_| Ok(Event::default().event("update").data("changed")));
    Sse::new(stream).keep_alive(KeepAlive::default())
}
