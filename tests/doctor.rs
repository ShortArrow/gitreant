//! `gitreant doctor` probes the gpg of the user's git configuration, and
//! never a program the repository it runs in names (ADR 0078).

use std::path::Path;
use std::process::Command;

fn git(dir: &Path, args: &[&str]) {
    let status = Command::new("git")
        .current_dir(dir)
        .args(args)
        .status()
        .unwrap();
    assert!(status.success(), "git {args:?} failed");
}

/// A script in `dir` that leaves `marker` behind when it runs, by the name
/// a repository's `gpg.program` would give it.
fn leave_a_program(dir: &Path, marker: &Path) -> &'static str {
    if cfg!(windows) {
        let script = format!("@echo off\r\necho ran > \"{}\"\r\n", marker.display());
        std::fs::write(dir.join("evil.cmd"), script).unwrap();
        "./evil.cmd"
    } else {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let path = dir.join("evil");
            let script = format!("#!/bin/sh\ntouch '{}'\n", marker.display());
            std::fs::write(&path, script).unwrap();
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        "./evil"
    }
}

#[test]
fn a_repository_s_gpg_program_is_not_run_by_gitreant() {
    let repo = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let marker = outside.path().join("ran");
    let global = outside.path().join("gitconfig");
    std::fs::write(&global, "").unwrap();
    git(repo.path(), &["init", "-q", "-b", "main"]);
    let program = leave_a_program(repo.path(), &marker);
    git(repo.path(), &["config", "gpg.program", program]);

    let output = Command::new(env!("CARGO_BIN_EXE_gitreant"))
        .current_dir(repo.path())
        .env("GIT_CONFIG_GLOBAL", &global)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GITREANT_STATE_DIR", outside.path().join("state"))
        .arg("doctor")
        .output()
        .unwrap();

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(!marker.exists(), "the repository's program ran: {stdout}");
    assert!(!stdout.contains("evil"), "{stdout}");
}
