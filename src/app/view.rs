//! Combine a domain layout with commit metadata into a view for the frontend.

use std::path::Path;

use serde::Serialize;

use crate::domain::{layout, GraphEdge};
use crate::git::RepoData;

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
}

/// A named reference pointing at a commit.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RefView {
    pub name: String,
    pub target: String,
}

/// One repository as the SPA consumes it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RepoView {
    /// Stable identity (the canonical path) used as a key by the frontend.
    pub id: String,
    pub name: String,
    pub path: String,
    pub head: Option<String>,
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
            refs: Vec::new(),
            commits: Vec::new(),
            edges: Vec::new(),
            lane_count: 0,
            error: Some(message),
        }
    }
}

/// Build the view for `data`, keyed by `id` (its canonical path).
pub fn build_view(id: &Path, data: &RepoData) -> RepoView {
    let graph = layout(&data.commit_inputs());

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
        })
        .collect();

    let refs = data
        .refs
        .iter()
        .map(|r| RefView {
            name: r.name.clone(),
            target: r.target.clone(),
        })
        .collect();

    RepoView {
        id: id.to_string_lossy().into_owned(),
        name: data.name.clone(),
        path: data.path.to_string_lossy().into_owned(),
        head: data.head.clone(),
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
