//! HTTP server: REST API, SSE live updates, embedded SPA, and a tiny client used
//! for single-instance detection.

mod api;
mod assets;
mod client;

pub use api::{router, AppState};
pub use client::{get_repo_paths, ping, post_refresh, post_repo, post_shutdown};

use std::net::SocketAddr;

use tokio::net::TcpListener;

/// Marker returned by `GET /api/ping`, used to recognize a running gitreant.
pub const PING_MARKER: &str = "gitreant";

/// Bind the loopback listener for `port` (0 lets the OS choose).
pub async fn bind(port: u16) -> Result<(TcpListener, SocketAddr), String> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = TcpListener::bind(addr)
        .await
        .map_err(|e| format!("bind {addr}: {e}"))?;
    let local = listener.local_addr().map_err(|e| e.to_string())?;
    Ok((listener, local))
}

/// Serve until the process is stopped or a shutdown is requested via
/// `POST /api/shutdown`. Long-lived connections (SSE) would keep a graceful
/// shutdown waiting forever, so after a short grace period we stop regardless.
pub async fn serve(listener: TcpListener, state: AppState) -> Result<(), String> {
    let graceful = state.shutdown_requested();
    let deadline = state.shutdown_requested();
    let server =
        axum::serve(listener, router(state)).with_graceful_shutdown(wait_shutdown(graceful));
    tokio::select! {
        result = server => result.map_err(|e| e.to_string()),
        _ = async move {
            wait_shutdown(deadline).await;
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        } => Ok(()),
    }
}

async fn wait_shutdown(mut rx: tokio::sync::watch::Receiver<bool>) {
    if rx.wait_for(|&stop| stop).await.is_err() {
        std::future::pending::<()>().await;
    }
}
