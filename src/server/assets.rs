//! Serve the embedded SPA under a path of this start (ADR 0073), falling back
//! to `index.html` for client-side routes.

use axum::extract::State;
use axum::http::{header, HeaderName, HeaderValue, StatusCode, Uri};
use axum::response::{IntoResponse, Redirect, Response};
use rust_embed::RustEmbed;

use super::guard::page_path;
use super::AppState;

#[derive(RustEmbed)]
#[folder = "frontend/dist"]
struct Assets;

/// Where a request's path lands, given the page's path for this start.
#[derive(Debug, PartialEq)]
enum Place<'a> {
    /// The page itself.
    Page,
    /// A file under the page's path.
    File(&'a str),
    /// Anywhere else, which is sent on to the page.
    Elsewhere,
}

fn place<'a>(path: &'a str, page: &str) -> Place<'a> {
    let Some(rest) = path
        .strip_prefix('/')
        .and_then(|path| path.strip_prefix(page))
        .and_then(|path| path.strip_prefix('/'))
    else {
        return Place::Elsewhere;
    };
    match rest {
        "" | "index.html" => Place::Page,
        file => Place::File(file),
    }
}

pub async fn static_handler(State(state): State<AppState>, uri: Uri) -> Response {
    let page = page_path(state.secret().as_str());
    answer(place(uri.path(), &page), &page)
}

/// The response for a request that lands at `place`, given the page's path.
fn answer(place: Place, page: &str) -> Response {
    match place {
        Place::Page => page_response(),
        Place::File(file) => serve(file).unwrap_or_else(page_response),
        Place::Elsewhere => (
            [(header::CACHE_CONTROL, "no-store")],
            Redirect::to(&format!("/{page}/")),
        )
            .into_response(),
    }
}

/// `index.html`, never kept, and clearing what the browser cached for this
/// origin, such as responses another program left there.
fn page_response() -> Response {
    let Some(mut response) = serve("index.html") else {
        return (StatusCode::NOT_FOUND, "not found").into_response();
    };
    let headers = response.headers_mut();
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(
        HeaderName::from_static("clear-site-data"),
        HeaderValue::from_static("\"cache\""),
    );
    response
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

    #[test]
    fn the_page_and_its_files_live_under_this_start_s_path() {
        assert_eq!(place(&format!("/{PAGE}/"), PAGE), Place::Page);
        assert_eq!(place(&format!("/{PAGE}/index.html"), PAGE), Place::Page);
        assert_eq!(
            place(&format!("/{PAGE}/assets/index.js"), PAGE),
            Place::File("assets/index.js")
        );
    }

    #[test]
    fn any_other_path_is_sent_to_this_start_s_page() {
        let bare = format!("/{PAGE}");
        for path in [
            "/",
            "/index.html",
            "/assets/index.js",
            &bare,
            "/0123/",
            "/x/y",
        ] {
            assert_eq!(place(path, PAGE), Place::Elsewhere, "{path}");
        }
    }
}
