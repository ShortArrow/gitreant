//! Read a file's content on the side a diff leads to, so the diff pane can
//! show the unchanged lines around its hunks (ADR 0061).

use std::path::Path;

use super::detail::{blob_at, find_commit};
use super::diff_attributes::DiffAttributes;
use super::uncommitted::{read_untracked, UNCOMMITTED_ID, UNTRACKED_READ_LIMIT};

/// The text of `file` in commit `id`'s tree, or in the working tree for
/// the uncommitted changes. `None` when the path is absent there, binary,
/// or too large to read.
pub fn read_file(path: &Path, id: &str, file: &str) -> Result<Option<String>, String> {
    let repo = gix::discover(path).map_err(|e| format!("open {path:?}: {e}"))?;
    let data = if id == UNCOMMITTED_ID {
        if !inside_tree(file) {
            return Ok(None);
        }
        let on_disk = path.join(file);
        if std::fs::symlink_metadata(&on_disk).is_err() || !stays_in(path, &on_disk) {
            return Ok(None);
        }
        read_untracked(&on_disk, UNTRACKED_READ_LIMIT)?
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

/// Whether `file` names a path inside the working tree: relative, and made
/// of plain names only, so no `..`, root or drive prefix leads out of it.
fn inside_tree(file: &str) -> bool {
    let path = Path::new(file);
    !file.is_empty()
        && path
            .components()
            .all(|part| matches!(part, std::path::Component::Normal(_)))
}

/// Whether the directory holding `on_disk` resolves inside `root`, so no
/// linked directory on the way leads out of the working tree.
fn stays_in(root: &Path, on_disk: &Path) -> bool {
    let (Ok(root), Some(Ok(parent))) = (
        root.canonicalize(),
        on_disk.parent().map(Path::canonicalize),
    ) else {
        return false;
    };
    parent.starts_with(root)
}
