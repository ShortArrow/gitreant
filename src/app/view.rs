//! Combine a domain layout with commit metadata into a view for the frontend.

use std::path::Path;

use serde::Serialize;

use crate::domain::{layout, GraphEdge};
use crate::git::{CommitDetail, FileDiff, RepoData};

/// A commit positioned on the grid, with the metadata needed to render it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CommitView {
    pub id: String,
    pub row: usize,
    pub lane: usize,
    pub color: usize,
    pub parents: Vec<String>,
    pub summary: String,
    pub author: String,
    pub time: i64,
    /// Kind of the embedded signature ("openpgp", "ssh", ...), if signed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
    /// `true` when gpg verified the signature, `false` when it judged it
    /// invalid; absent when unchecked (no gpg, unknown key, unsigned).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verified: Option<bool>,
    /// Signing key id, when gpg could attribute one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature_key: Option<String>,
}

/// A named reference pointing at a commit.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RefView {
    /// Short name; remote-tracking refs carry the remote separately.
    pub name: String,
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remote: Option<String>,
    /// "branch", "tag", "stash" or "other" — rendered as distinct badges.
    pub kind: String,
}

/// One repository as the SPA consumes it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RepoView {
    /// Stable identity (the canonical path) used as a key by the frontend.
    pub id: String,
    pub name: String,
    pub path: String,
    pub head: Option<String>,
    /// Short name of the checked-out branch; absent when HEAD is detached.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub head_branch: Option<String>,
    /// Web URL of the origin remote, when it points at github.com.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub github_url: Option<String>,
    pub refs: Vec<RefView>,
    pub commits: Vec<CommitView>,
    pub edges: Vec<GraphEdge>,
    pub lane_count: usize,
    /// Set when the repository could not be read; `commits`/`edges` are empty.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl RepoView {
    /// A placeholder view for a repository that failed to read.
    pub fn error(path: &Path, message: String) -> Self {
        RepoView {
            id: path.to_string_lossy().into_owned(),
            name: path
                .file_name()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| "repo".to_string()),
            path: path.to_string_lossy().into_owned(),
            head: None,
            head_branch: None,
            github_url: None,
            refs: Vec::new(),
            commits: Vec::new(),
            edges: Vec::new(),
            lane_count: 0,
            error: Some(message),
        }
    }
}

/// One changed file of a commit, as the SPA consumes it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct FileChangeView {
    pub path: String,
    /// "A" (added), "M" (modified), "D" (deleted) or "R" (rewritten).
    pub status: String,
    pub additions: usize,
    pub deletions: usize,
}

/// A single commit's details, as the SPA consumes them.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CommitDetailView {
    pub id: String,
    /// Full commit message (summary and body).
    pub message: String,
    pub author: String,
    pub email: String,
    pub time: i64,
    pub parents: Vec<String>,
    /// Kind of the embedded signature ("openpgp", "ssh", ...), if signed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
    /// Changes against the first parent (or the empty tree for a root commit).
    pub files: Vec<FileChangeView>,
}

impl From<CommitDetail> for CommitDetailView {
    fn from(detail: CommitDetail) -> Self {
        CommitDetailView {
            id: detail.id,
            message: detail.message,
            author: detail.author,
            email: detail.email,
            time: detail.time,
            parents: detail.parents,
            signature: detail.signature,
            files: detail
                .files
                .into_iter()
                .map(|f| FileChangeView {
                    path: f.path,
                    status: f.status,
                    additions: f.additions,
                    deletions: f.deletions,
                })
                .collect(),
        }
    }
}

/// One file's unified diff, as the SPA consumes it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct FileDiffView {
    pub path: String,
    /// "A" (added), "M" (modified) or "D" (deleted).
    pub status: String,
    /// True when either side looks binary; `text` is empty then.
    pub binary: bool,
    /// Unified diff hunks ("@@ ..." headers with -/+/context lines).
    pub text: String,
}

impl From<FileDiff> for FileDiffView {
    fn from(diff: FileDiff) -> Self {
        FileDiffView {
            path: diff.path,
            status: diff.status,
            binary: diff.binary,
            text: diff.text,
        }
    }
}

/// Build the view for `data`, keyed by `id` (its canonical path).
pub fn build_view(id: &Path, data: &RepoData) -> RepoView {
    let graph = layout(&data.commit_inputs(), data.head.as_deref());

    // `layout` preserves input order, so node[i] aligns with commits[i].
    let commits = graph
        .nodes
        .iter()
        .zip(&data.commits)
        .map(|(node, meta)| CommitView {
            id: node.id.clone(),
            row: node.row,
            lane: node.lane,
            color: node.color,
            parents: node.parents.clone(),
            summary: meta.summary.clone(),
            author: meta.author.clone(),
            time: meta.time,
            signature: meta.signature.clone(),
            verified: meta.verified,
            signature_key: meta.signature_key.clone(),
        })
        .collect();

    let refs = data
        .refs
        .iter()
        .map(|r| RefView {
            name: r.name.clone(),
            target: r.target.clone(),
            remote: r.remote.clone(),
            kind: r.kind.clone(),
        })
        .collect();

    RepoView {
        id: id.to_string_lossy().into_owned(),
        name: data.name.clone(),
        path: data.path.to_string_lossy().into_owned(),
        head: data.head.clone(),
        head_branch: data.head_branch.clone(),
        github_url: data.github_url.clone(),
        refs,
        commits,
        edges: graph.edges,
        lane_count: graph.lane_count,
        error: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::{CommitMeta, RepoData};
    use std::path::PathBuf;

    fn meta(id: &str, parents: &[&str], summary: &str, time: i64) -> CommitMeta {
        CommitMeta {
            id: id.to_string(),
            summary: summary.to_string(),
            author: "Tester".to_string(),
            time,
            parents: parents.iter().map(|s| s.to_string()).collect(),
            signature: None,
            verified: None,
            signature_key: None,
        }
    }


    #[test]
    fn merges_layout_with_metadata_in_order() {
        let data = RepoData {
            name: "demo".to_string(),
            path: PathBuf::from("/tmp/demo"),
            commits: vec![
                meta("A", &["B"], "second", 1001),
                meta("B", &[], "first", 1000),
            ],
            refs: vec![],
            head: Some("A".to_string()),
            head_branch: Some("main".to_string()),
            github_url: None,
        };

        let view = build_view(Path::new("/tmp/demo"), &data);

        assert_eq!(view.commits.len(), 2);
        assert_eq!(view.commits[0].id, "A");
        assert_eq!(view.commits[0].summary, "second");
        assert_eq!(view.commits[0].row, 0);
        assert_eq!(view.commits[1].summary, "first");
        assert_eq!(view.lane_count, 1);
        assert!(view.error.is_none());
    }
}
