//! Characterisation test of the CLI's detach-by-default behaviour, driven
//! through the real binary: the launcher process must exit while the server
//! keeps answering, and `--shutdown` must stop that server.

use std::path::Path;
use std::process::{Child, Command};
use std::time::{Duration, Instant};

use gitreant::server::{ping, post_shutdown};

const PORT: u16 = 47821;

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

#[test]
fn detaches_by_default_and_stops_via_shutdown() {
    let _ = post_shutdown(PORT);

    let tmp = tempfile::tempdir().unwrap();
    init_repo_with_commit(tmp.path());

    let exe = env!("CARGO_BIN_EXE_gitreant");
    let mut launcher = Command::new(exe)
        .arg(tmp.path())
        .args(["--port", &PORT.to_string(), "--no-open"])
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
    assert!(ping(PORT), "detached server is not answering");

    let shutdown = Command::new(exe)
        .args(["--port", &PORT.to_string(), "--shutdown"])
        .status()
        .unwrap();
    assert!(shutdown.success(), "--shutdown failed: {shutdown}");
    assert!(
        wait_until(|| !ping(PORT), Duration::from_secs(10)),
        "server still answering after --shutdown"
    );
}
