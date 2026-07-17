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
    let commit = find_commit(&repo, id)?;

    let message = commit
        .message_raw()
        .map(|m| m.to_string())
        .unwrap_or_default();
    let (author, email) = commit
        .author()
        .map(|a| (a.name.to_string(), a.email.to_string()))
        .unwrap_or_default();
    let time = commit.time().map(|t| t.seconds).unwrap_or(0);
    let parents: Vec<String> = commit
        .parent_ids()
        .map(|p| p.detach().to_string())
        .collect();

    Ok(CommitDetail {
        id: commit.id().detach().to_string(),
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
pub(super) fn signature_kind(commit: &gix::Commit) -> Option<String> {
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

/// One file's changes in a commit, as a unified diff against the first parent.
#[derive(Debug, Clone, PartialEq)]
pub struct FileDiff {
    pub path: String,
    /// "A" (added), "M" (modified) or "D" (deleted).
    pub status: String,
    /// True when either side looks binary; `text` is empty then.
    pub binary: bool,
    /// Unified diff hunks ("@@ ..." headers with -/+/context lines).
    pub text: String,
}

/// Diff one file of commit `id` against the first parent (or the empty tree).
pub fn read_file_diff(path: &Path, id: &str, file: &str) -> Result<FileDiff, String> {
    let repo = gix::discover(path).map_err(|e| format!("open {path:?}: {e}"))?;
    let commit = find_commit(&repo, id)?;
    let tree = commit.tree().map_err(|e| format!("tree: {e}"))?;
    let parent_tree = first_parent_tree(&repo, &commit)?;
    diff_blobs(&repo, &parent_tree, &tree, file)?
        .ok_or_else(|| format!("{file} is not part of commit {id}"))
}

/// Diff every file of commit `id` against the first parent, in one pass.
pub fn read_commit_diff(path: &Path, id: &str) -> Result<Vec<FileDiff>, String> {
    let repo = gix::discover(path).map_err(|e| format!("open {path:?}: {e}"))?;
    let commit = find_commit(&repo, id)?;
    let tree = commit.tree().map_err(|e| format!("tree: {e}"))?;
    let parent_tree = first_parent_tree(&repo, &commit)?;

    changed_files(&repo, &commit)?
        .into_iter()
        .map(|file| {
            diff_blobs(&repo, &parent_tree, &tree, &file.path)?
                .ok_or_else(|| format!("{} vanished while diffing", file.path))
        })
        .collect()
}

fn find_commit<'repo>(
    repo: &'repo gix::Repository,
    id: &str,
) -> Result<gix::Commit<'repo>, String> {
    let oid = gix::ObjectId::from_hex(id.as_bytes()).map_err(|e| format!("bad id {id}: {e}"))?;
    repo.find_object(oid)
        .map_err(|e| format!("commit {id} not found: {e}"))?
        .try_into_commit()
        .map_err(|e| format!("{id} is not a commit: {e}"))
}

/// Diff the blobs at `file` between two trees; `None` when neither side has it.
fn diff_blobs(
    repo: &gix::Repository,
    parent_tree: &gix::Tree<'_>,
    tree: &gix::Tree<'_>,
    file: &str,
) -> Result<Option<FileDiff>, String> {
    let old = blob_at(repo, parent_tree, file)?;
    let new = blob_at(repo, tree, file)?;
    let status = match (&old, &new) {
        (None, None) => return Ok(None),
        (None, Some(_)) => "A",
        (Some(_), None) => "D",
        (Some(_), Some(_)) => "M",
    };
    let old = old.unwrap_or_default();
    let new = new.unwrap_or_default();
    let binary = looks_binary(&old) || looks_binary(&new);
    Ok(Some(FileDiff {
        path: file.to_string(),
        status: status.to_string(),
        binary,
        text: if binary {
            String::new()
        } else {
            unified(&old, &new)
        },
    }))
}

fn first_parent_tree<'repo>(
    repo: &'repo gix::Repository,
    commit: &gix::Commit<'repo>,
) -> Result<gix::Tree<'repo>, String> {
    match commit.parent_ids().next() {
        Some(parent) => repo
            .find_object(parent)
            .map_err(|e| format!("parent: {e}"))?
            .try_into_commit()
            .map_err(|e| format!("parent: {e}"))?
            .tree()
            .map_err(|e| format!("parent tree: {e}")),
        None => Ok(repo.empty_tree()),
    }
}

/// The blob contents at `path` inside `tree`, if a file exists there.
fn blob_at(
    repo: &gix::Repository,
    tree: &gix::Tree<'_>,
    path: &str,
) -> Result<Option<Vec<u8>>, String> {
    let Some(entry) = tree
        .lookup_entry_by_path(path)
        .map_err(|e| format!("lookup {path}: {e}"))?
    else {
        return Ok(None);
    };
    if !entry.mode().is_blob() {
        return Ok(None);
    }
    let blob = repo
        .find_object(entry.object_id())
        .map_err(|e| format!("blob {path}: {e}"))?
        .try_into_blob()
        .map_err(|e| format!("{path} is not a blob: {e}"))?;
    Ok(Some(blob.data.clone()))
}

fn looks_binary(data: &[u8]) -> bool {
    data.iter().take(8000).any(|&b| b == 0)
}

fn unified(old: &[u8], new: &[u8]) -> String {
    use gix::diff::blob::{
        unified_diff::{ConsumeHunk, ContextSize, DiffLineKind, HunkHeader},
        Algorithm, Diff, InternedInput, UnifiedDiff,
    };

    /// Renders each hunk in the classic `git diff -u` text form.
    struct Collect(String);
    impl ConsumeHunk for Collect {
        type Out = String;
        fn consume_hunk(
            &mut self,
            header: HunkHeader,
            lines: &[(DiffLineKind, &[u8])],
        ) -> std::io::Result<()> {
            use std::fmt::Write;
            let _ = writeln!(
                self.0,
                "@@ -{},{} +{},{} @@",
                header.before_hunk_start,
                header.before_hunk_len,
                header.after_hunk_start,
                header.after_hunk_len,
            );
            for (kind, content) in lines {
                self.0.push(match kind {
                    DiffLineKind::Context => ' ',
                    DiffLineKind::Add => '+',
                    DiffLineKind::Remove => '-',
                });
                let text = String::from_utf8_lossy(content);
                self.0.push_str(text.trim_end_matches(['\r', '\n']));
                self.0.push('\n');
            }
            Ok(())
        }
        fn finish(self) -> String {
            self.0
        }
    }

    let old = String::from_utf8_lossy(old);
    let new = String::from_utf8_lossy(new);
    let input = InternedInput::new(old.as_ref(), new.as_ref());
    let diff = Diff::compute(Algorithm::Histogram, &input);
    UnifiedDiff::new(
        &diff,
        &input,
        Collect(String::new()),
        ContextSize::default(),
    )
    .consume()
    .unwrap_or_default()
}

/// Diff the commit's tree against its first parent (or the empty tree).
fn changed_files(repo: &gix::Repository, commit: &gix::Commit) -> Result<Vec<FileChange>, String> {
    let tree = commit.tree().map_err(|e| format!("tree: {e}"))?;
    let parent_tree = first_parent_tree(repo, commit)?;

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
