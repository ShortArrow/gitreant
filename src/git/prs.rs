//! Look up open pull requests for a repository via the `gh` CLI.
//!
//! Which PR belongs to which branch is GitHub state, not repository state, so
//! it is read through the user's authenticated `gh` — and skipped entirely
//! when `gh` is not installed.

use std::path::Path;
use std::process::Command;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

use super::fetch::hide_console;

/// One open pull request, keyed by its head branch name.
/// Deserializes gh's `headRefName`, serializes to the API as `branch`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PullRequest {
    pub number: u64,
    pub url: String,
    #[serde(alias = "headRefName")]
    pub branch: String,
}

const PR_ARGS: [&str; 6] = [
    "pr",
    "list",
    "--state",
    "open",
    "--json",
    "number,url,headRefName",
];

/// Whether a `gh` binary is on the PATH. Checked once per process.
pub fn gh_available() -> bool {
    static AVAILABLE: OnceLock<bool> = OnceLock::new();
    *AVAILABLE.get_or_init(|| {
        let mut command = Command::new("gh");
        command.arg("--version");
        hide_console(&mut command);
        command
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    })
}

/// The command line `list_prs` executes, for the command log. The repository
/// context comes from the log entry's repo field, not the command line.
pub fn pr_command() -> String {
    format!("gh {}", PR_ARGS.join(" "))
}

/// List the open pull requests of the repository at `path`.
pub fn list_prs(path: &Path) -> Result<Vec<PullRequest>, String> {
    let mut command = Command::new("gh");
    command.args(PR_ARGS).current_dir(path);
    hide_console(&mut command);
    let output = command
        .output()
        .map_err(|e| format!("run gh: {e} (is gh installed?)"))?;
    if output.status.success() {
        parse_prs(&String::from_utf8_lossy(&output.stdout))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

fn parse_prs(stdout: &str) -> Result<Vec<PullRequest>, String> {
    serde_json::from_str(stdout).map_err(|e| format!("parse gh output: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_gh_json_output() {
        let prs = parse_prs(
            r#"[{"headRefName":"feature","number":7,"url":"https://github.com/o/r/pull/7"}]"#,
        )
        .unwrap();
        assert_eq!(
            prs,
            vec![PullRequest {
                number: 7,
                url: "https://github.com/o/r/pull/7".to_string(),
                branch: "feature".to_string(),
            }]
        );
        assert_eq!(parse_prs("[]").unwrap(), vec![]);
    }

    #[test]
    fn malformed_output_is_an_error() {
        assert!(parse_prs("not json").is_err());
    }

    #[test]
    fn pr_command_names_the_executed_query() {
        let cmd = pr_command();
        assert!(cmd.starts_with("gh pr list"));
        assert!(cmd.contains("--state open"));
        assert!(cmd.contains("number,url,headRefName"));
    }
}
