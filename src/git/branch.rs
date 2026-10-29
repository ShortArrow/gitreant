//! Branch operations (checkout, merge) by delegating to the `git` CLI.
//!
//! These mutate the working tree, so they run through the installed `git`
//! exactly as the user would (hooks, config and all), and every executed
//! command is meant to land in the server's command log.

use std::path::Path;

use super::command::{git, Locks};

/// `git switch` arguments for `reference`; remote-tracking refs (with a "/")
/// cannot be switched to directly, so they detach.
fn checkout_args(reference: &str) -> Vec<&str> {
    if reference.contains('/') {
        vec!["switch", "--detach", reference]
    } else {
        vec!["switch", reference]
    }
}

/// `--no-edit` keeps git from opening an editor for the merge message; the
/// server has no terminal to host one.
fn merge_args(reference: &str) -> Vec<&str> {
    vec!["merge", "--no-edit", reference]
}

pub(super) fn command_line(path: &Path, args: &[&str]) -> String {
    format!("git -C {} {}", path.display(), args.join(" "))
}

/// Run an operation the user asked for; a failure returns git's stderr.
pub(super) fn run(path: &Path, args: &[&str]) -> Result<(), String> {
    git(path, args, Locks::Take).map(drop)
}

/// The command line `checkout` executes, for the command log.
pub fn checkout_command(path: &Path, reference: &str) -> String {
    command_line(path, &checkout_args(reference))
}

/// Switch the repository at `path` to `reference` (a local branch name or a
/// remote-tracking ref like "origin/main", which detaches).
pub fn checkout(path: &Path, reference: &str) -> Result<(), String> {
    run(path, &checkout_args(reference))
}

fn checkout_detached_args(commit: &str) -> Vec<&str> {
    vec!["switch", "--detach", commit]
}

/// The command line `checkout_detached` executes, for the command log.
pub fn checkout_detached_command(path: &Path, commit: &str) -> String {
    command_line(path, &checkout_detached_args(commit))
}

/// `value` when it is a full commit id (SHA-1 or SHA-256 hex). Anything else
/// is refused, so a request cannot pass git an option such as
/// `--discard-changes` in its place.
fn commit_id(value: &str) -> Result<&str, String> {
    let hex = value.bytes().all(|b| b.is_ascii_hexdigit());
    if hex && (value.len() == 40 || value.len() == 64) {
        Ok(value)
    } else {
        Err(format!("not a commit id: {value:?}"))
    }
}

/// Check out `commit` at `path` with a detached HEAD (ADR 0035); git refuses
/// when local changes would be overwritten.
pub fn checkout_detached(path: &Path, commit: &str) -> Result<(), String> {
    run(path, &checkout_detached_args(commit_id(commit)?))
}

/// The command line `merge` executes, for the command log.
pub fn merge_command(path: &Path, reference: &str) -> String {
    command_line(path, &merge_args(reference))
}

fn create_branch_args<'a>(name: &'a str, commit: &'a str) -> Vec<&'a str> {
    vec!["branch", name, commit]
}

/// The command line `create_branch` executes, for the command log.
pub fn create_branch_command(path: &Path, name: &str, commit: &str) -> String {
    command_line(path, &create_branch_args(name, commit))
}

/// Create branch `name` at `commit` without checking it out.
pub fn create_branch(path: &Path, name: &str, commit: &str) -> Result<(), String> {
    run(path, &create_branch_args(name, commit))
}

/// Merge `reference` into the currently checked-out branch of `path`.
pub fn merge(path: &Path, reference: &str) -> Result<(), String> {
    run(path, &merge_args(reference))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn checkout_switches_detaching_for_remote_refs() {
        let repo = PathBuf::from("/repos/demo");
        assert_eq!(
            checkout_command(&repo, "feature"),
            "git -C /repos/demo switch feature"
        );
        // A remote-tracking ref cannot be switched to directly; it detaches.
        assert_eq!(
            checkout_command(&repo, "origin/main"),
            "git -C /repos/demo switch --detach origin/main"
        );
    }

    #[test]
    fn a_commit_checks_out_detached() {
        assert_eq!(
            checkout_detached_command(&PathBuf::from("/repos/demo"), "abc123"),
            "git -C /repos/demo switch --detach abc123"
        );
    }

    #[test]
    fn a_detached_checkout_takes_only_a_commit_id() {
        // Anything else could reach git as an option, such as
        // --discard-changes; it is refused before git runs.
        for bad in ["--discard-changes", "-f", "main", "abc123", ""] {
            assert!(commit_id(bad).is_err(), "{bad:?}");
        }
        let sha1 = "0123456789abcdef0123456789abcdef01234567";
        assert_eq!(commit_id(sha1), Ok(sha1));
        let sha256 = "0123456789abcdef".repeat(4);
        assert_eq!(commit_id(&sha256), Ok(sha256.as_str()));
    }

    #[test]
    fn merge_names_the_reference() {
        assert_eq!(
            merge_command(&PathBuf::from("/repos/demo"), "origin/main"),
            "git -C /repos/demo merge --no-edit origin/main"
        );
    }

    #[test]
    fn create_branch_names_branch_and_commit() {
        assert_eq!(
            create_branch_command(&PathBuf::from("/repos/demo"), "topic", "abc123"),
            "git -C /repos/demo branch topic abc123"
        );
    }
}
