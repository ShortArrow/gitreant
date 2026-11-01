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

/// Re-verifying signatures and stopping servers send an impostor nothing of
/// the secret either, whether the port is named or every server is meant
/// (ADR 0074).
#[test]
fn refreshing_and_stopping_show_an_impostor_nothing_of_the_secret() {
    let (port, seen) = listen_as_impostor();
    let state = record_gone_server(port);
    let port = port.to_string();

    for form in [
        &["--port", &port, "refresh"][..],
        &["--port", &port, "--shutdown"],
        &["--shutdown", "--all"],
    ] {
        let output = Command::new(env!("CARGO_BIN_EXE_gitreant"))
            .env("GITREANT_STATE_DIR", state.path())
            .args(form)
            .output()
            .unwrap();

        assert!(!output.status.success(), "{form:?}: {output:?}");
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(stderr.contains("cannot prove"), "{form:?}: {stderr}");
    }
    let requests = seen.lock().unwrap().join("\n---\n");
    assert!(!requests.contains(GONE_SECRET), "{requests}");
    assert!(!requests.contains("POST"), "{requests}");
}

/// Where nothing answers, stopping or re-verifying says so, rather than
/// blaming a program that is not there.
#[test]
fn stopping_where_nothing_answers_says_so() {
    let port = TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
        .to_string();
    let state = tempfile::tempdir().unwrap();

    for form in [
        &["--port", &port, "refresh"][..],
        &["--port", &port, "--shutdown"],
    ] {
        let output = Command::new(env!("CARGO_BIN_EXE_gitreant"))
            .env("GITREANT_STATE_DIR", state.path())
            .args(form)
            .output()
            .unwrap();

        assert!(!output.status.success(), "{form:?}: {output:?}");
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(stderr.contains("no gitreant"), "{form:?}: {stderr}");
    }
}

/// A program that proves the secret recorded for its port only the first
/// time it is asked, as a server does that leaves the port to another
/// program between the CLI's proof and its use.
fn listen_as_server_that_leaves(secret: &'static str) -> u16 {
    use hmac::{Hmac, Mac};
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    std::thread::spawn(move || {
        let mut proofs = 0;
        for stream in listener.incoming().flatten() {
            let mut stream = stream;
            let mut buf = [0u8; 4096];
            let n = stream.read(&mut buf).unwrap_or(0);
            let request = String::from_utf8_lossy(&buf[..n]).into_owned();
            let challenge = request
                .split_whitespace()
                .nth(1)
                .and_then(|path| path.split_once("challenge="))
                .map(|(_, challenge)| challenge.to_string());
            let body = match challenge {
                Some(challenge) => {
                    proofs += 1;
                    let mut mac = Hmac::<sha2::Sha256>::new_from_slice(secret.as_bytes()).unwrap();
                    mac.update(challenge.as_bytes());
                    let answer: String = if proofs == 1 {
                        mac.finalize()
                            .into_bytes()
                            .iter()
                            .map(|b| format!("{b:02x}"))
                            .collect()
                    } else {
                        "0".repeat(64)
                    };
                    format!("gitreant\n{answer}")
                }
                None if request.starts_with("GET /api/ping") => "gitreant".to_string(),
                None => "{}".to_string(),
            };
            let _ = stream.write_all(
                format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                )
                .as_bytes(),
            );
        }
    });
    port
}

/// The CLI proves the server again just before it hands out the page's
/// address, so a server gone after the first proof gets no page opened
/// on its port (ADR 0075).
#[test]
fn a_server_gone_before_its_page_opens_gets_no_page_opened() {
    let port = listen_as_server_that_leaves(GONE_SECRET);
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
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("added "), "{stdout}");
    assert!(!stdout.contains("#token="), "{stdout}");
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("no longer proves"), "{stderr}");
    assert!(stderr.contains("opening nothing"), "{stderr}");
}
