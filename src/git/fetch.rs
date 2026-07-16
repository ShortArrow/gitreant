//! Fetch from remotes by delegating to the `git` CLI.
//!
//! Everything else in gitreant reads repositories with pure-Rust `gix`, but
//! fetching needs the user's authentication setup (credential helpers, SSH
//! agents); the installed `git` already knows all of that.

use std::path::Path;
use std::process::Command;

const FETCH_ARGS: [&str; 4] = ["fetch", "--all", "--prune", "--quiet"];

/// The command line `fetch_remotes` executes, for the command log.
pub fn fetch_command(path: &Path) -> String {
    format!("git -C {} {}", path.display(), FETCH_ARGS.join(" "))
}

/// Fetch all remotes of the repository at `path` (`git fetch --all --prune`).
pub fn fetch_remotes(path: &Path) -> Result<(), String> {
    let mut command = Command::new("git");
    command.arg("-C").arg(path).args(FETCH_ARGS);
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

/// Whether the repository has an `origin` remote configured — the guard that
/// keeps `remote_tags` from spamming the command log on remote-less repos.
pub fn has_origin(path: &Path) -> bool {
    gix::discover(path)
        .ok()
        .is_some_and(|repo| repo.config_snapshot().string("remote.origin.url").is_some())
}

const LS_REMOTE_TAGS_ARGS: [&str; 4] = ["ls-remote", "--tags", "--refs", "origin"];

/// The command line `remote_tags` executes, for the command log.
pub fn remote_tags_command(path: &Path) -> String {
    format!("git -C {} {}", path.display(), LS_REMOTE_TAGS_ARGS.join(" "))
}

/// The tag names existing on `origin`, so the UI can tell pushed tags from
/// local-only ones. A network call — run it alongside fetch, not on reads.
pub fn remote_tags(path: &Path) -> Result<Vec<String>, String> {
    let mut command = Command::new("git");
    command.arg("-C").arg(path).args(LS_REMOTE_TAGS_ARGS);
    hide_console(&mut command);
    let output = command
        .output()
        .map_err(|e| format!("run git ls-remote: {e} (is git installed?)"))?;
    if output.status.success() {
        Ok(parse_remote_tags(&String::from_utf8_lossy(&output.stdout)))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn parse_remote_tags(stdout: &str) -> Vec<String> {
    stdout
        .lines()
        .filter_map(|line| line.split_whitespace().nth(1))
        .filter_map(|full| full.strip_prefix("refs/tags/"))
        .map(str::to_string)
        .collect()
}

/// The detached server has no console, so on Windows every child process
/// would otherwise pop up a visible console window.
#[cfg(windows)]
pub(super) fn hide_console(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub(super) fn hide_console(_command: &mut Command) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ls_remote_tag_names() {
        let tags = parse_remote_tags(
            "abc123\trefs/tags/v1.0\n\
             def456\trefs/tags/v2.0\n\
             fff999\trefs/heads/main\n",
        );
        assert_eq!(tags, vec!["v1.0".to_string(), "v2.0".to_string()]);
    }

    #[test]
    fn remote_tags_command_names_the_query() {
        let cmd = remote_tags_command(std::path::Path::new("/repos/demo"));
        assert_eq!(cmd, "git -C /repos/demo ls-remote --tags --refs origin");
    }
}
