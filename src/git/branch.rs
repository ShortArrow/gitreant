//! Branch operations (checkout, merge) by delegating to the `git` CLI.
//!
//! These mutate the working tree, so they run through the installed `git`
//! exactly as the user would (hooks, config and all), and every executed
//! command is meant to land in the server's command log.

use std::path::Path;
use std::process::Command;

use super::fetch::hide_console;

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

pub(super) fn run(path: &Path, args: &[&str]) -> Result<(), String> {
    let mut command = Command::new("git");
    command.arg("-C").arg(path).args(args);
    hide_console(&mut command);
    let output = command
        .output()
        .map_err(|e| format!("run git: {e} (is git installed?)"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
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
