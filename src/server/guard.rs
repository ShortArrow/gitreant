//! Which requests the server answers (ADR 0038): only those addressed to a
//! loopback name, and, when they change state, only from the server's own
//! page or from a client that is not a page.

use axum::extract::Request;
use axum::http::{header, Method, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

/// The names a request may address the server by, port aside.
const LOOPBACK_NAMES: [&str; 3] = ["127.0.0.1", "localhost", "[::1]"];

/// Whether a request with this method, `Host` and `Origin` may reach the
/// server listening on `port`.
pub fn allowed(method: &Method, host: Option<&str>, origin: Option<&str>, port: u16) -> bool {
    if !host.is_some_and(|host| is_loopback(name_of(host))) {
        return false;
    }
    if method == Method::GET || method == Method::HEAD {
        return true;
    }
    origin.is_none_or(|origin| is_own_origin(origin, port))
}

/// Refuse with 403 what [`allowed`] refuses.
pub async fn guard(port: u16, request: Request, next: Next) -> Response {
    let headers = request.headers();
    let text = |name| headers.get(name).and_then(|value| value.to_str().ok());
    if allowed(request.method(), text(header::HOST), text(header::ORIGIN), port) {
        next.run(request).await
    } else {
        (StatusCode::FORBIDDEN, "request refused").into_response()
    }
}

fn is_own_origin(origin: &str, port: u16) -> bool {
    let Some(authority) = origin.strip_prefix("http://") else {
        return false;
    };
    let name = name_of(authority);
    is_loopback(name) && authority[name.len()..] == format!(":{port}")
}

/// The host name of an authority (`host[:port]`), brackets kept for IPv6.
fn name_of(authority: &str) -> &str {
    if authority.starts_with('[') {
        return authority
            .find(']')
            .map_or(authority, |end| &authority[..=end]);
    }
    authority.split(':').next().unwrap_or(authority)
}

fn is_loopback(name: &str) -> bool {
    LOOPBACK_NAMES
        .iter()
        .any(|loopback| loopback.eq_ignore_ascii_case(name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_request_must_address_a_loopback_name() {
        for host in ["127.0.0.1:4000", "localhost:4000", "LOCALHOST", "[::1]:4000", "127.0.0.1"] {
            assert!(allowed(&Method::GET, Some(host), None, 4000), "{host}");
        }
        for host in ["attacker.example:4000", "127.0.0.1.attacker.example", "[::2]:4000", ""] {
            assert!(!allowed(&Method::GET, Some(host), None, 4000), "{host}");
        }
        assert!(!allowed(&Method::GET, None, None, 4000));
    }

    #[test]
    fn a_state_change_must_come_from_the_server_s_own_origin_if_any() {
        let post = |origin: Option<&str>| allowed(&Method::POST, Some("127.0.0.1:4000"), origin, 4000);
        assert!(post(None), "a client without a page passes");
        assert!(post(Some("http://127.0.0.1:4000")));
        assert!(post(Some("http://localhost:4000")));
        assert!(post(Some("http://[::1]:4000")));
        for origin in [
            "http://attacker.example",
            "http://127.0.0.1:4001",
            "http://127.0.0.1",
            "https://127.0.0.1:4000",
            "http://127.0.0.1:40000",
            "null",
        ] {
            assert!(!post(Some(origin)), "{origin}");
        }
        // Reads are not state changes.
        assert!(allowed(&Method::GET, Some("127.0.0.1:4000"), Some("http://attacker.example"), 4000));
    }
}
