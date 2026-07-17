//! `gitreant doctor`: probe the external tools gitreant shells out to and
//! report what works, so a user can see at a glance why a feature (fetch,
//! PR links, signature verification) is inactive on their machine.

use std::process::Command;

/// One external dependency probed by `gitreant doctor`.
pub struct ToolReport {
    pub name: &'static str,
    pub required: bool,
    /// The features that stop working without this tool.
    pub purpose: &'static str,
    /// First line of `<tool> --version` when the tool answered.
    pub version: Option<String>,
}

const TOOLS: [(&str, bool, &str); 3] = [
    (
        "git",
        true,
        "fetch, checkout, merge, tag and branch operations",
    ),
    ("gh", false, "pull-request links and squash-merge links"),
    ("gpg", false, "commit signature verification"),
];

/// Probe every external tool gitreant delegates to.
pub fn run_checks() -> Vec<ToolReport> {
    TOOLS
        .iter()
        .map(|&(name, required, purpose)| ToolReport {
            name,
            required,
            purpose,
            version: probe(name),
        })
        .collect()
}

/// `Some(version banner)` when `<name> --version` runs and succeeds.
fn probe(name: &str) -> Option<String> {
    let output = Command::new(name).arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    version_line(&String::from_utf8_lossy(&output.stdout))
}

/// The first non-empty line of a `--version` banner (gpg's spans many).
fn version_line(stdout: &str) -> Option<String> {
    stdout
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_string)
}

/// Render the report as terminal lines. ASCII markers only: Windows
/// consoles do not reliably display unicode glyphs.
pub fn render(reports: &[ToolReport], server_running: bool, port: u16) -> String {
    let mut lines: Vec<String> = reports
        .iter()
        .map(|report| match (&report.version, report.required) {
            (Some(version), _) => format!("[ok] {version} - {}", report.purpose),
            (None, true) => format!(
                "[!!] {} not found - required for {}",
                report.name, report.purpose
            ),
            (None, false) => format!(
                "[--] {} not found - optional, enables {}",
                report.name, report.purpose
            ),
        })
        .collect();
    lines.push(if server_running {
        format!("[ok] a gitreant server is running on port {port}")
    } else {
        format!("[--] no gitreant server running on port {port}")
    });
    lines.push(if all_required_present(reports) {
        "No problems found.".to_string()
    } else {
        "Problems found: install the tools marked [!!].".to_string()
    });
    lines.join("\n")
}

/// Whether every required tool answered — the doctor's exit status.
pub fn all_required_present(reports: &[ToolReport]) -> bool {
    reports
        .iter()
        .all(|report| !report.required || report.version.is_some())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn report(name: &'static str, required: bool, version: Option<&str>) -> ToolReport {
        ToolReport {
            name,
            required,
            purpose: "things",
            version: version.map(str::to_string),
        }
    }

    #[test]
    fn version_line_takes_the_first_line_of_a_multi_line_banner() {
        let banner = "gpg (GnuPG) 2.4.5\nlibgcrypt 1.10.3\nCopyright ...\n";
        assert_eq!(version_line(banner), Some("gpg (GnuPG) 2.4.5".to_string()));
        assert_eq!(version_line("\n\n"), None);
    }

    #[test]
    fn render_marks_present_missing_required_and_missing_optional() {
        let reports = [
            report("git", true, Some("git version 2.45.1")),
            report("gh", false, None),
        ];
        let out = render(&reports, false, 4000);
        assert!(out.contains("[ok] git version 2.45.1"), "{out}");
        assert!(out.contains("[--] gh not found"), "{out}");
        assert!(out.contains("port 4000"), "{out}");
        assert!(out.contains("No problems found."), "{out}");
    }

    #[test]
    fn render_flags_a_missing_required_tool_as_a_problem() {
        let reports = [report("git", true, None)];
        let out = render(&reports, false, 4000);
        assert!(out.contains("[!!] git not found"), "{out}");
        assert!(!out.contains("No problems found."), "{out}");
    }

    #[test]
    fn render_reports_a_running_server() {
        let out = render(&[], true, 4599);
        assert!(out.contains("[ok]"), "{out}");
        assert!(out.contains("port 4599"), "{out}");
    }

    #[test]
    fn only_required_tools_decide_the_verdict() {
        assert!(all_required_present(&[
            report("git", true, Some("git version 2.45.1")),
            report("gh", false, None),
        ]));
        assert!(!all_required_present(&[report("git", true, None)]));
    }

    #[test]
    fn probing_finds_the_git_this_project_is_developed_with() {
        let reports = run_checks();
        let git = reports.iter().find(|r| r.name == "git").unwrap();
        assert!(git.required);
        assert!(git.version.as_deref().unwrap().contains("git"));
    }
}
