//! Minimal blocking HTTP client for talking to an already-running gitreant on
//! loopback. Deliberately tiny — both ends are our own process on 127.0.0.1.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

use super::PING_MARKER;

/// Is a gitreant server answering on `port`?
pub fn ping(port: u16) -> bool {
    match request(port, "GET", "/api/ping", None) {
        Ok((200, body)) => body.trim().starts_with(PING_MARKER),
        _ => false,
    }
}

/// Ask the running server to add the repository at `path`.
pub fn post_repo(port: u16, path: &str) -> Result<(), String> {
    let body = serde_json::json!({ "path": path }).to_string();
    match request(port, "POST", "/api/repos", Some(&body))? {
        (200, _) => Ok(()),
        (status, body) => Err(format!("server returned {status}: {body}")),
    }
}

fn request(
    port: u16,
    method: &str,
    path: &str,
    body: Option<&str>,
) -> Result<(u16, String), String> {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).map_err(|e| e.to_string())?;
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(|e| e.to_string())?;

    let body = body.unwrap_or("");
    let request = format!(
        "{method} {path} HTTP/1.1\r\n\
         Host: 127.0.0.1\r\n\
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
    stream
        .read_to_string(&mut raw)
        .map_err(|e| e.to_string())?;

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
