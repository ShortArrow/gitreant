//! HTTP server: REST API, SSE live updates, embedded SPA, and a tiny client used
//! for single-instance detection.

mod api;
mod assets;
mod client;

pub use api::{router, AppState};
pub use client::{ping, post_repo};

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

/// Serve until the process is stopped.
pub async fn serve(listener: TcpListener, state: AppState) -> Result<(), String> {
    axum::serve(listener, router(state))
        .await
        .map_err(|e| e.to_string())
}
