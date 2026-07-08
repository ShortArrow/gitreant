//! REST + SSE handlers and shared state.

use std::convert::Infallible;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::routing::get;
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
    /// listeners on a successful, non-duplicate add.
    fn add_repo(&self, path: &str) -> Result<bool, String> {
        let added = self
            .session
            .lock()
            .expect("session mutex")
            .add(&PathBuf::from(path))?;
        if added {
            let _ = self.updates.send(());
        }
        Ok(added)
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
    added: bool,
    repos: Vec<RepoView>,
}

async fn add_repo(
    State(state): State<AppState>,
    Json(req): Json<AddRepoRequest>,
) -> Result<Json<AddRepoResponse>, (StatusCode, String)> {
    match state.add_repo(&req.path) {
        Ok(added) => Ok(Json(AddRepoResponse {
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

async fn events(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let stream = BroadcastStream::new(state.updates.subscribe())
        .map(|_| Ok(Event::default().event("update").data("changed")));
    Sse::new(stream).keep_alive(KeepAlive::default())
}
