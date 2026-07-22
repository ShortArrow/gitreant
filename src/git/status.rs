//! A cheap per-repository state summary — uncommitted changes, unpushed
//! commits and local-only branches — by delegating to the `git` CLI.
//!
//! Surfaced as drawer indicators so a glance shows which repositories hold
//! work that is not committed or not on a remote.

use std::path::Path;
use std::process::Command;

use super::fetch::hide_console;

/// What a repository is holding that is not committed or not on a remote.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct RepoStatus {
    /// Uncommitted changes: staged, unstaged and untracked paths.
    pub dirty: usize,
    /// Commits on a local branch that are on no remote.
    pub unpushed: usize,
    /// Local branches that track no upstream.
    pub local_branches: usize,
}

/// Summarize the repository at `path`. Best effort: a failing command
/// contributes zero rather than an error, so one odd repository cannot
/// blank the whole drawer.
pub fn read_status(path: &Path) -> RepoStatus {
    RepoStatus {
        dirty: count_lines(&run(path, &["status", "--porcelain"])),
        unpushed: parse_count(&run(
            path,
            &["rev-list", "--count", "--branches", "--not", "--remotes"],
        )),
        local_branches: count_untracked_branches(&run(
            path,
            &["for-each-ref", "--format=%(upstream)", "refs/heads"],
        )),
    }
}

fn run(path: &Path, args: &[&str]) -> String {
    let mut command = Command::new("git");
    command.arg("-C").arg(path).args(args);
    // `git status` refreshes the index and grabs `index.lock` by default;
    // as a background poll that must never fight a concurrent commit, opt
    // out of those optional locks.
    command.env("GIT_OPTIONAL_LOCKS", "0");
    hide_console(&mut command);
    command
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
        .unwrap_or_default()
}

/// Each porcelain line is one changed or untracked path.
fn count_lines(stdout: &str) -> usize {
    stdout.lines().filter(|l| !l.trim().is_empty()).count()
}

fn parse_count(stdout: &str) -> usize {
    stdout.trim().parse().unwrap_or(0)
}

/// `%(upstream)` is empty for a branch that tracks nothing; count those.
fn count_untracked_branches(stdout: &str) -> usize {
    stdout.lines().filter(|l| l.trim().is_empty()).count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_porcelain_change_lines() {
        assert_eq!(count_lines(" M src/a.rs\n?? new.txt\nA  staged\n"), 3);
        assert_eq!(count_lines(""), 0);
    }

    #[test]
    fn parses_the_rev_list_count() {
        assert_eq!(parse_count("5\n"), 5);
        assert_eq!(parse_count(""), 0);
        assert_eq!(parse_count("garbage"), 0);
    }

    #[test]
    fn counts_branches_without_an_upstream() {
        // One tracks origin/main; two are local-only.
        assert_eq!(
            count_untracked_branches("refs/remotes/origin/main\n\n\n"),
            2
        );
        assert_eq!(count_untracked_branches(""), 0);
    }
}
