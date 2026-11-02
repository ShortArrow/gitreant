//! Serve the embedded SPA at `/`, falling back to `index.html` for
//! client-side routes, and open it with the secret a launcher file posts
//! (ADR 0076).

use axum::extract::State;
use axum::http::{header, HeaderName, HeaderValue, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::Form;
use rust_embed::RustEmbed;
use serde::Deserialize;

use super::AppState;

#[derive(RustEmbed)]
#[folder = "frontend/dist"]
struct Assets;

pub async fn static_handler(uri: Uri) -> Response {
    match uri.path().trim_start_matches('/') {
        "" | "index.html" => page_response(None),
        file => serve(file).unwrap_or_else(|| page_response(None)),
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

/// `index.html`, with `secret` written into it when given, never kept, and
/// clearing what the browser cached for this origin, such as responses
/// another program left there.
fn page_response(secret: Option<&str>) -> Response {
    let Some(file) = Assets::get("index.html") else {
        return (StatusCode::NOT_FOUND, "not found").into_response();
    };
    let html = String::from_utf8_lossy(&file.data);
    let html = match secret {
        Some(secret) => with_secret(&html, secret),
        None => html.into_owned(),
    };
    let mut response = ([(header::CONTENT_TYPE, "text/html; charset=utf-8")], html).into_response();
    let headers = response.headers_mut();
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(
        HeaderName::from_static("clear-site-data"),
        HeaderValue::from_static("\"cache\""),
    );
    response
}

/// `html` with `secret` in the meta tag the page reads it from.
fn with_secret(html: &str, secret: &str) -> String {
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
    fn the_secret_goes_into_the_page_s_head() {
        assert_eq!(
            with_secret(
                "<!doctype html><html><head><title>t</title></head>",
                "5ec2e7"
            ),
            format!("<!doctype html><html><head>{META}<title>t</title></head>")
        );
        assert_eq!(with_secret("<p>x</p>", "5ec2e7"), format!("{META}<p>x</p>"));
    }

    #[test]
    fn only_the_page_clears_the_cache() {
        let clears = |response: &Response| response.headers().contains_key("clear-site-data");
        assert!(clears(&page_response(None)));
        assert!(clears(&page_response(Some("5ec2e7"))));
        assert!(!clears(&serve("index.html").unwrap()));
    }
}
