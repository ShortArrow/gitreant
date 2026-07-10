//! Integration test for the HTTP server: ping, add-repo, dedupe, error handling,
//! and SPA fallback, driven through the real loopback socket.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::Path;
use std::process::Command;

use gitreant::app::Session;
use gitreant::server::{bind, ping, post_repo, post_shutdown, serve, AppState};

fn init_repo_with_commit(dir: &Path) {
    let run = |args: &[&str]| {
        let status = Command::new("git")
            .current_dir(dir)
            .args(args)
            .env("GIT_AUTHOR_NAME", "T")
            .env("GIT_AUTHOR_EMAIL", "t@e.com")
            .env("GIT_COMMITTER_NAME", "T")
            .env("GIT_COMMITTER_EMAIL", "t@e.com")
            .status()
            .unwrap();
        assert!(status.success(), "git {args:?} failed");
    };
    run(&["init", "-q", "-b", "main"]);
    run(&["config", "commit.gpgsign", "false"]);
    run(&["commit", "--allow-empty", "-m", "root"]);
}

fn http_get(port: u16, path: &str) -> String {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    write!(
        stream,
        "GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"
    )
    .unwrap();
    let mut resp = String::new();
    stream.read_to_string(&mut resp).unwrap();
    resp
}

fn http_post_json(port: u16, path: &str, body: &str) -> String {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    write!(
        stream,
        "POST {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\ncontent-type: application/json\r\ncontent-length: {}\r\n\r\n{body}",
        body.len()
    )
    .unwrap();
    let mut resp = String::new();
    stream.read_to_string(&mut resp).unwrap();
    resp
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn ping_add_dedupe_and_serve_spa() {
    let tmp = tempfile::tempdir().unwrap();
    init_repo_with_commit(tmp.path());
    let repo_path = tmp.path().to_string_lossy().into_owned();

    let (listener, addr) = bind(0).await.unwrap();
    let port = addr.port();
    tokio::spawn(async move {
        serve(listener, AppState::new(Session::new())).await.unwrap();
    });

    // Wait until the server answers.
    let up = tokio::task::spawn_blocking(move || {
        for _ in 0..50 {
            if ping(port) {
                return true;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        false
    })
    .await
    .unwrap();
    assert!(up, "server did not come up");

    // Adding a valid repo succeeds; adding it again is a no-op (dedupe).
    let p = repo_path.clone();
    tokio::task::spawn_blocking(move || post_repo(port, &p))
        .await
        .unwrap()
        .expect("first add");
    let p = repo_path.clone();
    tokio::task::spawn_blocking(move || post_repo(port, &p))
        .await
        .unwrap()
        .expect("second add (dedupe)");

    // The repo now shows up in the API, exactly once.
    let repos_body = tokio::task::spawn_blocking(move || http_get(port, "/api/repos"))
        .await
        .unwrap();
    assert!(repos_body.contains("\"root\""), "commit summary missing: {repos_body}");
    assert_eq!(
        repos_body.matches("\"lane_count\"").count(),
        1,
        "expected exactly one repo (dedupe)"
    );

    // Adding a non-repository path is rejected with 400.
    let bad = tempfile::tempdir().unwrap();
    let bad_path = bad.path().to_string_lossy().into_owned();
    let err = tokio::task::spawn_blocking(move || post_repo(port, &bad_path))
        .await
        .unwrap();
    assert!(err.is_err(), "expected error for non-repo path");

    // Unknown routes fall back to the SPA index.
    let spa = tokio::task::spawn_blocking(move || http_get(port, "/some/client/route"))
        .await
        .unwrap();
    assert!(spa.contains("<!doctype html"), "SPA fallback missing: {spa}");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn commit_endpoint_returns_detail() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path();
    init_repo_with_commit(dir);
    std::fs::write(dir.join("notes.txt"), "hello\n").unwrap();
    let run = |args: &[&str]| {
        let status = Command::new("git")
            .current_dir(dir)
            .args(args)
            .env("GIT_AUTHOR_NAME", "T")
            .env("GIT_AUTHOR_EMAIL", "t@e.com")
            .env("GIT_COMMITTER_NAME", "T")
            .env("GIT_COMMITTER_EMAIL", "t@e.com")
            .status()
            .unwrap();
        assert!(status.success(), "git {args:?} failed");
    };
    run(&["add", "notes.txt"]);
    run(&["commit", "-q", "-m", "add notes\n\nWhy the notes exist."]);

    let (listener, addr) = bind(0).await.unwrap();
    let port = addr.port();
    tokio::spawn(async move {
        serve(listener, AppState::new(Session::new())).await.unwrap();
    });
    let up = tokio::task::spawn_blocking(move || {
        for _ in 0..50 {
            if ping(port) {
                return true;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        false
    })
    .await
    .unwrap();
    assert!(up, "server did not come up");

    let repo_path = dir.to_string_lossy().into_owned();
    let p = repo_path.clone();
    tokio::task::spawn_blocking(move || post_repo(port, &p))
        .await
        .unwrap()
        .expect("add repo");

    // The id the server assigned is the same canonical path Session computes.
    let repo_id = Session::new().add(dir).unwrap().0;
    let head = gitreant::git::read_repo(dir).unwrap().commits[0].id.clone();

    // `{:?}` escapes backslashes/quotes the same way JSON does for ASCII paths.
    let request = format!("{{\"repo\": {repo_id:?}, \"id\": {head:?}}}");
    let resp = tokio::task::spawn_blocking(move || http_post_json(port, "/api/commit", &request))
        .await
        .unwrap();
    assert!(resp.contains("200 OK"), "response: {resp}");
    assert!(resp.contains("Why the notes exist."), "body missing: {resp}");
    assert!(resp.contains("notes.txt"), "files missing: {resp}");
    assert!(resp.contains("\"additions\":1"), "line counts missing: {resp}");

    // Unknown repository or commit -> 404.
    let bad_repo = format!("{{\"repo\": \"/nowhere\", \"id\": {head:?}}}");
    let resp = tokio::task::spawn_blocking(move || http_post_json(port, "/api/commit", &bad_repo))
        .await
        .unwrap();
    assert!(resp.contains("404"), "expected 404 for unknown repo: {resp}");

    let bad_commit = format!(
        "{{\"repo\": {repo_id:?}, \"id\": \"0000000000000000000000000000000000000000\"}}"
    );
    let resp =
        tokio::task::spawn_blocking(move || http_post_json(port, "/api/commit", &bad_commit))
            .await
            .unwrap();
    assert!(resp.contains("404"), "expected 404 for unknown commit: {resp}");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn shutdown_endpoint_stops_the_server() {
    let (listener, addr) = bind(0).await.unwrap();
    let port = addr.port();
    let server = tokio::spawn(serve(listener, AppState::new(Session::new())));

    let up = tokio::task::spawn_blocking(move || {
        for _ in 0..50 {
            if ping(port) {
                return true;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        false
    })
    .await
    .unwrap();
    assert!(up, "server did not come up");

    tokio::task::spawn_blocking(move || post_shutdown(port))
        .await
        .unwrap()
        .expect("shutdown request");

    let result = tokio::time::timeout(std::time::Duration::from_secs(5), server)
        .await
        .expect("server did not stop after shutdown request")
        .unwrap();
    assert!(result.is_ok(), "serve returned an error: {result:?}");
}
