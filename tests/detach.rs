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

/// Fetch `/api/list` as text over a raw socket, with the secret the server
/// on `port` keeps in its record in `state` (ADR 0063).
fn get_repos(port: u16, state: &Path) -> String {
    use std::io::{Read, Write};
    let secret = gitreant::records::token(state, port).expect("the server's record");
    let mut stream = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
    write!(
        stream,
        "GET /api/list HTTP/1.1\r\nHost: 127.0.0.1\r\nX-Gitreant-Token: {secret}\r\nConnection: close\r\n\r\n"
    )
    .unwrap();
    let mut resp = String::new();
    stream.read_to_string(&mut resp).unwrap();
    resp
}

#[test]
fn detaches_by_default_and_stops_via_shutdown() {
    let port = free_port();
    let state = tempfile::tempdir().unwrap();

    let tmp = tempfile::tempdir().unwrap();
    init_repo_with_commit(tmp.path());

    let exe = env!("CARGO_BIN_EXE_gitreant");
    let mut launcher = Command::new(exe)
        .env("GITREANT_STATE_DIR", state.path())
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
        .env("GITREANT_STATE_DIR", state.path())
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
    // The forwarding invocation points at the already-running instance,
    // whose page it would open again but for --no-open.
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
        get_repos(port, state.path()).contains(&second_name),
        "forwarded repository missing from the running server"
    );

    let shutdown = Command::new(exe)
        .env("GITREANT_STATE_DIR", state.path())
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
    let state = tempfile::tempdir().unwrap();
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
        .env("GITREANT_STATE_DIR", state.path())
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
        get_repos(port, state.path()).contains(&name),
        "repo missing before restart"
    );

    // Restart preserves the displayed repository and comes back on the port.
    // `.status()` (not `.output()`): restart detaches a server that would
    // inherit a captured stdout pipe on Windows and block the wait forever.
    let restart = Command::new(exe)
        .env("GITREANT_STATE_DIR", state.path())
        .args(["restart", "--port", &port.to_string()])
        .status()
        .expect("run restart");
    assert!(restart.success(), "restart failed: {restart}");
    assert!(
        wait_until(|| ping(port), Duration::from_secs(30)),
        "server did not come back after restart"
    );
    assert!(
        get_repos(port, state.path()).contains(&name),
        "restart lost the repository"
    );

    let shutdown = Command::new(exe)
        .env("GITREANT_STATE_DIR", state.path())
        .args(["--port", &port.to_string(), "--shutdown"])
        .status()
        .unwrap();
    assert!(shutdown.success(), "--shutdown failed: {shutdown}");
    assert!(wait_until(|| !ping(port), Duration::from_secs(10)));
}

