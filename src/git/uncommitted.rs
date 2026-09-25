//! The working tree's uncommitted changes — index and worktree against HEAD,
//! plus untracked files — shaped like a commit so the graph can show them as
//! one row above HEAD and the detail/diff panes can open them unchanged.
//!
//! The change list and the diffs of tracked files come from the `git` CLI,
//! so line-ending conversion, `.gitattributes` filters and ignore rules match
//! what the user's own `git status` / `git diff` show. An untracked file has
//! nothing to diff against, so it is read straight from disk.

use std::collections::HashMap;
use std::path::Path;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use super::detail::{looks_binary, unified, CommitDetail, FileChange, FileDiff};
use super::fetch::hide_console;

/// The id the changes row carries in place of a commit hash. Never a valid
/// object id, so it cannot collide with a real commit; the API dispatches
/// detail and diff requests on it.
pub const UNCOMMITTED_ID: &str = "uncommitted";

/// One path the working tree changed relative to HEAD.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UncommittedPath {
    /// Path relative to the repository root.
    pub path: String,
    /// "A" (added or untracked), "M" (modified) or "D" (deleted).
    pub status: String,
    /// Not in the index at all: diffs against nothing, counted from disk.
    pub untracked: bool,
}

impl UncommittedPath {
    /// An untracked directory git will not descend into — an embedded
    /// repository. Listed (git status shows it), but there is no file to
    /// count or diff, so it reads as an empty addition.
    fn is_directory(&self) -> bool {
        self.untracked && self.path.ends_with('/')
    }
}

/// Every path changed against HEAD, staged or not, plus untracked files.
/// Best effort: a repository git cannot read yields an empty list.
pub fn uncommitted_paths(path: &Path) -> Vec<UncommittedPath> {
    output(
        path,
        &[
            "status",
            "--porcelain",
            "-z",
            "--untracked-files=all",
            "--no-renames",
        ],
    )
    .map(|out| parse_status(&out))
    .unwrap_or_default()
}

/// The uncommitted changes as a commit-shaped detail: no author, the time
/// of the read, HEAD as the only parent, and the changed files with line
/// counts. Fails when there is no HEAD to compare against.
pub fn read_uncommitted(path: &Path) -> Result<CommitDetail, String> {
    let head = head_id(path)?;
    let counts = parse_numstat(&output(
        path,
        &["diff", "HEAD", "--numstat", "-z", "--no-renames"],
    )?);
    let files = uncommitted_paths(path)
        .into_iter()
        .map(|entry| {
            let (additions, deletions) = if entry.is_directory() {
                (0, 0)
            } else if entry.untracked {
                std::fs::read(path.join(&entry.path))
                    .map(|data| new_file_counts(&data))
                    .unwrap_or((0, 0))
            } else {
                counts.get(&entry.path).copied().unwrap_or((0, 0))
            };
            FileChange {
                path: entry.path,
                status: entry.status,
                additions,
                deletions,
            }
        })
        .collect();
    Ok(CommitDetail {
        id: UNCOMMITTED_ID.to_string(),
        message: "Uncommitted changes".to_string(),
        author: String::new(),
        email: String::new(),
        time: now(),
        parents: vec![head],
        signature: None,
        files,
    })
}

/// One changed file's diff against HEAD.
pub fn read_uncommitted_diff(path: &Path, file: &str) -> Result<FileDiff, String> {
    let entry = uncommitted_paths(path)
        .into_iter()
        .find(|e| e.path == file)
        .ok_or_else(|| format!("{file} has no uncommitted changes"))?;
    diff_entry(path, &entry)
}

/// Every changed file's diff against HEAD, in status order.
pub fn read_uncommitted_diffs(path: &Path) -> Result<Vec<FileDiff>, String> {
    uncommitted_paths(path)
        .iter()
        .map(|entry| diff_entry(path, entry))
        .collect()
}

fn diff_entry(path: &Path, entry: &UncommittedPath) -> Result<FileDiff, String> {
    if entry.is_directory() {
        return Ok(FileDiff {
            path: entry.path.clone(),
            status: entry.status.clone(),
            binary: false,
            text: String::new(),
        });
    }
    if entry.untracked {
        let data = std::fs::read(path.join(&entry.path))
            .map_err(|e| format!("read {}: {e}", entry.path))?;
        let binary = looks_binary(&data);
        return Ok(FileDiff {
            path: entry.path.clone(),
            status: entry.status.clone(),
            binary,
            text: if binary {
                String::new()
            } else {
                unified(&[], &data)
            },
        });
    }
    let out = output(
        path,
        &[
            "diff",
            "HEAD",
            "--no-color",
            "--no-ext-diff",
            "--no-renames",
            "--",
            &entry.path,
        ],
    )?;
    let (binary, text) = parse_diff(&out);
    Ok(FileDiff {
        path: entry.path.clone(),
        status: entry.status.clone(),
        binary,
        text,
    })
}

