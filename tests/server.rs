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
    // Repo-local identity: server-side merges create commits and CI runners
    // have no global git config.
    run(&["config", "user.name", "T"]);
    run(&["config", "user.email", "t@e.com"]);
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
    http_request_json(port, "POST", path, body)
}

fn http_request_json(port: u16, method: &str, path: &str, body: &str) -> String {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    write!(
        stream,
        "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\ncontent-type: application/json\r\ncontent-length: {}\r\n\r\n{body}",
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
        serve(listener, AppState::new(Session::new()))
            .await
            .unwrap();
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
    assert!(
        repos_body.contains("\"root\""),
        "commit summary missing: {repos_body}"
    );
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
    assert!(
        spa.contains("<!doctype html"),
        "SPA fallback missing: {spa}"
    );
}

/// The SSE contract the SPA's analyzing indicator relies on: each
/// repository read streams `analyzing` events whose JSON payload names
/// the repo and its running commit counter, then an `analyzed` event
/// carrying the repository id (ADR 0023).
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn analyzing_progress_streams_over_sse() {
    let tmp = tempfile::tempdir().unwrap();
    init_repo_with_commit(tmp.path());

    let (listener, addr) = bind(0).await.unwrap();
    let port = addr.port();
    let mut session = Session::new();
    session.add(tmp.path()).unwrap();
    tokio::spawn(async move {
        serve(listener, AppState::new(session)).await.unwrap();
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

    let stream_text = tokio::task::spawn_blocking(move || {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        stream
            .set_read_timeout(Some(std::time::Duration::from_millis(200)))
            .unwrap();
        write!(
            stream,
            "GET /api/events HTTP/1.1\r\nHost: 127.0.0.1\r\nAccept: text/event-stream\r\n\r\n"
        )
        .unwrap();
        // Give the subscription a moment to register before triggering
        // the reads whose progress it must observe.
        std::thread::sleep(std::time::Duration::from_millis(300));
        http_get(port, "/api/repos");
        http_get(port, "/api/repos");

        let mut buf = Vec::new();
        let mut chunk = [0u8; 4096];
        let start = std::time::Instant::now();
        while start.elapsed() < std::time::Duration::from_secs(10) {
            match stream.read(&mut chunk) {
                Ok(0) => break,
                Ok(n) => buf.extend_from_slice(&chunk[..n]),
                Err(_) => {}
            }
            if String::from_utf8_lossy(&buf)
                .matches("event: analyzed")
                .count()
                >= 2
            {
                break;
            }
        }
        String::from_utf8_lossy(&buf).into_owned()
    })
    .await
    .unwrap();

    let payload = |segment: &str| -> serde_json::Value {
        let start = segment
            .find("event: analyzing")
            .unwrap_or_else(|| panic!("no analyzing event in {segment:?}"));
        let data = segment[start..]
            .lines()
            .find_map(|line| line.strip_prefix("data: "))
            .expect("analyzing data line");
        serde_json::from_str(data).expect("analyzing payload is JSON")
    };

    let reads: Vec<&str> = stream_text.split("event: analyzed").collect();
    assert!(reads.len() >= 3, "expected two reads in {stream_text:?}");
    let first = payload(reads[0]);
    let id = first["id"].as_str().unwrap_or_default().to_string();
    assert!(!id.is_empty());
    assert_eq!(first["commits"], 0);

    // The analyzed terminator names the repository whose read finished.
    let after = &stream_text[stream_text.find("event: analyzed").unwrap()..];
    let done = after
        .lines()
        .find_map(|line| line.strip_prefix("data: "))
        .expect("analyzed data line");
    assert_eq!(done, id);
}

/// The instant repository list answers without reading any graph, and a
/// single repository's view comes from POST /api/view (ADR 0023).
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn list_and_per_repo_view_endpoints() {
    let tmp = tempfile::tempdir().unwrap();
    init_repo_with_commit(tmp.path());

    let (listener, addr) = bind(0).await.unwrap();
    let port = addr.port();
    let mut session = Session::new();
    session.add(tmp.path()).unwrap();
    tokio::spawn(async move {
        serve(listener, AppState::new(session)).await.unwrap();
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

    tokio::task::spawn_blocking(move || {
        // The list carries ids/names/paths only — no commits.
        let list = http_get(port, "/api/list");
        let entries: serde_json::Value = serde_json::from_str(
            list.lines()
                .find(|line| line.starts_with('['))
                .expect("list body"),
        )
        .expect("list JSON");
        let id = entries[0]["id"].as_str().expect("repo id").to_string();
        assert!(!entries[0]["name"].as_str().unwrap_or_default().is_empty());
        assert!(
            !list.contains("\"commits\""),
            "list must stay light: {list}"
        );

        // The per-repository view has the graph.
        let body = serde_json::json!({ "repo": id }).to_string();
        let view = http_post_json(port, "/api/view", &body);
        assert!(view.contains("\"root\""), "commit summary missing: {view}");
        assert!(view.contains("\"lane_count\""), "layout missing: {view}");

        // An unknown repository is a 404.
        let missing = serde_json::json!({ "repo": "/nowhere" }).to_string();
        let response = http_post_json(port, "/api/view", &missing);
        assert!(
            response.starts_with("HTTP/1.1 404"),
            "expected 404: {response}"
        );
    })
    .await
    .unwrap();
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
        serve(listener, AppState::new(Session::new()))
            .await
            .unwrap();
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
    assert!(
        resp.contains("Why the notes exist."),
        "body missing: {resp}"
    );
    assert!(resp.contains("notes.txt"), "files missing: {resp}");
    assert!(
        resp.contains("\"additions\":1"),
        "line counts missing: {resp}"
    );

    // Unknown repository or commit -> 404.
    let bad_repo = format!("{{\"repo\": \"/nowhere\", \"id\": {head:?}}}");
    let resp = tokio::task::spawn_blocking(move || http_post_json(port, "/api/commit", &bad_repo))
        .await
        .unwrap();
    assert!(
        resp.contains("404"),
        "expected 404 for unknown repo: {resp}"
    );

    let bad_commit =
        format!("{{\"repo\": {repo_id:?}, \"id\": \"0000000000000000000000000000000000000000\"}}");
    let resp =
        tokio::task::spawn_blocking(move || http_post_json(port, "/api/commit", &bad_commit))
            .await
            .unwrap();
    assert!(
        resp.contains("404"),
        "expected 404 for unknown commit: {resp}"
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn diff_endpoint_returns_unified_hunks() {
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
    run(&["commit", "-q", "-m", "add notes"]);

    let (listener, addr) = bind(0).await.unwrap();
    let port = addr.port();
    tokio::spawn(async move {
        serve(listener, AppState::new(Session::new()))
            .await
            .unwrap();
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
    tokio::task::spawn_blocking(move || post_repo(port, &repo_path))
        .await
        .unwrap()
        .expect("add repo");

    let repo_id = Session::new().add(dir).unwrap().0;
    let head = gitreant::git::read_repo(dir).unwrap().commits[0].id.clone();

    let request = format!("{{\"repo\": {repo_id:?}, \"id\": {head:?}, \"path\": \"notes.txt\"}}");
    let resp = tokio::task::spawn_blocking(move || http_post_json(port, "/api/diff", &request))
        .await
        .unwrap();
    assert!(resp.contains("200 OK"), "response: {resp}");
    assert!(resp.contains("+hello"), "added line missing: {resp}");
    assert!(resp.contains("\"status\":\"A\""), "status missing: {resp}");

    // A path the commit does not touch -> 404.
    let bad = format!("{{\"repo\": {repo_id:?}, \"id\": {head:?}, \"path\": \"nope.txt\"}}");
    let resp = tokio::task::spawn_blocking(move || http_post_json(port, "/api/diff", &bad))
        .await
        .unwrap();
    assert!(
        resp.contains("404"),
        "expected 404 for unknown path: {resp}"
    );

    // The whole-commit diff returns every changed file with its hunks.
    let request = format!("{{\"repo\": {repo_id:?}, \"id\": {head:?}}}");
    let resp =
        tokio::task::spawn_blocking(move || http_post_json(port, "/api/commit-diff", &request))
            .await
            .unwrap();
    assert!(resp.contains("200 OK"), "response: {resp}");
    assert!(resp.contains("notes.txt"), "file missing: {resp}");
    assert!(resp.contains("+hello"), "hunk missing: {resp}");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn fetch_endpoint_updates_remote_refs() {
    // A local "origin" and a clone of it: fetch works offline via the file
    // transport, exactly like a network remote would.
    let tmp = tempfile::tempdir().unwrap();
    let origin = tmp.path().join("origin");
    std::fs::create_dir(&origin).unwrap();
    init_repo_with_commit(&origin);
    let run = |dir: &Path, args: &[&str]| {
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
    // A tag that exists on the origin, and one created only in the clone:
    // after a fetch the views must tell them apart.
    run(&origin, &["tag", "vremote"]);
    run(tmp.path(), &["clone", "-q", "origin", "clone"]);
    let clone = tmp.path().join("clone");
    run(&clone, &["tag", "vlocal"]);

    let (listener, addr) = bind(0).await.unwrap();
    let port = addr.port();
    tokio::spawn(async move {
        serve(listener, AppState::new(Session::new()))
            .await
            .unwrap();
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

    let clone_path = clone.to_string_lossy().into_owned();
    tokio::task::spawn_blocking(move || post_repo(port, &clone_path))
        .await
        .unwrap()
        .expect("add clone");

    // A commit lands on the origin after the clone.
    run(
        &origin,
        &["commit", "--allow-empty", "-q", "-m", "after-clone"],
    );
    let before = tokio::task::spawn_blocking(move || http_get(port, "/api/repos"))
        .await
        .unwrap();
    assert!(
        !before.contains("after-clone"),
        "must not appear before fetch"
    );

    let resp = tokio::task::spawn_blocking(move || http_post_json(port, "/api/fetch", "{}"))
        .await
        .unwrap();
    assert!(resp.contains("200 OK"), "response: {resp}");
    assert!(resp.contains("\"errors\":[]"), "expected no errors: {resp}");

    // The new commit is now reachable via the updated remote-tracking ref.
    let after = tokio::task::spawn_blocking(move || http_get(port, "/api/repos"))
        .await
        .unwrap();
    assert!(
        after.contains("after-clone"),
        "fetched commit missing: {after}"
    );

    // Tags known on the origin carry the remote marker; local-only ones
    // not. Inspect each ref object up to its closing brace.
    let ref_entry = |name: &str| {
        after
            .split(&format!("\"name\":\"{name}\""))
            .nth(1)
            .and_then(|rest| rest.split('}').next())
            .unwrap_or_default()
            .to_string()
    };
    assert!(
        ref_entry("vremote").contains("\"remote\":\"origin\""),
        "vremote not marked as on origin: {after}"
    );
    assert!(
        !ref_entry("vlocal").contains("\"remote\""),
        "vlocal must stay local-only: {after}"
    );

    // The executed git commands show up in the command log.
    let log = tokio::task::spawn_blocking(move || http_get(port, "/api/log"))
        .await
        .unwrap();
    assert!(
        log.contains("fetch --all --prune"),
        "command missing: {log}"
    );
    assert!(log.contains("ls-remote --tags"), "ls-remote missing: {log}");
    assert!(log.contains("\"ok\":true"), "success flag missing: {log}");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn fetch_endpoint_reports_per_repo_errors() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path();
    init_repo_with_commit(dir);
    // A remote that cannot be reached makes this repository's fetch fail.
    let run = |args: &[&str]| {
        let status = Command::new("git")
            .current_dir(dir)
            .args(args)
            .status()
            .unwrap();
        assert!(status.success(), "git {args:?} failed");
    };
    run(&[
        "remote",
        "add",
        "origin",
        "definitely/missing/gitreant-remote",
    ]);

    let (listener, addr) = bind(0).await.unwrap();
    let port = addr.port();
    tokio::spawn(async move {
        serve(listener, AppState::new(Session::new()))
            .await
            .unwrap();
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
    tokio::task::spawn_blocking(move || post_repo(port, &repo_path))
        .await
        .unwrap()
        .expect("add repo");

    let resp = tokio::task::spawn_blocking(move || http_post_json(port, "/api/fetch", "{}"))
        .await
        .unwrap();
    assert!(resp.contains("200 OK"), "response: {resp}");
    assert!(
        !resp.contains("\"errors\":[]"),
        "expected a per-repo error: {resp}"
    );
    assert!(resp.contains("\"message\""), "error detail missing: {resp}");

    // The failed command is logged with its error.
    let log = tokio::task::spawn_blocking(move || http_get(port, "/api/log"))
        .await
        .unwrap();
    assert!(log.contains("\"ok\":false"), "failure flag missing: {log}");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn checkout_and_merge_endpoints_mutate_the_repository() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path();
    init_repo_with_commit(dir);
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
    // Diverging branches: main gets m-2, topic branches off the root.
    run(&["switch", "-c", "topic", "-q"]);
    run(&["commit", "--allow-empty", "-q", "-m", "t-1"]);
    run(&["switch", "main", "-q"]);
    run(&["commit", "--allow-empty", "-q", "-m", "m-2"]);

    let (listener, addr) = bind(0).await.unwrap();
    let port = addr.port();
    tokio::spawn(async move {
        serve(listener, AppState::new(Session::new()))
            .await
            .unwrap();
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
    tokio::task::spawn_blocking(move || post_repo(port, &repo_path))
        .await
        .unwrap()
        .expect("add repo");
    let id = gitreant::app::canonical(dir).to_string_lossy().into_owned();

    // The view names the checked-out branch.
    let repos = tokio::task::spawn_blocking(move || http_get(port, "/api/repos"))
        .await
        .unwrap();
    assert!(
        repos.contains("\"head_branch\":\"main\""),
        "head branch missing: {repos}"
    );

    // Checkout switches branches and notifies via the log.
    let body = format!("{{\"repo\":{id:?},\"reference\":\"topic\"}}");
    let resp = tokio::task::spawn_blocking(move || http_post_json(port, "/api/checkout", &body))
        .await
        .unwrap();
    assert!(resp.contains("200 OK"), "response: {resp}");
    let repos = tokio::task::spawn_blocking(move || http_get(port, "/api/repos"))
        .await
        .unwrap();
    assert!(
        repos.contains("\"head_branch\":\"topic\""),
        "checkout did not switch: {repos}"
    );

    // Merging main into topic adds a merge commit (3 commits -> 4).
    assert_eq!(
        repos.matches("\"summary\"").count(),
        3,
        "precondition: {repos}"
    );
    let body = format!("{{\"repo\":{id:?},\"reference\":\"main\"}}");
    let resp = tokio::task::spawn_blocking(move || http_post_json(port, "/api/merge", &body))
        .await
        .unwrap();
    assert!(resp.contains("200 OK"), "response: {resp}");
    let repos = tokio::task::spawn_blocking(move || http_get(port, "/api/repos"))
        .await
        .unwrap();
    assert_eq!(
        repos.matches("\"summary\"").count(),
        4,
        "expected a merge commit on top of 3: {repos}"
    );

    // Both executed commands are in the log; unknown repos are 404.
    let log = tokio::task::spawn_blocking(move || http_get(port, "/api/log"))
        .await
        .unwrap();
    assert!(log.contains("switch topic"), "checkout not logged: {log}");
    assert!(
        log.contains("merge --no-edit main"),
        "merge not logged: {log}"
    );
    let resp = tokio::task::spawn_blocking(move || {
        http_post_json(
            port,
            "/api/checkout",
            "{\"repo\":\"nope\",\"reference\":\"x\"}",
        )
    })
    .await
    .unwrap();
    assert!(resp.contains("404"), "response: {resp}");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn branch_create_endpoint_adds_a_branch_without_checkout() {
    let tmp = tempfile::tempdir().unwrap();
    init_repo_with_commit(tmp.path());

    let (listener, addr) = bind(0).await.unwrap();
    let port = addr.port();
    tokio::spawn(async move {
        serve(listener, AppState::new(Session::new()))
            .await
            .unwrap();
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

    let repo_path = tmp.path().to_string_lossy().into_owned();
    tokio::task::spawn_blocking(move || post_repo(port, &repo_path))
        .await
        .unwrap()
        .expect("add repo");
    let id = gitreant::app::canonical(tmp.path())
        .to_string_lossy()
        .into_owned();

    let repos = tokio::task::spawn_blocking(move || http_get(port, "/api/repos"))
        .await
        .unwrap();
    let head = repos
        .split("\"head\":\"")
        .nth(1)
        .and_then(|rest| rest.split('"').next())
        .expect("head id in view")
        .to_string();

    let body = format!("{{\"repo\":{id:?},\"name\":\"topic\",\"commit\":{head:?}}}");
    let resp = tokio::task::spawn_blocking(move || http_post_json(port, "/api/branch", &body))
        .await
        .unwrap();
    assert!(resp.contains("200 OK"), "response: {resp}");

    // The branch exists, and HEAD did not move (no checkout).
    let repos = tokio::task::spawn_blocking(move || http_get(port, "/api/repos"))
        .await
        .unwrap();
    assert!(repos.contains("\"topic\""), "branch missing: {repos}");
    assert!(
        repos.contains("\"head_branch\":\"main\""),
        "checkout happened: {repos}"
    );
    let log = tokio::task::spawn_blocking(move || http_get(port, "/api/log"))
        .await
        .unwrap();
    assert!(log.contains("branch topic"), "not logged: {log}");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn tag_endpoints_create_and_delete_tags() {
    let tmp = tempfile::tempdir().unwrap();
    init_repo_with_commit(tmp.path());

    let (listener, addr) = bind(0).await.unwrap();
    let port = addr.port();
    tokio::spawn(async move {
        serve(listener, AppState::new(Session::new()))
            .await
            .unwrap();
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

    let repo_path = tmp.path().to_string_lossy().into_owned();
    tokio::task::spawn_blocking(move || post_repo(port, &repo_path))
        .await
        .unwrap()
        .expect("add repo");
    let id = gitreant::app::canonical(tmp.path())
        .to_string_lossy()
        .into_owned();

    // Tag the head commit; the ref shows up with kind "tag".
    let repos = tokio::task::spawn_blocking(move || http_get(port, "/api/repos"))
        .await
        .unwrap();
    let head = repos
        .split("\"head\":\"")
        .nth(1)
        .and_then(|rest| rest.split('"').next())
        .expect("head id in view")
        .to_string();
    let body = format!("{{\"repo\":{id:?},\"name\":\"v9.9\",\"commit\":{head:?}}}");
    let resp = tokio::task::spawn_blocking(move || http_post_json(port, "/api/tag", &body))
        .await
        .unwrap();
    assert!(resp.contains("200 OK"), "response: {resp}");
    let repos = tokio::task::spawn_blocking(move || http_get(port, "/api/repos"))
        .await
        .unwrap();
    assert!(repos.contains("\"v9.9\""), "tag missing: {repos}");
    assert!(
        repos.contains("\"kind\":\"tag\""),
        "tag kind missing: {repos}"
    );

    // Delete it again.
    let body = format!("{{\"repo\":{id:?},\"name\":\"v9.9\"}}");
    let resp =
        tokio::task::spawn_blocking(move || http_request_json(port, "DELETE", "/api/tag", &body))
            .await
            .unwrap();
    assert!(resp.contains("200 OK"), "response: {resp}");
    let repos = tokio::task::spawn_blocking(move || http_get(port, "/api/repos"))
        .await
        .unwrap();
    assert!(!repos.contains("\"v9.9\""), "tag not deleted: {repos}");

    // Both commands are logged; unknown repos are 404.
    let log = tokio::task::spawn_blocking(move || http_get(port, "/api/log"))
        .await
        .unwrap();
    assert!(log.contains("tag v9.9"), "create not logged: {log}");
    assert!(log.contains("tag -d v9.9"), "delete not logged: {log}");
    let resp = tokio::task::spawn_blocking(move || {
        http_post_json(
            port,
            "/api/tag",
            "{\"repo\":\"nope\",\"name\":\"x\",\"commit\":\"y\"}",
        )
    })
    .await
    .unwrap();
    assert!(resp.contains("404"), "response: {resp}");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn prs_endpoint_answers_empty_without_github_and_404_for_unknown_repos() {
    let tmp = tempfile::tempdir().unwrap();
    init_repo_with_commit(tmp.path());

    let (listener, addr) = bind(0).await.unwrap();
    let port = addr.port();
    tokio::spawn(async move {
        serve(listener, AppState::new(Session::new()))
            .await
            .unwrap();
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

    let repo_path = tmp.path().to_string_lossy().into_owned();
    tokio::task::spawn_blocking(move || post_repo(port, &repo_path))
        .await
        .unwrap()
        .expect("add repo");

    // No GitHub remote (and possibly no gh at all): the lookup degrades to an
    // empty PR list either way.
    let id = gitreant::app::canonical(tmp.path())
        .to_string_lossy()
        .into_owned();
    let body = format!("{{\"repo\":{id:?}}}");
    let resp = tokio::task::spawn_blocking(move || http_post_json(port, "/api/prs", &body))
        .await
        .unwrap();
    assert!(resp.contains("200 OK"), "response: {resp}");
    assert!(resp.contains("\"prs\":[]"), "expected no PRs: {resp}");

    let resp = tokio::task::spawn_blocking(move || {
        http_post_json(port, "/api/prs", "{\"repo\":\"nope\"}")
    })
    .await
    .unwrap();
    assert!(resp.contains("404"), "response: {resp}");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn shutdown_completes_while_an_sse_connection_is_open() {
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

    // Open the SSE stream and keep the socket alive: a graceful shutdown
    // would wait on it forever, so the 1-second grace deadline must kick in.
    let sse = tokio::task::spawn_blocking(move || {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        write!(
            stream,
            "GET /api/events HTTP/1.1\r\nHost: 127.0.0.1\r\nAccept: text/event-stream\r\n\r\n"
        )
        .unwrap();
        let mut first = [0u8; 256];
        let n = stream.read(&mut first).unwrap();
        assert!(
            String::from_utf8_lossy(&first[..n]).contains("200 OK"),
            "SSE stream did not open"
        );
        stream
    })
    .await
    .unwrap();

    tokio::task::spawn_blocking(move || post_shutdown(port))
        .await
        .unwrap()
        .expect("shutdown request");

    let result = tokio::time::timeout(std::time::Duration::from_secs(5), server)
        .await
        .expect("server hung on the open SSE connection")
        .unwrap();
    assert!(result.is_ok(), "serve returned an error: {result:?}");
    drop(sse);
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
