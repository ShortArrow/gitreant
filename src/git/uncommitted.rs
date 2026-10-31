//! The working tree's uncommitted changes — index and worktree against HEAD,
//! plus untracked files — shaped like a commit so the graph can show them as
//! one row above HEAD and the detail/diff panes can open them unchanged.
//!
//! The change list and the diffs of tracked files come from the `git` CLI,
//! so line-ending conversion, `.gitattributes` filters and ignore rules match
//! what the user's own `git status` / `git diff` show, and the user's
//! `status.showUntrackedFiles` setting decides how untracked files are
//! listed. An untracked file has nothing to diff against, so it is read
//! straight from disk, up to a size cap, and its `diff` attribute is looked
//! up the way the commit diffs do (ADR 0033).

use std::collections::HashMap;
use std::path::Path;

use super::command::{git, Locks};
use super::detail::{line_count, unified, CommitDetail, FileChange, FileDiff};
use super::diff_attributes::DiffAttributes;

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

/// Untracked files larger than this are not read: they count as binary,
/// so a stray VM image or dataset never lands in memory or in a response.
pub const UNTRACKED_READ_LIMIT: u64 = 4 * 1024 * 1024;

impl UncommittedPath {
    /// An untracked directory git lists as one entry (the default
    /// `status.showUntrackedFiles=normal`, or an embedded repository).
    /// Listed as git status shows it, but there is no file to count or
    /// diff, so it reads as an empty addition.
    fn is_directory(&self) -> bool {
        self.untracked && self.path.ends_with('/')
    }
}

/// Every path changed against HEAD, staged or not, plus untracked files as
/// the user's `status.showUntrackedFiles` lists them (one entry per
/// untracked directory by default). Best effort: a repository git cannot
/// read yields an empty list.
pub fn uncommitted_paths(path: &Path) -> Vec<UncommittedPath> {
    output(path, &["status", "--porcelain", "-z", "--no-renames"])
        .map(|out| parse_status(&out))
        .unwrap_or_default()
}

