//! Combine a domain layout with commit metadata into a view for the frontend.

use std::path::Path;

use serde::Serialize;

use crate::domain::{layout, CommitInput, GraphEdge};
use crate::git::{CommitDetail, FileDiff, RepoData, UNCOMMITTED_ID};

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
    /// Author email, kept server-side only (to resolve an avatar via the
    /// cache); never sent to the client.
    #[serde(skip)]
    pub email: String,
    /// The author's GitHub avatar URL, when one is known.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
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
    /// A stash's index/untracked helper commit — the frontend folds these
    /// away unless the stash-internals toggle reveals them.
    #[serde(skip_serializing_if = "is_false")]
    pub stash_internal: bool,
    /// The synthetic uncommitted-changes row above HEAD: how many paths the
    /// working tree changed. Absent on every real commit.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uncommitted: Option<usize>,
}

fn is_false(b: &bool) -> bool {
    !*b
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

/// Another worktree of the repository, as the SPA consumes it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct WorktreeView {
    /// Directory name of the checkout.
    pub name: String,
    /// Absolute path of the checkout; opening it attaches it as its own view.
    pub path: String,
    /// The branch checked out there; absent when its HEAD is detached.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    /// The main worktree, as opposed to a linked one.
    pub main: bool,
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
    /// The repository's other worktrees, so branch badges can say where a
    /// branch is checked out (a branch cannot be switched to twice).
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub worktrees: Vec<WorktreeView>,
    pub refs: Vec<RefView>,
    pub commits: Vec<CommitView>,
    pub edges: Vec<GraphEdge>,
    pub lane_count: usize,
    /// How many commits the repository holds in total — `commits` may be a
    /// paged prefix of them (ADR 0023).
    pub total: usize,
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
            worktrees: Vec::new(),
            refs: Vec::new(),
            commits: Vec::new(),
            edges: Vec::new(),
            lane_count: 0,
            total: 0,
            error: Some(message),
        }
    }

    /// Keep only the first `limit` rows (and the edges fully inside them):
    /// the paged prefix the SPA renders until the user scrolls further.
    pub fn truncate(mut self, limit: usize) -> Self {
        // The changes row is not a commit: a page of `limit` commits keeps
        // it on top rather than trading the last real row for it.
        let limit = limit + usize::from(self.has_changes_row());
        if self.commits.len() <= limit {
            return self;
        }
        self.commits.retain(|c| c.row < limit);
        let kept: std::collections::HashSet<&str> =
            self.commits.iter().map(|c| c.id.as_str()).collect();
        let kept: std::collections::HashSet<String> =
            kept.into_iter().map(str::to_string).collect();
        self.edges
            .retain(|e| kept.contains(&e.from) && kept.contains(&e.to));
        self
    }

    /// Whether row 0 is the synthetic uncommitted-changes row.
    fn has_changes_row(&self) -> bool {
        self.commits
            .first()
            .is_some_and(|c| c.uncommitted.is_some())
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
    /// Nothing changed but the line endings; absent otherwise.
    #[serde(skip_serializing_if = "is_false")]
    pub eol_only: bool,
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
                    eol_only: f.eol_only,
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
///
/// `uncommitted` is how many paths the working tree changed against HEAD;
/// when non-zero (and HEAD exists) a synthetic changes row is laid out as a
/// child of HEAD, so it sits above HEAD in HEAD's lane and the checked-out
/// line runs straight through it.
pub fn build_view(id: &Path, data: &RepoData, uncommitted: usize) -> RepoView {
    let mut inputs = data.commit_inputs();
    let mut spine_head = data.head.as_deref();
    let changes_row = uncommitted > 0 && spine_head.is_some();
    if let (true, Some(head)) = (changes_row, spine_head) {
        inputs.insert(
            0,
            CommitInput {
                id: UNCOMMITTED_ID.to_string(),
                parents: vec![head.to_string()],
                stash: false,
            },
        );
        spine_head = Some(UNCOMMITTED_ID);
    }
    let graph = layout(&inputs, spine_head);

    // `layout` preserves input order, so after the optional changes row
    // node[i] aligns with commits[i].
    let mut nodes = graph.nodes.iter();
    let mut commits = Vec::with_capacity(graph.nodes.len());
    if changes_row {
        let node = nodes.next().expect("the changes row was laid out first");
        commits.push(CommitView {
            id: node.id.clone(),
            row: node.row,
            lane: node.lane,
            color: node.color,
            parents: node.parents.clone(),
            summary: String::new(),
            author: String::new(),
            email: String::new(),
            avatar: None,
            time: 0,
            signature: None,
            verified: None,
            signature_key: None,
            stash_internal: false,
            uncommitted: Some(uncommitted),
        });
    }
    commits.extend(nodes.zip(&data.commits).map(|(node, meta)| CommitView {
        id: node.id.clone(),
        row: node.row,
        lane: node.lane,
        color: node.color,
        parents: node.parents.clone(),
        summary: meta.summary.clone(),
        author: meta.author.clone(),
        // Resolve the free (no-network) avatar now; the gh fallback fills
        // the rest later from the server's cache (see `read_one`).
        avatar: crate::git::noreply_avatar_url(&meta.email),
        email: meta.email.clone(),
        time: meta.time,
        signature: meta.signature.clone(),
        verified: meta.verified,
        signature_key: meta.signature_key.clone(),
        stash_internal: node.stash_internal,
        uncommitted: None,
    }));

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

    let worktrees = data
        .worktrees
        .iter()
        .map(|w| WorktreeView {
            name: w.name.clone(),
            // Canonical like the list's, so both name one path the same way.
            path: super::canonical(&w.path).to_string_lossy().into_owned(),
            branch: w.branch.clone(),
            main: w.main,
        })
        .collect();

    RepoView {
        id: id.to_string_lossy().into_owned(),
        name: data.name.clone(),
        path: data.path.to_string_lossy().into_owned(),
        head: data.head.clone(),
        head_branch: data.head_branch.clone(),
        github_url: data.github_url.clone(),
        worktrees,
        refs,
        total: data.commits.len(),
        commits,
        edges: graph.edges,
        lane_count: graph.lane_count,
        error: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::{CommitMeta, RepoData, UNCOMMITTED_ID};
    use std::path::PathBuf;

    fn meta(id: &str, parents: &[&str], summary: &str, time: i64) -> CommitMeta {
        CommitMeta {
            id: id.to_string(),
            summary: summary.to_string(),
            author: "Tester".to_string(),
            email: "tester@example.com".to_string(),
            time,
            parents: parents.iter().map(|s| s.to_string()).collect(),
            signature: None,
            verified: None,
            signature_key: None,
        }
    }

    #[test]
    fn stash_internal_marks_survive_into_the_serialized_view() {
        // The layout marks a stash's helper parents; the view must carry that
        // through to the client or the frontend fold never happens.
        let data = RepoData {
            name: "wip".to_string(),
            path: PathBuf::from("/tmp/wip"),
            commits: vec![
                meta("S", &["Base", "Idx", "Unt"], "WIP on main", 1010),
                meta("Idx", &["Base"], "index on main", 1010),
                meta("Unt", &[], "untracked files on main", 1010),
                meta("Base", &[], "base", 1000),
            ],
            refs: vec![crate::git::RefInfo {
                name: "stash".to_string(),
                target: "S".to_string(),
                remote: None,
                kind: "stash".to_string(),
            }],
            head: None,
            head_branch: None,
            github_url: None,
            worktrees: vec![],
        };

        let view = build_view(Path::new("/tmp/wip"), &data, 0);
        let internal = |id: &str| {
            view.commits
                .iter()
                .find(|c| c.id == id)
                .unwrap()
                .stash_internal
        };
        assert!(internal("Idx"), "index helper must be marked");
        assert!(internal("Unt"), "untracked helper must be marked");
        assert!(!internal("S"));
        assert!(!internal("Base"));

        // And the flag actually serializes (skip_serializing_if must only
        // drop the false case).
        let json = serde_json::to_string(&view).unwrap();
        assert!(
            json.contains("\"stash_internal\":true"),
            "flag missing from the wire format: {json}"
        );
    }

    fn linear(head: Option<&str>) -> RepoData {
        RepoData {
            name: "demo".to_string(),
            path: PathBuf::from("/tmp/demo"),
            commits: vec![
                meta("A", &["B"], "second", 1001),
                meta("B", &[], "first", 1000),
            ],
            refs: vec![],
            head: head.map(str::to_string),
            head_branch: head.map(|_| "main".to_string()),
            github_url: None,
            worktrees: vec![],
        }
    }

    #[test]
    fn uncommitted_changes_become_a_row_above_head() {
        let view = build_view(Path::new("/tmp/demo"), &linear(Some("A")), 2);

        let wip = &view.commits[0];
        assert_eq!(wip.id, UNCOMMITTED_ID);
        assert_eq!(wip.uncommitted, Some(2));
        assert_eq!((wip.row, wip.lane), (0, 0));
        assert_eq!(wip.parents, vec!["A".to_string()]);
        // The real history follows, shifted down one row; HEAD keeps its lane.
        assert_eq!(view.commits[1].id, "A");
        assert_eq!((view.commits[1].row, view.commits[1].lane), (1, 0));
        assert_eq!(view.commits[1].uncommitted, None);
        assert_eq!(view.head.as_deref(), Some("A"));
        // The synthetic row is not a commit: the count and the edge say so.
        assert_eq!(view.total, 2);
        let edge = view
            .edges
            .iter()
            .find(|e| e.from == UNCOMMITTED_ID)
            .expect("an edge from the changes to HEAD");
        assert_eq!(edge.to, "A");
        assert_eq!((edge.from_lane, edge.to_lane), (0, 0));

        let json = serde_json::to_string(&view).unwrap();
        assert!(json.contains("\"uncommitted\":2"), "count missing: {json}");
        assert_eq!(
            json.matches("\"uncommitted\":").count(),
            1,
            "real commits must not carry the key: {json}"
        );
    }

    #[test]
    fn no_changes_row_without_changes_or_without_head() {
        let clean = build_view(Path::new("/tmp/demo"), &linear(Some("A")), 0);
        assert_eq!(clean.commits[0].id, "A");
        assert!(clean.commits.iter().all(|c| c.uncommitted.is_none()));

        let detached_nowhere = build_view(Path::new("/tmp/demo"), &linear(None), 3);
        assert_eq!(detached_nowhere.commits[0].id, "A");
        assert_eq!(detached_nowhere.commits.len(), 2);
    }

    #[test]
    fn truncate_keeps_the_changes_row_on_top_of_a_full_page() {
        let view = build_view(Path::new("/tmp/demo"), &linear(Some("A")), 1);
        let page = view.truncate(1);
        let ids: Vec<&str> = page.commits.iter().map(|c| c.id.as_str()).collect();
        assert_eq!(ids, vec![UNCOMMITTED_ID, "A"]);
        assert_eq!(page.edges.len(), 1);
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
            worktrees: vec![],
        };

        let view = build_view(Path::new("/tmp/demo"), &data, 0);

        assert_eq!(view.commits.len(), 2);
        assert_eq!(view.commits[0].id, "A");
        assert_eq!(view.commits[0].summary, "second");
        assert_eq!(view.commits[0].row, 0);
        assert_eq!(view.commits[1].summary, "first");
        assert_eq!(view.lane_count, 1);
        assert!(view.error.is_none());
    }
}
