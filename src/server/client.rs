//! Minimal blocking HTTP client for talking to an already-running gitreant on
//! loopback. Deliberately tiny — both ends are our own process on 127.0.0.1.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

use super::PING_MARKER;

/// Liveness checks stay snappy; mutating calls wait for real work.
const PING_TIMEOUT: Duration = Duration::from_secs(5);
/// Adding a repository makes the server re-read every displayed one and
/// verify signatures through git/gpg subprocesses; the first pass over large
/// repositories legitimately takes more than a few seconds.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

/// Is a gitreant server answering on `port`?
pub fn ping(port: u16) -> bool {
    match request(port, None, "GET", "/api/ping", None, PING_TIMEOUT) {
        Ok((200, body)) => body.trim().starts_with(PING_MARKER),
        _ => false,
    }
}

/// Whether the server on `port` proves it holds `token`, the secret its
/// record keeps (ADR 0064): it answers a fresh random challenge with the
/// HMAC only that secret makes.
pub fn proves_secret(port: u16, token: &str) -> bool {
    let mut bytes = [0u8; 16];
    if getrandom::fill(&mut bytes).is_err() {
        return false;
    }
    let challenge: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    let path = format!("/api/ping?challenge={challenge}");
    match request(port, None, "GET", &path, None, PING_TIMEOUT) {
        Ok((200, body)) => {
            let mut lines = body.lines();
            lines
                .next()
                .is_some_and(|marker| marker.trim() == PING_MARKER)
                && lines
                    .next()
                    .is_some_and(|answer| super::guard::proves(token, &challenge, answer))
        }
        _ => false,
    }
}

/// Ask the running server to add the repository at `path`. `token` is the
/// secret its record holds (ADR 0063), as for every call below.
pub fn post_repo(port: u16, token: Option<&str>, path: &str) -> Result<(), String> {
    let body = serde_json::json!({ "path": path }).to_string();
    match request(
        port,
        token,
        "POST",
        "/api/repos",
        Some(&body),
        REQUEST_TIMEOUT,
    )? {
        (200, _) => Ok(()),
        (status, body) => Err(format!("server returned {status}: {body}")),
    }
}

/// Ask the running server to stop itself.
pub fn post_shutdown(port: u16, token: Option<&str>) -> Result<(), String> {
    match request(port, token, "POST", "/api/shutdown", None, REQUEST_TIMEOUT)? {
        (200, _) => Ok(()),
        (status, body) => Err(format!("server returned {status}: {body}")),
    }
}

/// Ask the running server to drop its cached signature verdicts and
/// re-verify (without restarting).
pub fn post_refresh(port: u16, token: Option<&str>) -> Result<(), String> {
    match request(port, token, "POST", "/api/refresh", None, REQUEST_TIMEOUT)? {
        (200, _) => Ok(()),
        (status, body) => Err(format!("server returned {status}: {body}")),
    }
}

/// The repository paths a running server currently displays, so a restart
/// can bring the same set back up.
pub fn get_repo_paths(port: u16, token: Option<&str>) -> Result<Vec<String>, String> {
    Ok(get_repo_list(port, token)?
        .into_iter()
        .filter_map(|e| e.get("path").and_then(|p| p.as_str()).map(str::to_string))
        .collect())
}

/// The entries of a running server's `GET /api/list`, each with its path
/// and how it came (ADR 0039).
pub fn get_repo_list(port: u16, token: Option<&str>) -> Result<Vec<serde_json::Value>, String> {
    match request(port, token, "GET", "/api/list", None, REQUEST_TIMEOUT)? {
        (200, body) => serde_json::from_str(&body).map_err(|e| format!("parse repo list: {e}")),
        (status, body) => Err(format!("server returned {status}: {body}")),
    }
}

fn request(
    port: u16,
    token: Option<&str>,
    method: &str,
    path: &str,
    body: Option<&str>,
    read_timeout: Duration,
) -> Result<(u16, String), String> {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).map_err(|e| e.to_string())?;
    stream
        .set_read_timeout(Some(read_timeout))
        .map_err(|e| e.to_string())?;

    let body = body.unwrap_or("");
    let secret = token
        .map(|token| format!("X-Gitreant-Token: {token}\r\n"))
        .unwrap_or_default();
    let request = format!(
        "{method} {path} HTTP/1.1\r\n\
         Host: 127.0.0.1\r\n\
         {secret}\
         Content-Type: application/json\r\n\
         Content-Length: {len}\r\n\
         Connection: close\r\n\r\n\
         {body}",
        len = body.len(),
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|e| e.to_string())?;

    let mut raw = String::new();
    stream.read_to_string(&mut raw).map_err(|e| e.to_string())?;

    parse_response(&raw)
}

fn parse_response(raw: &str) -> Result<(u16, String), String> {
    let status = raw
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse::<u16>().ok())
        .ok_or_else(|| "malformed response status line".to_string())?;
    let body = raw
        .split_once("\r\n\r\n")
        .map(|(_, b)| b.to_string())
        .unwrap_or_default();
    Ok((status, body))
}
