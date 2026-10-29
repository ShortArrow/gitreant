//! Running the `git` CLI in a repository and collecting what it printed.

use std::path::Path;
use std::process::Command;

use super::fetch::hide_console;

/// Whether git may take its optional locks, such as `index.lock` while
/// `git status` refreshes the index.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Locks {
    /// An operation the user asked for, which locks as their own git would.
    Take,
    /// A read beside the user's own git commands, which must never hold a
    /// lock one of them needs.
    Skip,
}

/// `git -C <path> <args>`, with its console hidden on Windows.
fn command(path: &Path, args: &[&str], locks: Locks) -> Command {
    let mut command = Command::new("git");
    command.arg("-C").arg(path).args(args);
    if locks == Locks::Skip {
        command.env("GIT_OPTIONAL_LOCKS", "0");
    }
    hide_console(&mut command);
    command
}

/// Run git in `path` and return its stdout; a failure returns its stderr,
/// trimmed, and git missing says so.
pub(super) fn git(path: &Path, args: &[&str], locks: Locks) -> Result<String, String> {
    let out = command(path, args, locks)
        .output()
        .map_err(|e| format!("run git: {e} (is git installed?)"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_read_beside_the_user_skips_the_optional_locks() {
        let path = Path::new(".");
        let skip = command(path, &["status"], Locks::Skip);
        let take = command(path, &["status"], Locks::Take);
        let lock_env = |c: &Command| {
            c.get_envs()
                .find(|(key, _)| *key == "GIT_OPTIONAL_LOCKS")
                .and_then(|(_, value)| value.map(|v| v.to_os_string()))
        };
        assert_eq!(lock_env(&skip), Some("0".into()));
        assert_eq!(lock_env(&take), None);
        let args: Vec<_> = skip.get_args().collect();
        assert_eq!(args, ["-C", ".", "status"]);
    }

    #[test]
    fn returns_stdout_or_the_trimmed_stderr() {
        let tmp = tempfile::tempdir().unwrap();
        let version = git(tmp.path(), &["--version"], Locks::Take).unwrap();
        assert!(version.starts_with("git version"), "{version}");
        let error = git(tmp.path(), &["rev-parse", "HEAD"], Locks::Skip).unwrap_err();
        assert!(error.contains("not a git repository"), "{error}");
        assert_eq!(error, error.trim());
    }
}
