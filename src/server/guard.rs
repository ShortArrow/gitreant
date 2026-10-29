//! Which requests the server answers (ADR 0038): only those addressed to a
//! loopback name, and, when they change state, only from the server's own
//! page or from a client that is not a page.

use axum::extract::Request;
use axum::http::{header, Method, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

/// The secret every API request carries (ADR 0063): drawn at each start,
/// alive as long as the process.
#[derive(Clone)]
pub struct Secret(std::sync::Arc<str>);

impl Secret {
    /// 32 bytes from the operating system's cryptographic random source, as
    /// 64 hexadecimal digits. Panics when the source fails, so a server
    /// never starts with a weaker secret.
    pub fn generate() -> Self {
        let mut bytes = [0u8; 32];
        getrandom::fill(&mut bytes).expect("the operating system's random source");
        Self(
            bytes
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>()
                .into(),
        )
    }

    /// A secret given outright, for a server whose caller already holds one.
    pub fn from_text(text: &str) -> Self {
        Self(text.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Whether a request to `path` carries `secret` where it must (ADR 0063):
/// in its header, or for the event stream, which a browser opens without
/// headers, also in its `token` query parameter. `/api/ping` and everything
/// outside `/api/` need none.
pub fn carries_secret(path: &str, query: Option<&str>, header: Option<&str>, secret: &str) -> bool {
    if path != "/api" && !path.starts_with("/api/") || path == "/api/ping" {
        return true;
    }
    let in_query = (path == "/api/events")
        .then(|| {
            query?
                .split('&')
                .find_map(|pair| pair.strip_prefix("token="))
        })
        .flatten();
    [header, in_query]
        .into_iter()
        .flatten()
        .any(|offered| same(offered.as_bytes(), secret.as_bytes()))
}

/// The proof that a server holds `secret` (ADR 0064):
/// `HMAC-SHA256(secret, challenge)` in hex, which tells nothing of the
/// secret.
pub fn prove(secret: &str, challenge: &str) -> String {
    use hmac::{Hmac, Mac};
    let mut mac = Hmac::<sha2::Sha256>::new_from_slice(secret.as_bytes())
        .expect("HMAC takes a key of any length");
    mac.update(challenge.as_bytes());
    mac.finalize()
        .into_bytes()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// Whether `answer` proves `secret` for `challenge`, compared in constant
/// time.
pub fn proves(secret: &str, challenge: &str, answer: &str) -> bool {
    same(
        prove(secret, challenge).as_bytes(),
        answer.trim().as_bytes(),
    )
}

/// Equality that takes as long wherever the inputs first differ, so the
/// answer's time tells nothing of the secret.
fn same(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

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

/// Refuse with 403 what [`allowed`] refuses, and with 401 an API request
/// without the server's secret (ADR 0063).
pub async fn guard(port: u16, secret: Secret, request: Request, next: Next) -> Response {
    let headers = request.headers();
    let text = |name| headers.get(name).and_then(|value| value.to_str().ok());
    if !allowed(
        request.method(),
        text(header::HOST),
        text(header::ORIGIN),
        port,
    ) {
        return (StatusCode::FORBIDDEN, "request refused").into_response();
    }
    if !carries_secret(
        request.uri().path(),
        request.uri().query(),
        text(TOKEN_HEADER),
        secret.as_str(),
    ) {
        return (
            StatusCode::UNAUTHORIZED,
            "open gitreant from its command: `gitreant list` prints its address",
        )
            .into_response();
    }
    next.run(request).await
}

/// The header an API request carries the secret in.
const TOKEN_HEADER: header::HeaderName = header::HeaderName::from_static("x-gitreant-token");

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

    const SECRET: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn an_api_request_needs_the_secret() {
        let carries = |path: &str, query: Option<&str>, header: Option<&str>| {
            carries_secret(path, query, header, SECRET)
        };
        assert!(carries("/api/list", None, Some(SECRET)));
        assert!(!carries("/api/list", None, None));
        assert!(!carries("/api/list", None, Some("wrong")));
        assert!(!carries("/api/list", None, Some(&SECRET[1..])));
        // The event stream, which a browser opens without headers.
        let query = format!("token={SECRET}");
        assert!(carries("/api/events", Some(&query), None));
        assert!(!carries("/api/events", Some("token=wrong"), None));
        assert!(
            !carries("/api/list", Some(&query), None),
            "only the stream reads the query"
        );
        // What needs none: telling a gitreant answers, and the page.
        assert!(carries("/api/ping", None, None));
        assert!(carries("/", None, None));
        assert!(carries("/assets/index.js", None, None));
        assert!(!carries("/api", None, None));
    }

    #[test]
    fn the_proof_is_hmac_sha256_of_the_challenge_under_the_secret() {
        // RFC 4231, test case 2.
        assert_eq!(
            prove("Jefe", "what do ya want for nothing?"),
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
        );
        assert!(proves(
            "Jefe",
            "what do ya want for nothing?",
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
        ));
        assert!(!proves("Jefe", "what do ya want for nothing?", "5bdc"));
        assert!(!proves(
            "other",
            "what do ya want for nothing?",
            &prove("Jefe", "what do ya want for nothing?")
        ));
    }

    #[test]
    fn a_secret_is_32_random_bytes_in_hex() {
        let one = Secret::generate();
        let other = Secret::generate();
        assert_eq!(one.as_str().len(), 64);
        assert!(one.as_str().chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(one.as_str(), other.as_str());
    }

    #[test]
    fn a_request_must_address_a_loopback_name() {
        for host in [
            "127.0.0.1:4000",
            "localhost:4000",
            "LOCALHOST",
            "[::1]:4000",
            "127.0.0.1",
        ] {
            assert!(allowed(&Method::GET, Some(host), None, 4000), "{host}");
        }
        for host in [
            "attacker.example:4000",
            "127.0.0.1.attacker.example",
            "[::2]:4000",
            "",
        ] {
            assert!(!allowed(&Method::GET, Some(host), None, 4000), "{host}");
        }
        assert!(!allowed(&Method::GET, None, None, 4000));
    }

    #[test]
    fn a_state_change_must_come_from_the_server_s_own_origin_if_any() {
        let post =
            |origin: Option<&str>| allowed(&Method::POST, Some("127.0.0.1:4000"), origin, 4000);
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
        assert!(allowed(
            &Method::GET,
            Some("127.0.0.1:4000"),
            Some("http://attacker.example"),
            4000
        ));
    }
}
