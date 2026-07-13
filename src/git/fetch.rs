//! Fetch from remotes by delegating to the `git` CLI.
//!
//! Everything else in gitreant reads repositories with pure-Rust `gix`, but
//! fetching needs the user's authentication setup (credential helpers, SSH
//! agents); the installed `git` already knows all of that.

use std::path::Path;
use std::process::Command;

/// Fetch all remotes of the repository at `path` (`git fetch --all --prune`).
pub fn fetch_remotes(path: &Path) -> Result<(), String> {
    let mut command = Command::new("git");
    command
        .arg("-C")
        .arg(path)
        .args(["fetch", "--all", "--prune", "--quiet"]);
    hide_console(&mut command);
    let output = command
        .output()
        .map_err(|e| format!("run git fetch: {e} (is git installed?)"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// The detached server has no console, so on Windows every child process
/// would otherwise pop up a visible console window.
#[cfg(windows)]
fn hide_console(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_console(_command: &mut Command) {}
