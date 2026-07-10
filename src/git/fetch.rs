//! Fetch from remotes by delegating to the `git` CLI.
//!
//! Everything else in gitreant reads repositories with pure-Rust `gix`, but
//! fetching needs the user's authentication setup (credential helpers, SSH
//! agents); the installed `git` already knows all of that.

use std::path::Path;
use std::process::Command;

/// Fetch all remotes of the repository at `path` (`git fetch --all --prune`).
pub fn fetch_remotes(path: &Path) -> Result<(), String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(path)
        .args(["fetch", "--all", "--prune", "--quiet"])
        .output()
        .map_err(|e| format!("run git fetch: {e} (is git installed?)"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}
