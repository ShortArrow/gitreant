//! A cheap per-repository state summary — uncommitted changes, unpushed
//! commits and local-only branches — by delegating to the `git` CLI.
//!
//! Surfaced as drawer indicators so a glance shows which repositories hold
//! work that is not committed or not on a remote.

use std::path::Path;

use super::command::{git, Locks};
use super::uncommitted::uncommitted_paths;

/// What a repository is holding that is not committed or not on a remote.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct RepoStatus {
    /// Uncommitted changes: staged, unstaged and untracked paths — the same
    /// count the graph's uncommitted-changes row shows.
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
        dirty: uncommitted_paths(path).len(),
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

/// A background poll's read: never a lock a concurrent commit needs, and
/// nothing when git fails.
fn run(path: &Path, args: &[&str]) -> String {
    git(path, args, Locks::Skip).unwrap_or_default()
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