/// Servers leave records the CLI finds them by (ADR 0039): `list` names
/// each, and `--shutdown` without a port stops the only one, refuses to
/// guess among several, and `--all` stops them all.
#[test]
fn the_cli_finds_running_servers_without_a_port() {
    let state = tempfile::tempdir().unwrap();
    let repo = tempfile::tempdir().unwrap();
    init_repo_with_commit(repo.path());
    let exe = env!("CARGO_BIN_EXE_gitreant");
    let gitreant = |args: &[&str]| {
        Command::new(exe)
            .args(args)
            .env("GITREANT_STATE_DIR", state.path())
            .output()
            .unwrap()
    };
    let text = |out: &std::process::Output| {
        format!(
            "{}{}",
            String::from_utf8_lossy(&out.stdout),
            String::from_utf8_lossy(&out.stderr)
        )
    };
    // The detached server would inherit captured output pipes and keep
    // them open, so the launcher is waited on rather than read.
    let start = |port: u16| {
        let mut launcher = Command::new(exe)
            .arg(repo.path())
            .args(["--port", &port.to_string(), "--no-open"])
            .env("GITREANT_STATE_DIR", state.path())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .unwrap();
        let status = wait_exit(&mut launcher, Duration::from_secs(60));
        assert!(
            status.is_some_and(|s| s.success()),
            "start failed on {port}"
        );
        assert!(ping(port));
    };

    let listed = gitreant(&["list"]);
    assert!(listed.status.success());
    assert!(
        text(&listed).contains("no gitreant server is running"),
        "{}",
        text(&listed)
    );
    assert_eq!(gitreant(&["list", "--json"]).stdout.trim_ascii(), b"[]");

    let (first, second) = (free_port(), free_port());
    start(first);
    start(second);
    // One line per server by default; the repositories only on request.
    let listed = text(&gitreant(&["list"]));
    let repo_name = repo
        .path()
        .file_name()
        .unwrap()
        .to_string_lossy()
        .into_owned();
    for port in [first, second] {
        assert!(
            listed.contains(&format!("http://127.0.0.1:{port}")),
            "{listed}"
        );
    }
    assert_eq!(listed.trim().lines().count(), 2, "{listed}");
    assert!(listed.contains("1 repository"), "{listed}");
    assert!(!listed.contains(&repo_name), "{listed}");
    let verbose = text(&gitreant(&["list", "--verbose"]));
    assert!(verbose.contains(&repo_name), "{verbose}");
    assert!(verbose.contains("at startup"), "{verbose}");
    let json = gitreant(&["list", "--json"]);
    let servers: serde_json::Value = serde_json::from_slice(&json.stdout).unwrap();
    let ports: Vec<u64> = servers
        .as_array()
        .unwrap()
        .iter()
        .map(|s| s["port"].as_u64().unwrap())
        .collect();
    assert_eq!(ports, {
        let mut both = vec![u64::from(first), u64::from(second)];
        both.sort();
        both
    });
    assert_eq!(servers[0]["repos"][0]["added"]["via"], "startup");
    assert!(servers[0]["pid"].as_u64().is_some());

    // Two run: a bare --shutdown names them and stops neither.
    let refused = gitreant(&["--shutdown"]);
    assert!(!refused.status.success());
    assert!(
        text(&refused).contains(&format!("{second}")),
        "{}",
        text(&refused)
    );
    assert!(ping(first) && ping(second));

    // One runs: a bare --shutdown stops it, and its record goes with it.
    assert!(gitreant(&["--shutdown", "--port", &first.to_string()])
        .status
        .success());
    assert!(wait_until(|| !ping(first), Duration::from_secs(10)));
    assert!(gitreant(&["--shutdown"]).status.success());
    assert!(wait_until(|| !ping(second), Duration::from_secs(10)));
    let no_records =
        || std::fs::read_dir(state.path()).map_or(true, |mut entries| entries.next().is_none());
    assert!(
        wait_until(no_records, Duration::from_secs(10)),
        "records were not removed"
    );

    // --all stops every running server.
    let (third, fourth) = (free_port(), free_port());
    start(third);
    start(fourth);
    assert!(gitreant(&["--shutdown", "--all"]).status.success());
    assert!(wait_until(
        || !ping(third) && !ping(fourth),
        Duration::from_secs(10)
    ));
}

/// Running gitreant again while its server runs opens the page again,
/// through a launcher file under the downloads directory on Linux, so the
/// secret stays off the browser's command line (ADR 0063).
#[cfg(target_os = "linux")]
#[test]
fn running_it_again_reopens_the_page_through_a_launcher() {
    let port = free_port();
    let state = tempfile::tempdir().unwrap();
    let downloads = tempfile::tempdir().unwrap();
    let tmp = tempfile::tempdir().unwrap();
    init_repo_with_commit(tmp.path());
    let exe = env!("CARGO_BIN_EXE_gitreant");
    let gitreant = |args: &[&str]| {
        Command::new(exe)
            .env("GITREANT_STATE_DIR", state.path())
            .env("XDG_DOWNLOAD_DIR", downloads.path())
            .args(args)
            .status()
            .unwrap()
    };
    let path = tmp.path().to_string_lossy().into_owned();
    assert!(gitreant(&[&path, "--port", &port.to_string(), "--no-open"]).success());
    assert!(wait_until(|| ping(port), Duration::from_secs(30)));

    let launcher = downloads
        .path()
        .join(".gitreant")
        .join(format!("open-{port}.html"));
    assert!(!launcher.exists());
    assert!(gitreant(&["--port", &port.to_string()]).success());
    let html = std::fs::read_to_string(&launcher).expect("a launcher");
    let secret = gitreant::records::token(state.path(), port).expect("a record");
    assert!(html.contains(&format!("#token={secret}")), "{html}");

    assert!(gitreant(&["--port", &port.to_string(), "--shutdown"]).success());
    assert!(wait_until(|| !ping(port), Duration::from_secs(10)));
    assert!(!launcher.exists(), "the launcher goes with the server");
}
