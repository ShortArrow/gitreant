//! REST + SSE handlers and shared state.

use std::convert::Infallible;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::{Stream, StreamExt};

use crate::app::{RepoView, Session};

use super::{assets, PING_MARKER};

/// Shared, cloneable server state.
#[derive(Clone)]
pub struct AppState {
    session: Arc<Mutex<Session>>,
    updates: broadcast::Sender<()>,
}

impl AppState {
    pub fn new(session: Session) -> Self {
        let (updates, _) = broadcast::channel(16);
        Self {
            session: Arc::new(Mutex::new(session)),
            updates,
        }
    }

    fn views(&self) -> Vec<RepoView> {
        self.session.lock().expect("session mutex").views()
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
}

/// Build the application router.
pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/ping", get(ping))
        .route(
            "/api/repos",
            get(list_repos).post(add_repo).delete(remove_repo),
        )
        .route("/api/events", get(events))
        .route("/api/pick", post(pick_folder))
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

async fn events(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let stream = BroadcastStream::new(state.updates.subscribe())
        .map(|_| Ok(Event::default().event("update").data("changed")));
    Sse::new(stream).keep_alive(KeepAlive::default())
}
