//! Tag operations (create, delete) by delegating to the `git` CLI, following
//! the same pattern as branch operations: user config and hooks apply, and
//! every executed command lands in the server's command log.

use std::path::Path;

use super::branch::{command_line, run};

fn create_args<'a>(name: &'a str, commit: &'a str) -> Vec<&'a str> {
    vec!["tag", name, commit]
}

fn delete_args(name: &str) -> Vec<&str> {
    vec!["tag", "-d", name]
}

/// The command line `create_tag` executes, for the command log.
pub fn create_tag_command(path: &Path, name: &str, commit: &str) -> String {
    command_line(path, &create_args(name, commit))
}

/// Create a lightweight tag `name` at `commit`.
pub fn create_tag(path: &Path, name: &str, commit: &str) -> Result<(), String> {
    run(path, &create_args(name, commit))
}

/// The command line `delete_tag` executes, for the command log.
pub fn delete_tag_command(path: &Path, name: &str) -> String {
    command_line(path, &delete_args(name))
}

/// Delete the local tag `name`.
pub fn delete_tag(path: &Path, name: &str) -> Result<(), String> {
    run(path, &delete_args(name))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn tag_commands_name_the_operations() {
        let repo = PathBuf::from("/repos/demo");
        assert_eq!(
            create_tag_command(&repo, "v1.0", "abc123"),
            "git -C /repos/demo tag v1.0 abc123"
        );
        assert_eq!(
            delete_tag_command(&repo, "v1.0"),
            "git -C /repos/demo tag -d v1.0"
        );
    }
}
