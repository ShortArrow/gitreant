//! Serve the embedded SPA at `/`, falling back to `index.html` for
//! client-side routes, and open it with the secret a launcher file posts
//! (ADR 0076). The page loads its own files from a path of this start,
//! which no program that held the port before could have cached.

use axum::extract::State;
use axum::http::{header, HeaderName, HeaderValue, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::Form;
use rust_embed::RustEmbed;
use serde::Deserialize;

use super::guard::page_path;
use super::AppState;

#[derive(RustEmbed)]
#[folder = "frontend/dist"]
struct Assets;

pub async fn static_handler(State(state): State<AppState>, uri: Uri) -> Response {
    let page = page_path(state.secret().as_str());
    match file_of(uri.path(), &page) {
        None => page_response(&page, None),
        Some(file) => serve(file).unwrap_or_else(|| page_response(&page, None)),
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
    page_response(&page_path(secret), Some(secret))
}

/// The file a request's path names, under this start's path `page` or at
/// the root; none for the page itself.
fn file_of<'a>(path: &'a str, page: &str) -> Option<&'a str> {
    let path = path.trim_start_matches('/');
    let file = path
        .strip_prefix(page)
        .and_then(|rest| rest.strip_prefix('/'))
        .unwrap_or(path);
    Some(file).filter(|file| !file.is_empty() && *file != "index.html")
}

/// `index.html` loading its files from this start's path `page`, with
/// `secret` written into it when given, never kept, and clearing what the
/// browser cached for this origin, such as responses another program left
/// there.
fn page_response(page: &str, secret: Option<&str>) -> Response {
    let Some(file) = Assets::get("index.html") else {
        return (StatusCode::NOT_FOUND, "not found").into_response();
    };
    let html = into_page(&String::from_utf8_lossy(&file.data), page, secret);
    let mut response = ([(header::CONTENT_TYPE, "text/html; charset=utf-8")], html).into_response();
    let headers = response.headers_mut();
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(
        HeaderName::from_static("clear-site-data"),
        HeaderValue::from_static("\"cache\""),
    );
    response
}

/// `html` with a base at this start's path `page`, which its relative file
/// addresses resolve against, and `secret` in the meta tag the page reads
/// it from.
fn into_page(html: &str, page: &str, secret: Option<&str>) -> String {
    let base = format!("<base href=\"/{page}/\">");
    let meta = secret
        .map(|secret| format!("<meta name=\"gitreant-secret\" content=\"{secret}\">"))
        .unwrap_or_default();
    match html.find("<head>") {
        Some(at) => {
            let end = at + "<head>".len();
            format!("{}{base}{meta}{}", &html[..end], &html[end..])
        }
        None => format!("{base}{meta}{html}"),
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

    const PAGE: &str = "0123456789abcdef0123456789abcdef";
    const BASE: &str = "<base href=\"/0123456789abcdef0123456789abcdef/\">";
    const META: &str = "<meta name=\"gitreant-secret\" content=\"5ec2e7\">";

    #[test]
    fn the_page_loads_its_files_from_this_start_s_path_and_holds_the_secret_posted() {
        let html = "<!doctype html><html><head><title>t</title></head>";
        assert_eq!(
            into_page(html, PAGE, Some("5ec2e7")),
            format!("<!doctype html><html><head>{BASE}{META}<title>t</title></head>")
        );
        assert_eq!(
            into_page(html, PAGE, None),
            format!("<!doctype html><html><head>{BASE}<title>t</title></head>")
        );
        assert_eq!(
            into_page("<p>x</p>", PAGE, Some("5ec2e7")),
            format!("{BASE}{META}<p>x</p>")
        );
    }

    #[test]
    fn a_file_is_found_under_this_start_s_path_or_at_the_root() {
        assert_eq!(
            file_of(&format!("/{PAGE}/assets/index.js"), PAGE),
            Some("assets/index.js")
        );
        assert_eq!(file_of("/assets/index.js", PAGE), Some("assets/index.js"));
        assert_eq!(file_of("/favicon.svg", PAGE), Some("favicon.svg"));
        for page in ["/", "/index.html", &format!("/{PAGE}/")] {
            assert_eq!(file_of(page, PAGE), None, "{page}");
        }
    }

    #[test]
    fn only_the_page_clears_the_cache() {
        let clears = |response: &Response| response.headers().contains_key("clear-site-data");
        assert!(clears(&page_response(PAGE, None)));
        assert!(clears(&page_response(PAGE, Some("5ec2e7"))));
        assert!(!clears(&serve("index.html").unwrap()));
    }
}