fn head_id(path: &Path) -> Result<String, String> {
    let repo = gix::discover(path).map_err(|e| format!("open {path:?}: {e}"))?;
    repo.head_id()
        .map(|id| id.detach().to_string())
        .map_err(|e| format!("no HEAD to compare against: {e}"))
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Run git in `path` and return its stdout; stderr becomes the error. Never
/// takes the index lock: this runs beside the user's own git commands.
fn output(path: &Path, args: &[&str]) -> Result<String, String> {
    let mut command = Command::new("git");
    command.arg("-C").arg(path).args(args);
    command.env("GIT_OPTIONAL_LOCKS", "0");
    hide_console(&mut command);
    let out = command
        .output()
        .map_err(|e| format!("run git: {e} (is git installed?)"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// `status --porcelain -z`: NUL-separated `XY path` entries, X the index
/// state and Y the worktree state. Ignored files (`!!`) never show.
fn parse_status(out: &str) -> Vec<UncommittedPath> {
    out.split('\0')
        .filter(|entry| entry.len() > 3 && entry.is_char_boundary(2))
        .filter_map(|entry| {
            let (code, rest) = entry.split_at(2);
            let path = rest.strip_prefix(' ')?;
            if code == "!!" {
                return None;
            }
            let untracked = code == "??";
            let (x, y) = (code.as_bytes()[0], code.as_bytes()[1]);
            let status = if untracked || x == b'A' {
                "A"
            } else if x == b'D' || y == b'D' {
                "D"
            } else {
                "M"
            };
            Some(UncommittedPath {
                path: path.to_string(),
                status: status.to_string(),
                untracked,
            })
        })
        .collect()
}

/// `diff --numstat -z`: NUL-separated `added<TAB>deleted<TAB>path` entries;
/// a binary file counts as `-`, which reads as zero.
fn parse_numstat(out: &str) -> HashMap<String, (usize, usize)> {
    out.split('\0')
        .filter_map(|entry| {
            let mut parts = entry.splitn(3, '\t');
            let additions = parts.next()?.trim().parse().unwrap_or(0);
            let deletions = parts.next()?.trim().parse().unwrap_or(0);
            let path = parts.next()?;
            Some((path.to_string(), (additions, deletions)))
        })
        .collect()
}

/// Reduce `git diff` output to what the detail-pane diff carries: the hunks
/// only (headers dropped), or a binary marker. The "no newline at end of
/// file" markers go too — the client renders hunk lines only.
fn parse_diff(out: &str) -> (bool, String) {
    if out.lines().any(|line| line.starts_with("Binary files ")) {
        return (true, String::new());
    }
    let mut text = String::new();
    let mut in_hunks = false;
    for line in out.lines() {
        if line.starts_with("@@") {
            in_hunks = true;
        }
        if !in_hunks || line.starts_with('\\') {
            continue;
        }
        text.push_str(line);
        text.push('\n');
    }
    (false, text)
}

/// An untracked file is all additions: one per line, none for binaries.
fn new_file_counts(data: &[u8]) -> (usize, usize) {
    if looks_binary(data) {
        (0, 0)
    } else {
        (String::from_utf8_lossy(data).lines().count(), 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_porcelain_status_codes_into_file_statuses() {
        let entries = parse_status(" M src/a.rs\0?? new.txt\0A  staged.rs\0 D gone.rs\0MM both.rs\0!! ignored\0");
        let summary: Vec<(&str, &str, bool)> = entries
            .iter()
            .map(|e| (e.path.as_str(), e.status.as_str(), e.untracked))
            .collect();
        assert_eq!(
            summary,
            vec![
                ("src/a.rs", "M", false),
                ("new.txt", "A", true),
                ("staged.rs", "A", false),
                ("gone.rs", "D", false),
                ("both.rs", "M", false),
            ]
        );
        assert!(parse_status("").is_empty());
    }

    #[test]
    fn an_untracked_directory_entry_is_an_embedded_repository() {
        let entries = parse_status("?? nested/\0?? plain.txt\0");
        assert!(entries[0].is_directory());
        assert!(!entries[1].is_directory());
        assert!(!parse_status(" M src/\0")[0].is_directory());
    }

    #[test]
    fn parses_numstat_including_binary_dashes() {
        let counts = parse_numstat("3\t1\tsrc/a.rs\0-\t-\timage.png\0");
        assert_eq!(counts["src/a.rs"], (3, 1));
        assert_eq!(counts["image.png"], (0, 0));
        assert!(parse_numstat("").is_empty());
    }

    #[test]
    fn keeps_only_the_hunks_of_a_git_diff() {
        let out = "diff --git a/n.txt b/n.txt\nindex 5626abf..814f4a4 100644\n--- a/n.txt\n+++ b/n.txt\n@@ -1 +1,2 @@\n one\n+two\n\\ No newline at end of file\n";
        assert_eq!(parse_diff(out), (false, "@@ -1 +1,2 @@\n one\n+two\n".to_string()));
        assert_eq!(
            parse_diff("diff --git a/i.png b/i.png\nBinary files a/i.png and b/i.png differ\n"),
            (true, String::new())
        );
        assert_eq!(parse_diff(""), (false, String::new()));
    }

    #[test]
    fn counts_a_new_file_as_pure_additions() {
        assert_eq!(new_file_counts(b"one\ntwo\n"), (2, 0));
        assert_eq!(new_file_counts(b"\0binary"), (0, 0));
        assert_eq!(new_file_counts(b""), (0, 0));
    }
}
