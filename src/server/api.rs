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

use super::counts::{state_dir, CountCache};
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

/// How far the current multi-repository read has come, streamed to SSE
/// listeners as the `analyzing` event payload.
#[derive(Clone, Debug, Serialize)]
struct AnalyzeProgress {
    /// The repository id (canonical path) being read.
    id: String,
    /// 1-based position of this repository in the read.
    index: usize,
    /// How many repositories the read covers.
    total: usize,
    /// Commits read so far in this repository.
    commits: usize,
    /// The commit count of the previous successful read, when known — the
    /// denominator for an estimated percentage.
    expected: Option<usize>,
}

/// What the server broadcasts to SSE listeners.
#[derive(Clone, Debug)]
enum ServerEvent {
    /// The repository set or contents changed; clients should reload.
    Update,
    /// A (potentially slow) read of a repository is in progress.
    Analyzing(AnalyzeProgress),
    /// The current view read finished; any analyzing indicator can clear.
    Analyzed,
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
    /// Tag names known to exist on each repository's origin, refreshed on
    /// fetch — lets the UI mark pushed tags apart from local-only ones.
    remote_tags: Arc<Mutex<HashMap<String, std::collections::HashSet<String>>>>,
    /// Commit count of each repository's last successful read, the basis
    /// for the estimated analysis percentage. Persisted so the estimate
    /// survives server restarts.
    commit_counts: Arc<CountCache>,
}

impl AppState {
    pub fn new(session: Session) -> Self {
        Self::with_state_dir(session, state_dir().as_deref())
    }

    /// Like [`new`](Self::new) with an explicit state directory (`None`
    /// keeps all persisted state memory-only) — for tests.
    pub fn with_state_dir(session: Session, state: Option<&std::path::Path>) -> Self {
        let (updates, _) = broadcast::channel(16);
        let (shutdown, _) = watch::channel(false);
        Self {
            session: Arc::new(Mutex::new(session)),
            updates,
            shutdown,
            command_log: Arc::new(Mutex::new(VecDeque::new())),
            pr_cache: Arc::new(Mutex::new(HashMap::new())),
            remote_tags: Arc::new(Mutex::new(HashMap::new())),
            commit_counts: Arc::new(CountCache::load(state)),
        }
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

    /// Read every repository view, logging any external commands the read ran
    /// (signature verification) and marking tags known to exist on origin.
    /// Streams per-repository progress to SSE listeners so the UI can show
    /// what is being analyzed while a slow repository loads.
    fn views(&self) -> Vec<RepoView> {
        // Throttled so a huge commit walk does not flood the SSE channel;
        // the start of each repository (commits == 0) always goes out.
        let mut last_sent: Option<Instant> = None;
        let (mut views, executed) = crate::app::read_views(&self.session, |p| {
            if p.commits > 0 && last_sent.is_some_and(|at| at.elapsed() < ANALYZE_THROTTLE) {
                return;
            }
            last_sent = Some(Instant::now());
            let id = p.path.to_string_lossy().into_owned();
            let expected = self.commit_counts.get(&id);
            let _ = self.updates.send(ServerEvent::Analyzing(AnalyzeProgress {
                id,
                index: p.index + 1,
                total: p.total,
                commits: p.commits,
                expected,
            }));
        });
        let _ = self.updates.send(ServerEvent::Analyzed);
        self.commit_counts.update(
            views
                .iter()
                .filter(|view| view.error.is_none())
                .map(|view| (view.id.clone(), view.commits.len())),
        );
        for command in executed {
            self.push_log(CommandLogEntry {
                time: epoch_now(),
                repo: command.repo,
                command: command.command,
                ok: command.ok,
                message: command.message,
            });
        }
        let remote_tags = self.remote_tags.lock().expect("remote tags mutex");
        for view in &mut views {
            let Some(on_origin) = remote_tags.get(&view.id) else {
                continue;
            };
            for r in &mut view.refs {
                if r.kind == "tag" && r.remote.is_none() && on_origin.contains(&r.name) {
                    r.remote = Some("origin".to_string());
                }
            }
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
        .route(
            "/api/repos",
            get(list_repos).post(add_repo).delete(remove_repo),
        )
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
        .route("/api/shutdown", post(shutdown))
        .fallback(assets::static_handler)
        .with_state(state)
}

async fn ping() -> &'static str {
    PING_MARKER
}

/// View reads run gix and (for signed commits) git/gpg subprocesses; keep
/// them off the async workers so the listener stays responsive.
async fn blocking_views(state: &AppState) -> Vec<RepoView> {
    let state = state.clone();
    tokio::task::spawn_blocking(move || state.views())
        .await
        .unwrap_or_default()
}

async fn list_repos(State(state): State<AppState>) -> Json<Vec<RepoView>> {
    Json(blocking_views(&state).await)
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
    let adder = state.clone();
    let result = tokio::task::spawn_blocking(move || {
        adder
            .add_repo(&req.path)
            .map(|(id, added)| (id, added, adder.views()))
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    match result {
        Ok((id, added, repos)) => Ok(Json(AddRepoResponse { id, added, repos })),
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
    Json(blocking_views(&state).await)
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
        return Err((
            StatusCode::NOT_FOUND,
            format!("unknown repository: {}", req.repo),
        ));
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
        return Err((
            StatusCode::NOT_FOUND,
            format!("unknown repository: {}", req.repo),
        ));
    };
    let diffs = tokio::task::spawn_blocking(move || crate::git::read_commit_diff(&repo, &req.id))
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
                // Refresh which tags exist on origin, so the views can mark
                // pushed tags apart from local-only ones.
                if crate::git::has_origin(&path) {
                    let tags = crate::git::remote_tags(&path);
                    logger.push_log(CommandLogEntry {
                        time: epoch_now(),
                        repo: repo.clone(),
                        command: crate::git::remote_tags_command(&path),
                        ok: tags.is_ok(),
                        message: tags.as_ref().err().cloned().unwrap_or_default(),
                    });
                    if let Ok(tags) = tags {
                        logger
                            .remote_tags
                            .lock()
                            .expect("remote tags mutex")
                            .insert(repo.clone(), tags.into_iter().collect());
                    }
                }
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
    let stream = BroadcastStream::new(state.updates.subscribe()).map(|event| {
        Ok(match event {
            // A lagged receiver missed events; a reload resyncs it.
            Ok(ServerEvent::Update) | Err(_) => Event::default().event("update").data("changed"),
            Ok(ServerEvent::Analyzing(progress)) => Event::default()
                .event("analyzing")
                .data(serde_json::to_string(&progress).unwrap_or_default()),
            Ok(ServerEvent::Analyzed) => Event::default().event("analyzed").data("done"),
        })
    });
    Sse::new(stream).keep_alive(KeepAlive::default())
}
