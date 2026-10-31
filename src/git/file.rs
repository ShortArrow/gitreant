//! Read a file's content on the side a diff leads to, so the diff pane can
//! show the unchanged lines around its hunks (ADR 0061, ADR 0068).

use std::path::Path;

use super::detail::{blob_at, find_commit};
use super::diff_attributes::DiffAttributes;
use super::uncommitted::{read_untracked, uncommitted_paths, UNCOMMITTED_ID, UNTRACKED_READ_LIMIT};

/// The text of `file` in commit `id`'s tree, or in the working tree for
/// the uncommitted changes. `None` when the path is absent there, not among
/// the uncommitted changes, binary, or too large to read.
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

/// Whether `file` is exactly a path the uncommitted changes list, which
/// keeps out ignored and unchanged files and any spelling a request makes up.
fn is_changed(path: &Path, file: &str) -> bool {
    uncommitted_paths(path)
        .iter()
        .any(|change| change.path == file)
}

/// Whether `file` stays in the working tree on disk: no directory on its
/// way is a link or junction, which git walks as if it were a directory,
/// and its directory resolves outside the repository's git directories,
/// which a name such as `.git.` or `GIT~1` reaches on Windows.
fn in_working_tree(repo: &gix::Repository, root: &Path, file: &str) -> bool {
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
    let Ok(resolved) = on_way.canonicalize() else {
        return false;
    };
    [repo.git_dir(), repo.common_dir()].iter().all(|dir| {
        dir.canonicalize()
            .is_ok_and(|dir| !resolved.starts_with(dir))
    })
}
