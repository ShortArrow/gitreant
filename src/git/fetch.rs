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

/// Names of the repository's configured remotes, in name order (empty when
/// there are none or the repository cannot be read).
pub fn remote_names(path: &Path) -> Vec<String> {
    gix::discover(path)
        .ok()
        .map(|repo| {
            repo.remote_names()
                .into_iter()
                .map(|name| name.to_string())
                .collect()
        })
        .unwrap_or_default()
}

fn ls_remote_tags_args(remote: &str) -> [String; 4] {
    [
        "ls-remote".to_string(),
        "--tags".to_string(),
        "--refs".to_string(),
        remote.to_string(),
    ]
}

/// One remote's tag listing: the command run and, on success, its tag names.
pub struct RemoteTagList {
    pub remote: String,
    pub command: String,
    pub result: Result<Vec<String>, String>,
}

/// `ls-remote --tags` every configured remote, so the UI can tell which
/// remote (if any) a tag was pushed to. A network call per remote — run it
/// alongside fetch, not on reads. The caller logs each command and folds
/// the results into a tag→remote map.
pub fn tag_remotes(path: &Path) -> Vec<RemoteTagList> {
    remote_names(path)
        .into_iter()
        .map(|remote| {
            let args = ls_remote_tags_args(&remote);
            let command = format!("git -C {} {}", path.display(), args.join(" "));
            RemoteTagList {
                result: ls_remote_tags(path, &args),
                remote,
                command,
            }
        })
        .collect()
}

fn ls_remote_tags(path: &Path, args: &[String; 4]) -> Result<Vec<String>, String> {
    let mut command = Command::new("git");
    command.arg("-C").arg(path).args(args);
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
    fn ls_remote_tags_args_target_the_named_remote() {
        assert_eq!(
            ls_remote_tags_args("source"),
            ["ls-remote", "--tags", "--refs", "source"],
        );
    }
}
