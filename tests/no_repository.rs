//! What a bare `gitreant` does where there is nothing to show: outside any
//! repository it prints the usage and succeeds, while a path the user named
//! that is not a repository is still an error.

use std::path::Path;
use std::process::{Command, Output};

/// A port that is free right now, so a server left from another test cannot
/// answer and turn the launch into a forward.
fn free_port() -> u16 {
    std::net::TcpListener::bind(("127.0.0.1", 0))
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}

/// Run the binary in `dir`, a temp directory outside any repository.
/// `GIT_CEILING_DIRECTORIES` stops the git commands the binary runs from
/// finding one above it; gitreant's own discovery (`gix::discover`) does not
/// read it, so the temp directory itself must lie outside a repository.
fn run_in(dir: &Path, args: &[&str]) -> Output {
    let port = free_port().to_string();
    Command::new(env!("CARGO_BIN_EXE_gitreant"))
        .current_dir(dir)
        .env("GIT_CEILING_DIRECTORIES", dir.parent().unwrap())
        .args(args)
        .args(["--port", &port])
        .output()
        .unwrap()
}

#[test]
fn no_arguments_outside_a_repository_prints_usage_and_succeeds() {
    let tmp = tempfile::tempdir().unwrap();

    let out = run_in(tmp.path(), &[]);

    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(
        out.status.success(),
        "exit {:?}, stderr: {}",
        out.status,
        String::from_utf8_lossy(&out.stderr)
    );
    assert!(stdout.contains("Usage:"), "stdout: {stdout}");
}

#[test]
fn a_named_path_that_is_not_a_repository_still_fails() {
    let tmp = tempfile::tempdir().unwrap();

    let out = run_in(tmp.path(), &["--foreground", "."]);

    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(!out.status.success(), "unexpected success");
    assert!(
        stderr.contains("no git repositories to display"),
        "stderr: {stderr}"
    );
}
