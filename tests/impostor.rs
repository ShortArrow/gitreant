//! A program that answers gitreant's port as a gitreant would, but cannot
//! prove it holds the secret of the server recorded there, gets nothing
//! from the CLI (ADR 0064).

use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::Path;
use std::process::Command;
use std::sync::{Arc, Mutex};

use gitreant::records::{self, Record};

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

/// A program on a free port that answers every request as a gitreant's
/// ping would, and keeps each request it hears.
fn listen_as_impostor() -> (u16, Arc<Mutex<Vec<String>>>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let seen: Arc<Mutex<Vec<String>>> = Arc::default();
    let heard = Arc::clone(&seen);
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let mut stream = stream;
            let mut buf = [0u8; 4096];
            let n = stream.read(&mut buf).unwrap_or(0);
            heard
                .lock()
                .unwrap()
                .push(String::from_utf8_lossy(&buf[..n]).into_owned());
            let _ = stream.write_all(
                b"HTTP/1.1 200 OK\r\nContent-Length: 8\r\nConnection: close\r\n\r\ngitreant",
            );
        }
    });
    (port, seen)
}

/// A state directory holding the record of a server that ran on `port`
/// before, with [`GONE_SECRET`] as its secret.
fn record_gone_server(port: u16) -> tempfile::TempDir {
    let state = tempfile::tempdir().unwrap();
    let record = Record {
        port,
        pid: 1,
        started: 0,
        version: "0.3.0".to_string(),
        token: GONE_SECRET.to_string(),
    };
    records::write(state.path(), &record).unwrap();
    state
}

const GONE_SECRET: &str = "the-secret-of-a-server-gone";

#[test]
fn an_impostor_on_the_port_gets_nothing() {
    let (port, seen) = listen_as_impostor();
    let state = record_gone_server(port);

    let repo = tempfile::tempdir().unwrap();
    init_repo_with_commit(repo.path());
    let output = Command::new(env!("CARGO_BIN_EXE_gitreant"))
        .env("GITREANT_STATE_DIR", state.path())
        .arg(repo.path())
        .args(["--port", &port.to_string(), "--no-open"])
        .output()
        .unwrap();

    assert!(!output.status.success(), "{output:?}");
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("cannot prove"), "{stderr}");
    let requests = seen.lock().unwrap().join("\n---\n");
    assert!(!requests.contains(GONE_SECRET), "{requests}");
    assert!(!requests.contains("POST"), "{requests}");
    assert!(
        !requests.contains(
            &repo
                .path()
                .file_name()
                .unwrap()
                .to_string_lossy()
                .to_string()
        ),
        "{requests}"
    );
}

/// Listing the running servers sends an impostor nothing and prints no
/// secret, in every form `list` takes; it says which port could not prove.
#[test]
fn listing_shows_an_impostor_nothing_of_the_secret() {
    let (port, seen) = listen_as_impostor();
    let state = record_gone_server(port);

    for form in [&["list"][..], &["list", "--verbose"], &["list", "--json"]] {
        let output = Command::new(env!("CARGO_BIN_EXE_gitreant"))
            .env("GITREANT_STATE_DIR", state.path())
            .args(form)
            .output()
            .unwrap();

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(!stdout.contains(GONE_SECRET), "{form:?}: {stdout}");
        assert!(!stderr.contains(GONE_SECRET), "{form:?}: {stderr}");
        assert!(stderr.contains("cannot prove"), "{form:?}: {stderr}");
    }
    let requests = seen.lock().unwrap().join("\n---\n");
    assert!(!requests.contains(GONE_SECRET), "{requests}");
}

/// Asked to pick among several running servers, the CLI lists only those
/// that prove their secret, sending the others nothing of it.
#[test]
fn picking_among_servers_shows_impostors_nothing_of_the_secret() {
    let (port, seen) = listen_as_impostor();
    let (other, heard) = listen_as_impostor();
    let state = record_gone_server(port);
    let record = Record {
        port: other,
        pid: 2,
        started: 0,
        version: "0.3.0".to_string(),
        token: GONE_SECRET.to_string(),
    };
    records::write(state.path(), &record).unwrap();

    let output = Command::new(env!("CARGO_BIN_EXE_gitreant"))
        .env("GITREANT_STATE_DIR", state.path())
        .arg("refresh")
        .output()
        .unwrap();

    assert!(!output.status.success(), "{output:?}");
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(!stderr.contains(GONE_SECRET), "{stderr}");
    assert!(stderr.contains("cannot prove"), "{stderr}");
    for requests in [seen, heard] {
        let requests = requests.lock().unwrap().join("\n---\n");
        assert!(!requests.contains(GONE_SECRET), "{requests}");
    }
}
