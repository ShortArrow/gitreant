//! Read commits and refs from a local repository via `gix`.

use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap, HashSet};
use std::path::{Path, PathBuf};

use crate::domain::CommitInput;

/// A commit with the metadata needed to render it.
#[derive(Debug, Clone, PartialEq)]
pub struct CommitMeta {
    pub id: String,
    pub summary: String,
    pub author: String,
    /// Committer time, seconds since the Unix epoch.
    pub time: i64,
    /// Parent ids, filtered to commits present in this dataset.
    pub parents: Vec<String>,
}

/// A named reference (branch/tag) pointing at a commit.
#[derive(Debug, Clone, PartialEq)]
pub struct RefInfo {
    pub name: String,
    pub target: String,
}

/// Everything read from one repository.
#[derive(Debug, Clone)]
pub struct RepoData {
    pub name: String,
    pub path: PathBuf,
    /// Commits in topological order: a child always precedes its parents,
    /// newest-first among independent commits.
    pub commits: Vec<CommitMeta>,
    pub refs: Vec<RefInfo>,
    pub head: Option<String>,
}

impl RepoData {
    /// The commits reduced to the layout algorithm's input.
    pub fn commit_inputs(&self) -> Vec<CommitInput> {
        self.commits
            .iter()
            .map(|c| CommitInput {
                id: c.id.clone(),
                parents: c.parents.clone(),
            })
            .collect()
    }
}

/// Discover the repository containing `start` by walking upward for a `.git`.
pub fn discover_repo(start: &Path) -> Result<PathBuf, String> {
    let repo = gix::discover(start).map_err(|e| format!("no git repository at {start:?}: {e}"))?;
    let dir = repo
        .workdir()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| repo.git_dir().to_path_buf());
    Ok(dir)
}

/// Read the repository rooted at `path`.
pub fn read_repo(path: &Path) -> Result<RepoData, String> {
    let repo = gix::discover(path).map_err(|e| format!("open {path:?}: {e}"))?;

    let refs = collect_refs(&repo);
    let head = repo
        .head_id()
        .ok()
        .map(|id| id.detach().to_string());

    let tips: Vec<gix::ObjectId> = refs
        .iter()
        .filter_map(|r| gix::ObjectId::from_hex(r.target.as_bytes()).ok())
        .collect();

    let raw = collect_commits(&repo, &tips);
    let commits = topological_order(raw);

    let name = repo
        .workdir()
        .and_then(|p| p.file_name())
        .or_else(|| path.file_name())
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "repo".to_string());

    Ok(RepoData {
        name,
        path: path.to_path_buf(),
        commits,
        refs,
        head,
    })
}

fn collect_refs(repo: &gix::Repository) -> Vec<RefInfo> {
    let platform = match repo.references() {
        Ok(p) => p,
        Err(_) => return Vec::new(),
    };
    let iter = match platform.all() {
        Ok(i) => i,
        Err(_) => return Vec::new(),
    };
    let mut refs = Vec::new();
    for reference in iter.filter_map(Result::ok) {
        let mut reference = reference;
        let name = reference.name().shorten().to_string();
        if let Ok(id) = reference.peel_to_id() {
            refs.push(RefInfo {
                name,
                target: id.detach().to_string(),
            });
        }
    }
    refs
}

/// A commit collected before ordering.
struct RawCommit {
    id: gix::ObjectId,
    parents: Vec<gix::ObjectId>,
    summary: String,
    author: String,
    time: i64,
}

/// Walk parents from every tip, reading each commit once.
fn collect_commits(repo: &gix::Repository, tips: &[gix::ObjectId]) -> Vec<RawCommit> {
    let mut seen: HashSet<gix::ObjectId> = HashSet::new();
    let mut stack: Vec<gix::ObjectId> = tips.to_vec();
    let mut out = Vec::new();

    while let Some(oid) = stack.pop() {
        if !seen.insert(oid) {
            continue;
        }
        let Ok(object) = repo.find_object(oid) else {
            continue;
        };
        let Ok(commit) = object.try_into_commit() else {
            continue;
        };
        let parents: Vec<gix::ObjectId> = commit.parent_ids().map(|id| id.detach()).collect();
        for parent in &parents {
            if !seen.contains(parent) {
                stack.push(*parent);
            }
        }
        out.push(RawCommit {
            id: oid,
            parents,
            summary: commit_summary(&commit),
            author: commit_author(&commit),
            time: commit_time(&commit),
        });
    }
    out
}

fn commit_summary(commit: &gix::Commit) -> String {
    commit
        .message()
        .map(|m| m.summary().to_string())
        .unwrap_or_default()
}

fn commit_author(commit: &gix::Commit) -> String {
    commit
        .author()
        .map(|a| a.name.to_string())
        .unwrap_or_default()
}

fn commit_time(commit: &gix::Commit) -> i64 {
    commit.time().map(|t| t.seconds).unwrap_or(0)
}

/// Order commits so that every child precedes its parents, preferring newer
/// commits first. Parent references outside the collected set are dropped so the
/// layout never reserves a lane for a commit that never appears (e.g. shallow
/// clone boundaries).
fn topological_order(raw: Vec<RawCommit>) -> Vec<CommitMeta> {
    let present: HashSet<gix::ObjectId> = raw.iter().map(|c| c.id).collect();
    let index: HashMap<gix::ObjectId, usize> =
        raw.iter().enumerate().map(|(i, c)| (c.id, i)).collect();

    // Number of not-yet-emitted children each commit is waiting on.
    let mut pending_children = vec![0usize; raw.len()];
    for commit in &raw {
        for parent in &commit.parents {
            if let Some(&pi) = index.get(parent) {
                pending_children[pi] += 1;
            }
        }
    }

    // Ready = all children already emitted. Emit newest first via a max-heap on time.
    let mut ready: BinaryHeap<HeapItem> = BinaryHeap::new();
    for (i, commit) in raw.iter().enumerate() {
        if pending_children[i] == 0 {
            ready.push(HeapItem {
                time: commit.time,
                id: commit.id,
                index: i,
            });
        }
    }

    let mut ordered = Vec::with_capacity(raw.len());
    while let Some(item) = ready.pop() {
        let commit = &raw[item.index];
        let parents: Vec<String> = commit
            .parents
            .iter()
            .filter(|p| present.contains(*p))
            .map(|p| p.to_string())
            .collect();
        ordered.push(CommitMeta {
            id: commit.id.to_string(),
            summary: commit.summary.clone(),
            author: commit.author.clone(),
            time: commit.time,
            parents,
        });
        for parent in &commit.parents {
            if let Some(&pi) = index.get(parent) {
                pending_children[pi] -= 1;
                if pending_children[pi] == 0 {
                    ready.push(HeapItem {
                        time: raw[pi].time,
                        id: raw[pi].id,
                        index: pi,
                    });
                }
            }
        }
    }

    ordered
}

/// Heap ordering: newest time first, with a stable tie-break by id so results
/// are deterministic.
struct HeapItem {
    time: i64,
    id: gix::ObjectId,
    index: usize,
}

impl PartialEq for HeapItem {
    fn eq(&self, other: &Self) -> bool {
        self.time == other.time && self.id == other.id
    }
}
impl Eq for HeapItem {}
impl Ord for HeapItem {
    fn cmp(&self, other: &Self) -> Ordering {
        self.time
            .cmp(&other.time)
            .then_with(|| self.id.cmp(&other.id))
    }
}
impl PartialOrd for HeapItem {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}
