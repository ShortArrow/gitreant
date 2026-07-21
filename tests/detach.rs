//! Characterisation test of the CLI's detach-by-default behaviour, driven
//! through the real binary: the launcher process must exit while the server
//! keeps answering, and `--shutdown` must stop that server.

use std::path::Path;
use std::process::{Child, Command};
use std::time::{Duration, Instant};

use gitreant::server::ping;

/// A port that is free right now. A fixed port would collide with TIME_WAIT
/// sockets left behind by the previous test run (bind fails with WSAEADDRINUSE
/// for tens of seconds even after the process exited).
fn free_port() -> u16 {
    std::net::TcpListener::bind(("127.0.0.1", 0))
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}

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

fn wait_exit(child: &mut Child, timeout: Duration) -> Option<std::process::ExitStatus> {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if let Some(status) = child.try_wait().unwrap() {
            return Some(status);
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    None
}

fn wait_until(cond: impl Fn() -> bool, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if cond() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    false
}

/// Fetch `/api/repos` as text over a raw socket.
fn get_repos(port: u16) -> String {
    use std::io::{Read, Write};
    let mut stream = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
    write!(
        stream,
        "GET /api/list HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"
    )
    .unwrap();
    let mut resp = String::new();
    stream.read_to_string(&mut resp).unwrap();
    resp
}

#[test]
fn detaches_by_default_and_stops_via_shutdown() {
    let port = free_port();

    let tmp = tempfile::tempdir().unwrap();
    init_repo_with_commit(tmp.path());

    let exe = env!("CARGO_BIN_EXE_gitreant");
    let mut launcher = Command::new(exe)
        .arg(tmp.path())
        .args(["--port", &port.to_string(), "--no-open"])
        .spawn()
        .unwrap();

    let status = match wait_exit(&mut launcher, Duration::from_secs(60)) {
        Some(status) => status,
        None => {
            let _ = launcher.kill();
            panic!("launcher kept running: it did not detach");
        }
    };
    assert!(status.success(), "launcher failed: {status}");
    assert!(ping(port), "detached server is not answering");

    // Single-instance behavior: a second invocation forwards its repository
    // to the running server and exits instead of starting another one.
    let second = tempfile::tempdir().unwrap();
    init_repo_with_commit(second.path());
    let forwarder = Command::new(exe)
        .arg(second.path())
        .args(["--port", &port.to_string(), "--no-open"])
        .output()
        .expect("run forwarding invocation");
    assert!(
        forwarder.status.success(),
        "forwarding invocation failed: {}",
        forwarder.status
    );
    let stdout = String::from_utf8_lossy(&forwarder.stdout);
    assert!(
        !stdout.contains(r"\\?\"),
        "forwarded path must be human-readable, got: {stdout}"
    );
    // Instead of opening yet another browser tab, the forwarding invocation
    // points at the already-running instance.
    assert!(
        stdout.contains(&format!("http://127.0.0.1:{port}")),
        "forwarding must print the running server's URL, got: {stdout}"
    );
    let second_name = second
        .path()
        .file_name()
        .unwrap()
        .to_string_lossy()
        .into_owned();
    assert!(
        get_repos(port).contains(&second_name),
        "forwarded repository missing from the running server"
    );

    let shutdown = Command::new(exe)
        .args(["--port", &port.to_string(), "--shutdown"])
        .status()
        .unwrap();
    assert!(shutdown.success(), "--shutdown failed: {shutdown}");
    assert!(
        wait_until(|| !ping(port), Duration::from_secs(10)),
        "server still answering after --shutdown"
    );
}

#[test]
fn restart_brings_the_same_repositories_back_up() {
    let port = free_port();
    let tmp = tempfile::tempdir().unwrap();
    init_repo_with_commit(tmp.path());
    let name = tmp
        .path()
        .file_name()
        .unwrap()
        .to_string_lossy()
        .into_owned();

    let exe = env!("CARGO_BIN_EXE_gitreant");
    let mut launcher = Command::new(exe)
        .arg(tmp.path())
        .args(["--port", &port.to_string(), "--no-open"])
        .spawn()
        .unwrap();
    assert!(
        wait_exit(&mut launcher, Duration::from_secs(60)).is_some_and(|s| s.success()),
        "launcher did not detach cleanly"
    );
    assert!(ping(port), "server is not answering");
    assert!(
        get_repos(port).contains(&name),
        "repo missing before restart"
    );

    // Restart preserves the displayed repository and comes back on the port.
    // `.status()` (not `.output()`): restart detaches a server that would
    // inherit a captured stdout pipe on Windows and block the wait forever.
    let restart = Command::new(exe)
        .args(["restart", "--port", &port.to_string()])
        .status()
        .expect("run restart");
    assert!(restart.success(), "restart failed: {restart}");
    assert!(
        wait_until(|| ping(port), Duration::from_secs(30)),
        "server did not come back after restart"
    );
    assert!(
        get_repos(port).contains(&name),
        "restart lost the repository"
    );

    let shutdown = Command::new(exe)
        .args(["--port", &port.to_string(), "--shutdown"])
        .status()
        .unwrap();
    assert!(shutdown.success(), "--shutdown failed: {shutdown}");
    assert!(wait_until(|| !ping(port), Duration::from_secs(10)));
}