/// The uncommitted changes as a commit-shaped detail: no author or time,
/// HEAD as the only parent, and the changed files with line counts. Fails
/// when there is no HEAD to compare against.
pub fn read_uncommitted(path: &Path) -> Result<CommitDetail, String> {
    let repo = open(path)?;
    let head = repo
        .head_id()
        .map(|id| id.detach().to_string())
        .map_err(|e| format!("no HEAD to compare against: {e}"))?;
    let mut attributes = DiffAttributes::of(&repo);
    let counts = parse_numstat(&output(
        path,
        &["diff", "HEAD", "--numstat", "-z", "--no-renames"],
    )?);
    // Ignoring the CR at line ends, a file that changed nothing but its line
    // endings drops out of the listing altogether.
    let beyond_endings = output(
        path,
        &[
            "diff",
            "HEAD",
            "--numstat",
            "-z",
            "--no-renames",
            "--ignore-cr-at-eol",
        ],
    )
    .map(|out| parse_numstat(&out))
    .ok();
    let files = uncommitted_paths(path)
        .into_iter()
        .map(|entry| {
            let lines = if entry.is_directory() {
                Some((0, 0))
            } else if entry.untracked {
                untracked_counts(&mut attributes, path, &entry.path)
            } else {
                counts.get(&entry.path).copied().unwrap_or(Some((0, 0)))
            };
            let (additions, deletions) = lines.unwrap_or((0, 0));
            let eol_only = !entry.untracked
                && additions + deletions > 0
                && beyond_endings
                    .as_ref()
                    .is_some_and(|rest| !rest.contains_key(&entry.path));
            FileChange {
                path: entry.path,
                status: entry.status,
                additions,
                deletions,
                eol_only,
                binary: lines.is_none(),
            }
        })
        .collect();
    Ok(CommitDetail {
        id: UNCOMMITTED_ID.to_string(),
        message: "Uncommitted changes".to_string(),
        author: String::new(),
        email: String::new(),
        time: 0,
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
    let repo = open(path)?;
    diff_entry(&repo, &mut DiffAttributes::of(&repo), path, &entry)
}

/// Every changed file's diff against HEAD, in status order. A file that
/// cannot be read right now (locked by another process, gone since the
/// status) is left out rather than sinking the whole set; asking for that
/// one file alone still reports the error.
pub fn read_uncommitted_diffs(path: &Path) -> Result<Vec<FileDiff>, String> {
    let repo = open(path)?;
    let mut attributes = DiffAttributes::of(&repo);
    Ok(uncommitted_paths(path)
        .iter()
        .filter_map(|entry| diff_entry(&repo, &mut attributes, path, entry).ok())
        .collect())
}

fn diff_entry(
    repo: &gix::Repository,
    attributes: &mut DiffAttributes,
    path: &Path,
    entry: &UncommittedPath,
) -> Result<FileDiff, String> {
    if entry.is_directory() {
        return Ok(FileDiff {
            path: entry.path.clone(),
            status: entry.status.clone(),
            binary: false,
            text: String::new(),
            lines: None,
        });
    }
    let on_disk = path.join(&entry.path);
    if std::fs::symlink_metadata(&on_disk).is_ok() && !in_working_tree(repo, path, &entry.path) {
        return Ok(FileDiff {
            path: entry.path.clone(),
            status: entry.status.clone(),
            binary: true,
            text: String::new(),
            lines: None,
        });
    }
    if entry.untracked {
        let data = read_untracked(&on_disk, UNTRACKED_READ_LIMIT)?;
        let binary = data
            .as_deref()
            .is_none_or(|data| attributes.binary(&entry.path, &[], data));
        return Ok(FileDiff {
            path: entry.path.clone(),
            status: entry.status.clone(),
            binary,
            lines: data.as_deref().map(line_count),
            text: match data {
                Some(data) if !binary => unified(&[], &data),
                _ => String::new(),
            },
        });
    }
    // Literal pathspecs: a file named `a[1].txt` must not glob onto `a1.txt`.
    let out = output(
        path,
        &[
            "--literal-pathspecs",
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
    let lines = if on_disk.exists() {
        read_untracked(&on_disk, UNTRACKED_READ_LIMIT)
            .ok()
            .flatten()
            .map(|data| line_count(&data))
    } else {
        Some(0)
    };
    Ok(FileDiff {
        path: entry.path.clone(),
        status: entry.status.clone(),
        binary,
        text,
        lines,
    })
}

fn open(path: &Path) -> Result<gix::Repository, String> {
    gix::discover(path).map_err(|e| format!("open {path:?}: {e}"))
}

/// An untracked file's bytes, as git would see them: a symbolic link is
/// its target text, not the file it points at. `None` when the file is
/// larger than `limit` — the caller treats it as binary.
pub(super) fn read_untracked(file: &Path, limit: u64) -> Result<Option<Vec<u8>>, String> {
    let describe = |e: std::io::Error| format!("read {}: {e}", file.display());
    let meta = std::fs::symlink_metadata(file).map_err(describe)?;
    if meta.file_type().is_symlink() {
        let target = std::fs::read_link(file).map_err(describe)?;
        return Ok(Some(target.to_string_lossy().into_owned().into_bytes()));
    }
    if meta.len() > limit {
        return Ok(None);
    }
    std::fs::read(file).map(Some).map_err(describe)
}

/// Whether `file` stays in the working tree on disk: no directory on its
/// way is a link or junction, which git walks as if it were a directory,
/// and no part of where it resolves under `root` is a `.git` directory or
/// file, which a name such as `.git.` or `GIT~1` reaches on Windows, nor
/// lies in `repo`'s git directories, whatever their names. A file that is
/// itself a link is read as its target text, so only its directory is
/// resolved.
pub(super) fn in_working_tree(repo: &gix::Repository, root: &Path, file: &str) -> bool {
    let on_disk = root.join(file);
    let Some(parent) = Path::new(file).parent() else {
        return false;
    };
    let mut on_way = root.to_path_buf();
    for part in parent.components() {
        on_way.push(part);
        match std::fs::symlink_metadata(&on_way) {
            Ok(meta) if !meta.file_type().is_symlink() => {}
            _ => return false,
        }
    }
    let is_link =
        std::fs::symlink_metadata(&on_disk).is_ok_and(|meta| meta.file_type().is_symlink());
    let resolved = if is_link {
        on_way.canonicalize()
    } else {
        on_disk.canonicalize()
    };
    let (Ok(root), Ok(resolved)) = (root.canonicalize(), resolved) else {
        return false;
    };
    let in_git_dir = [repo.git_dir(), repo.common_dir()].iter().any(|dir| {
        dir.canonicalize()
            .is_ok_and(|dir| resolved.starts_with(dir))
    });
    !in_git_dir
        && resolved.strip_prefix(&root).is_ok_and(|inside| {
            inside
                .components()
                .all(|part| !part.as_os_str().eq_ignore_ascii_case(".git"))
        })
}

/// Run git in `path` and return its stdout; stderr becomes the error. Never
/// takes the index lock: this runs beside the user's own git commands.
fn output(path: &Path, args: &[&str]) -> Result<String, String> {
    git(path, args, Locks::Skip)
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
/// a binary file counts as `-`, which reads as `None`.
fn parse_numstat(out: &str) -> HashMap<String, Option<(usize, usize)>> {
    out.split('\0')
        .filter_map(|entry| {
            let mut parts = entry.splitn(3, '\t');
            let additions = parts.next()?.trim().parse().ok();
            let deletions = parts.next()?.trim().parse().ok();
            let path = parts.next()?;
            Some((path.to_string(), additions.zip(deletions)))
        })
        .collect()
}

/// An untracked file's line counts, or `None` when it reads as binary; a
/// file that cannot be read counts nothing.
fn untracked_counts(
    attributes: &mut DiffAttributes,
    root: &Path,
    file: &str,
) -> Option<(usize, usize)> {
    match read_untracked(&root.join(file), UNTRACKED_READ_LIMIT) {
        Err(_) => Some((0, 0)),
        Ok(None) => None,
        Ok(Some(data)) if attributes.binary(file, &[], &data) => None,
        Ok(Some(data)) => Some(new_file_counts(&data)),
    }
}

/// Reduce `git diff` output to what the detail-pane diff carries: the hunks
/// only (headers dropped), or a binary marker. A CR ending a line is kept. The "no newline at end of
/// file" markers go too — the client renders hunk lines only.
fn parse_diff(out: &str) -> (bool, String) {
    if out.lines().any(|line| line.starts_with("Binary files ")) {
        return (true, String::new());
    }
    let mut text = String::new();
    let mut in_hunks = false;
    // `split_terminator`, not `lines`: `lines` also strips a CR before the
    // LF, which is the whole change when a line's ending changed.
    for line in out.split_terminator('\n') {
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

/// An untracked text file is all additions, one per line.
fn new_file_counts(data: &[u8]) -> (usize, usize) {
    (String::from_utf8_lossy(data).lines().count(), 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_porcelain_status_codes_into_file_statuses() {
        let entries = parse_status(
            " M src/a.rs\0?? new.txt\0A  staged.rs\0 D gone.rs\0MM both.rs\0!! ignored\0",
        );
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
        assert_eq!(counts["src/a.rs"], Some((3, 1)));
        assert_eq!(counts["image.png"], None);
        assert!(parse_numstat("").is_empty());
    }

    #[test]
    fn keeps_only_the_hunks_of_a_git_diff() {
        let out = "diff --git a/n.txt b/n.txt\nindex 5626abf..814f4a4 100644\n--- a/n.txt\n+++ b/n.txt\n@@ -1 +1,2 @@\n one\n+two\n\\ No newline at end of file\n";
        assert_eq!(
            parse_diff(out),
            (false, "@@ -1 +1,2 @@\n one\n+two\n".to_string())
        );
        assert_eq!(
            parse_diff("diff --git a/i.png b/i.png\nBinary files a/i.png and b/i.png differ\n"),
            (true, String::new())
        );
        assert_eq!(parse_diff(""), (false, String::new()));
    }

    #[test]
    fn an_untracked_file_over_the_cap_is_not_read() {
        let tmp = tempfile::tempdir().unwrap();
        let big = tmp.path().join("big.bin");
        std::fs::write(&big, vec![b'x'; 64]).unwrap();
        assert_eq!(read_untracked(&big, 16).unwrap(), None);
        assert_eq!(read_untracked(&big, 64).unwrap().map(|d| d.len()), Some(64));
        assert!(read_untracked(&tmp.path().join("missing"), 16).is_err());
    }

    #[test]
    fn keeps_the_carriage_return_git_prints_on_a_line() {
        // A line-ending change is only visible through the CR git leaves on
        // the line; dropping it makes the two sides identical.
        let out =
            "diff --git a/n.txt b/n.txt\n--- a/n.txt\n+++ b/n.txt\n@@ -1 +1 @@\n-one\n+one\r\n";
        assert_eq!(
            parse_diff(out),
            (false, "@@ -1 +1 @@\n-one\n+one\r\n".to_string())
        );
    }

    #[test]
    fn counts_a_new_file_as_pure_additions() {
        assert_eq!(new_file_counts(b"one\ntwo\n"), (2, 0));
        assert_eq!(new_file_counts(b""), (0, 0));
    }
}
