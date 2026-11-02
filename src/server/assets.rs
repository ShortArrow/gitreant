//! Serve the embedded SPA at `/`, falling back to `index.html` for
//! client-side routes, and open it with the secret a launcher file posts
//! (ADR 0076).

use axum::extract::State;
use axum::http::{header, HeaderValue, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::Form;
use rust_embed::RustEmbed;
use serde::Deserialize;

use super::AppState;

#[derive(RustEmbed)]
#[folder = "frontend/dist"]
struct Assets;

pub async fn static_handler(uri: Uri) -> Response {
    match file_of(uri.path()) {
        None => page_response(None),
        Some(file) => serve(file).unwrap_or_else(|| page_response(None)),
    }
}

/// What a launcher file posts to open the page.
#[derive(Deserialize)]
pub struct Handoff {
    token: String,
}

/// The page with the server's secret written into it, when the posted one
/// matches; nothing of the page otherwise.
pub async fn open_page(State(state): State<AppState>, Form(handoff): Form<Handoff>) -> Response {
    let secret = state.secret().as_str();
    if !super::guard::matches(secret, &handoff.token) {
        return (
            StatusCode::FORBIDDEN,
            "the secret posted is not this server's",
        )
            .into_response();
    }
    page_response(Some(secret))
}

/// The file a request's path names; none for the page itself.
fn file_of(path: &str) -> Option<&str> {
    Some(path.trim_start_matches('/')).filter(|file| !file.is_empty() && *file != "index.html")
}

/// `index.html` with `secret` written into it when given, never kept.
fn page_response(secret: Option<&str>) -> Response {
    let Some(file) = Assets::get("index.html") else {
        return (StatusCode::NOT_FOUND, "not found").into_response();
    };
    let html = into_page(&String::from_utf8_lossy(&file.data), secret);
    let mut response = ([(header::CONTENT_TYPE, "text/html; charset=utf-8")], html).into_response();
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

/// `html` with `secret` in the meta tag the page reads it from, when given.
fn into_page(html: &str, secret: Option<&str>) -> String {
    let Some(secret) = secret else {
        return html.to_string();
    };
    let meta = format!("<meta name=\"gitreant-secret\" content=\"{secret}\">");
    match html.find("<head>") {
        Some(at) => {
            let end = at + "<head>".len();
            format!("{}{meta}{}", &html[..end], &html[end..])
        }
        None => format!("{meta}{html}"),
    }
}

fn serve(path: &str) -> Option<Response> {
    let file = Assets::get(path)?;
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    Some(
        (
            [(header::CONTENT_TYPE, mime.as_ref())],
            file.data.into_owned(),
        )
            .into_response(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const META: &str = "<meta name=\"gitreant-secret\" content=\"5ec2e7\">";

    #[test]
    fn the_page_holds_the_secret_posted() {
        let html = "<!doctype html><html><head><title>t</title></head>";
        assert_eq!(
            into_page(html, Some("5ec2e7")),
            format!("<!doctype html><html><head>{META}<title>t</title></head>")
        );
        assert_eq!(into_page(html, None), html);
        assert_eq!(
            into_page("<p>x</p>", Some("5ec2e7")),
            format!("{META}<p>x</p>")
        );
    }

    #[test]
    fn a_file_is_found_at_the_root() {
        assert_eq!(file_of("/assets/index.js"), Some("assets/index.js"));
        assert_eq!(file_of("/favicon.svg"), Some("favicon.svg"));
        for page in ["/", "/index.html"] {
            assert_eq!(file_of(page), None, "{page}");
        }
    }

    #[test]
    fn the_page_is_never_kept_and_leaves_the_browser_s_cache_alone() {
        for response in [page_response(None), page_response(Some("5ec2e7"))] {
            assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
            assert!(!response.headers().contains_key("clear-site-data"));
        }
    }
}
