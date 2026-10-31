//! Read a file's content on the side a diff leads to, so the diff pane can
//! show the unchanged lines around its hunks (ADR 0061, ADR 0068).

use std::path::Path;

use super::detail::{blob_at, find_commit};
use super::diff_attributes::DiffAttributes;
use super::uncommitted::{
    in_working_tree, read_untracked, uncommitted_paths, READ_LIMIT, UNCOMMITTED_ID,
};

/// The text of `file` in commit `id`'s tree, or in the working tree for
/// the uncommitted changes. `None` when the path is absent there, not among
/// the uncommitted changes, binary, or too large to read. `path` is the
/// working tree's root, since the changes are listed relative to it, and
/// is spelled as [`super::uncommitted::read_uncommitted_diff`] requires.
pub fn read_file(path: &Path, id: &str, file: &str) -> Result<Option<String>, String> {
    let repo = gix::discover(path).map_err(|e| format!("open {path:?}: {e}"))?;
    let data = if id == UNCOMMITTED_ID {
        if !is_changed(path, file) {
            return Ok(None);
        }
        let on_disk = path.join(file);
        if std::fs::symlink_metadata(&on_disk).is_err() || !in_working_tree(&repo, path, file) {
            return Ok(None);
        }
        read_untracked(&on_disk, READ_LIMIT)?
    } else {
        let commit = find_commit(&repo, id)?;
        let tree = commit.tree().map_err(|e| format!("tree: {e}"))?;
        blob_at(&repo, &tree, file)?
    };
    let mut attributes = DiffAttributes::of(&repo);
    Ok(data
        .filter(|data| !attributes.binary(file, &[], data))
        .map(|data| String::from_utf8_lossy(&data).into_owned()))
}

/// Whether `file` is exactly a path the uncommitted changes list, which
/// keeps out ignored and unchanged files and any spelling a request makes up.
fn is_changed(path: &Path, file: &str) -> bool {
    uncommitted_paths(path)
        .iter()
        .any(|change| change.path == file)
}
