//! Read the details of a single commit: full message and per-file changes.

use std::path::Path;

/// One changed file in a commit, with line counts against the first parent.
#[derive(Debug, Clone, PartialEq)]
pub struct FileChange {
    /// Path relative to the repository root.
    pub path: String,
    /// "A" (added), "M" (modified), "D" (deleted) or "R" (rewritten).
    pub status: String,
    pub additions: usize,
    pub deletions: usize,
}

/// A single commit with everything the detail pane shows.
#[derive(Debug, Clone, PartialEq)]
pub struct CommitDetail {
    pub id: String,
    /// Full commit message (summary and body).
    pub message: String,
    pub author: String,
    pub email: String,
    /// Committer time, seconds since the Unix epoch.
    pub time: i64,
    pub parents: Vec<String>,
    /// Kind of the embedded signature ("openpgp", "ssh", "x509" or "unknown"),
    /// if the commit is signed. Presence only — no verification happens.
    pub signature: Option<String>,
    /// Changes against the first parent (or the empty tree for a root commit).
    pub files: Vec<FileChange>,
}

/// Read commit `id` from the repository at `path`.
pub fn read_commit(path: &Path, id: &str) -> Result<CommitDetail, String> {
    let repo = gix::discover(path).map_err(|e| format!("open {path:?}: {e}"))?;
    let oid = gix::ObjectId::from_hex(id.as_bytes()).map_err(|e| format!("bad id {id}: {e}"))?;
    let commit = repo
        .find_object(oid)
        .map_err(|e| format!("commit {id} not found: {e}"))?
        .try_into_commit()
        .map_err(|e| format!("{id} is not a commit: {e}"))?;

    let message = commit
        .message_raw()
        .map(|m| m.to_string())
        .unwrap_or_default();
    let (author, email) = commit
        .author()
        .map(|a| (a.name.to_string(), a.email.to_string()))
        .unwrap_or_default();
    let time = commit.time().map(|t| t.seconds).unwrap_or(0);
    let parents: Vec<String> = commit.parent_ids().map(|p| p.detach().to_string()).collect();

    Ok(CommitDetail {
        id: oid.to_string(),
        message,
        author,
        email,
        time,
        parents,
        signature: signature_kind(&commit),
        files: changed_files(&repo, &commit)?,
    })
}

/// Classify the commit's embedded signature by its armor header, if any.
fn signature_kind(commit: &gix::Commit) -> Option<String> {
    let data = commit.decode().ok()?;
    let signature = data.extra_headers().pgp_signature()?;
    let kind = if signature.starts_with(b"-----BEGIN SSH SIGNATURE") {
        "ssh"
    } else if signature.starts_with(b"-----BEGIN PGP SIGNATURE") {
        "openpgp"
    } else if signature.starts_with(b"-----BEGIN SIGNED MESSAGE") {
        "x509"
    } else {
        "unknown"
    };
    Some(kind.to_string())
}

/// Diff the commit's tree against its first parent (or the empty tree).
fn changed_files(repo: &gix::Repository, commit: &gix::Commit) -> Result<Vec<FileChange>, String> {
    let tree = commit.tree().map_err(|e| format!("tree: {e}"))?;
    let parent_tree = match commit.parent_ids().next() {
        Some(parent) => repo
            .find_object(parent)
            .map_err(|e| format!("parent: {e}"))?
            .try_into_commit()
            .map_err(|e| format!("parent: {e}"))?
            .tree()
            .map_err(|e| format!("parent tree: {e}"))?,
        None => repo.empty_tree(),
    };

    let mut cache = repo
        .diff_resource_cache_for_tree_diff()
        .map_err(|e| format!("diff cache: {e}"))?;
    let mut files = Vec::new();
    parent_tree
        .changes()
        .map_err(|e| format!("diff: {e}"))?
        .for_each_to_obtain_tree(&tree, |change| {
            if let Some(file) = file_change(change, &mut cache) {
                files.push(file);
            }
            cache.clear_resource_cache_keep_allocation();
            Ok::<_, std::convert::Infallible>(std::ops::ControlFlow::Continue(()))
        })
        .map_err(|e| format!("diff: {e}"))?;
    Ok(files)
}

fn file_change(
    change: gix::object::tree::diff::Change<'_, '_, '_>,
    cache: &mut gix::diff::blob::Platform,
) -> Option<FileChange> {
    use gix::object::tree::diff::Change;

    if !change.entry_mode().is_blob() {
        return None;
    }
    let status = match change {
        Change::Addition { .. } => "A",
        Change::Deletion { .. } => "D",
        Change::Modification { .. } => "M",
        Change::Rewrite { .. } => "R",
    };
    let (additions, deletions) = change
        .diff(cache)
        .ok()
        .and_then(|mut platform| platform.line_counts().ok().flatten())
        .map(|counts| (counts.insertions as usize, counts.removals as usize))
        .unwrap_or((0, 0));
    Some(FileChange {
        path: change.location().to_string(),
        status: status.to_string(),
        additions,
        deletions,
    })
}
