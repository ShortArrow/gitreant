//! Read commits and refs from a local repository via `gix`.

use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap, HashSet};
use std::path::{Path, PathBuf};

use super::detail::signature_kind;
use crate::domain::CommitInput;

/// A commit with the metadata needed to render it.
#[derive(Debug, Clone, PartialEq)]
pub struct CommitMeta {
    pub id: String,
    pub summary: String,
    pub author: String,
    /// Author email, used only to resolve a GitHub avatar (never displayed).
    pub email: String,
    /// Committer time, seconds since the Unix epoch.
    pub time: i64,
    /// Parent ids, filtered to commits present in this dataset.
    pub parents: Vec<String>,
    /// Kind of the embedded signature ("openpgp", "ssh", ...), if signed.
    /// Presence only — the gix read never verifies.
    pub signature: Option<String>,
    /// Verification verdict, filled in later by the session when gpg is
    /// available: `Some(true)` valid, `Some(false)` invalid, `None` unchecked.
    pub verified: Option<bool>,
    /// Signing key id (`%GK`), filled in alongside `verified`.
    pub signature_key: Option<String>,
}

/// A named reference (branch/tag/stash) pointing at a commit.
#[derive(Debug, Clone, PartialEq)]
pub struct RefInfo {
    /// Short name; for remote-tracking refs the remote prefix is split off
    /// into `remote` ("refs/remotes/origin/main" -> "main" + "origin").
    pub name: String,
    pub target: String,
    pub remote: Option<String>,
    /// "branch", "tag", "stash" or "other" — the UI renders them apart.
    pub kind: String,
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
    /// Short name of the checked-out branch; None when HEAD is detached.
    pub head_branch: Option<String>,
    /// Web URL of the origin remote, when it points at github.com.
    pub github_url: Option<String>,
}

impl RepoData {
    /// The commits reduced to the layout algorithm's input.
    pub fn commit_inputs(&self) -> Vec<CommitInput> {
        let stashes: HashSet<&str> = self
            .refs
            .iter()
            .filter(|r| r.kind == "stash")
            .map(|r| r.target.as_str())
            .collect();
        self.commits
            .iter()
            .map(|c| CommitInput {
                id: c.id.clone(),
                parents: c.parents.clone(),
                stash: stashes.contains(c.id.as_str()),
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
    read_repo_with_progress(path, |_| {})
}

/// Like [`read_repo`], reporting the running commit count after every
/// commit read, so a slow walk can surface progress.
pub fn read_repo_with_progress(
    path: &Path,
    on_commits: impl FnMut(usize),
) -> Result<RepoData, String> {
    let repo = gix::discover(path).map_err(|e| format!("open {path:?}: {e}"))?;

    let refs = collect_refs(&repo);
    let head = repo.head_id().ok().map(|id| id.detach().to_string());
    let head_branch = repo
        .head_name()
        .ok()
        .flatten()
        .map(|name| name.shorten().to_string());
    let github_url = repo
        .config_snapshot()
        .string("remote.origin.url")
        .and_then(|url| github_web_url(&url.to_string()));

    let tips: Vec<gix::ObjectId> = refs
        .iter()
        .filter_map(|r| gix::ObjectId::from_hex(r.target.as_bytes()).ok())
        .collect();

    let raw = collect_commits(&repo, &tips, on_commits);
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
        head_branch,
        github_url,
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
        let full = reference.name().as_bstr().to_string();
        // A remote's symbolic HEAD (refs/remotes/<remote>/HEAD) just points at
        // that remote's default branch; it is not a branch of its own, and git
        // tools omit it. Showing it would double the default branch under a
        // bogus "HEAD" badge.
        if full.starts_with("refs/remotes/") && full.ends_with("/HEAD") {
            continue;
        }
        let (name, remote, kind) = classify(&full, &reference.name().shorten().to_string());
        if let Ok(id) = reference.peel_to_id() {
            refs.push(RefInfo {
                name,
                target: id.detach().to_string(),
                remote,
                kind,
            });
        }
    }
    refs
}

/// Break a full ref name into its display name, remote and kind.
fn classify(full: &str, short: &str) -> (String, Option<String>, String) {
    if let Some((remote, branch)) = full
        .strip_prefix("refs/remotes/")
        .and_then(|rest| rest.split_once('/'))
    {
        return (
            branch.to_string(),
            Some(remote.to_string()),
            "branch".to_string(),
        );
    }
    if let Some(name) = full.strip_prefix("refs/heads/") {
        return (name.to_string(), None, "branch".to_string());
    }
    if let Some(name) = full.strip_prefix("refs/tags/") {
        return (name.to_string(), None, "tag".to_string());
    }
    if full == "refs/stash" {
        return ("stash".to_string(), None, "stash".to_string());
    }
    (short.to_string(), None, "other".to_string())
}

/// The GitHub web URL for a clone URL, when it points at github.com.
///
/// Handles "https://github.com/o/r(.git)", "git@github.com:o/r(.git)" and
/// "ssh://git@github.com/o/r(.git)"; anything else is None.
pub fn github_web_url(clone_url: &str) -> Option<String> {
    let rest = clone_url
        .strip_prefix("https://github.com/")
        .or_else(|| clone_url.strip_prefix("git@github.com:"))
        .or_else(|| clone_url.strip_prefix("ssh://git@github.com/"))?;
    let path = rest
        .strip_suffix(".git")
        .unwrap_or(rest)
        .trim_end_matches('/');
    let mut parts = path.splitn(2, '/');
    let owner = parts.next().filter(|s| !s.is_empty())?;
    let repo = parts.next().filter(|s| !s.is_empty() && !s.contains('/'))?;
    Some(format!("https://github.com/{owner}/{repo}"))
}

/// A commit collected before ordering.
struct RawCommit {
    id: gix::ObjectId,
    parents: Vec<gix::ObjectId>,
    summary: String,
    author: String,
    email: String,
    time: i64,
    signature: Option<String>,
}

/// Walk parents from every tip, reading each commit once.
fn collect_commits(
    repo: &gix::Repository,
    tips: &[gix::ObjectId],
    mut on_commits: impl FnMut(usize),
) -> Vec<RawCommit> {
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
            email: commit_email(&commit),
            time: commit_time(&commit),
            signature: signature_kind(&commit),
        });
        on_commits(out.len());
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

fn commit_email(commit: &gix::Commit) -> String {
    commit
        .author()
        .map(|a| a.email.to_string())
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
            email: commit.email.clone(),
            time: commit.time,
            parents,
            signature: commit.signature.clone(),
            verified: None,
            signature_key: None,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn github_web_url_normalizes_the_common_clone_forms() {
        for url in [
            "https://github.com/owner/repo.git",
            "https://github.com/owner/repo",
            "git@github.com:owner/repo.git",
            "ssh://git@github.com/owner/repo.git",
        ] {
            assert_eq!(
                github_web_url(url).as_deref(),
                Some("https://github.com/owner/repo"),
                "for {url}"
            );
        }
    }

    #[test]
    fn classify_separates_branches_tags_stash_and_remotes() {
        assert_eq!(
            classify("refs/heads/main", "main"),
            ("main".into(), None, "branch".into())
        );
        assert_eq!(
            classify("refs/remotes/origin/main", "origin/main"),
            ("main".into(), Some("origin".into()), "branch".into())
        );
        assert_eq!(
            classify("refs/tags/v1.0", "v1.0"),
            ("v1.0".into(), None, "tag".into())
        );
        assert_eq!(
            classify("refs/stash", "stash"),
            ("stash".into(), None, "stash".into())
        );
        assert_eq!(
            classify("refs/notes/commits", "notes/commits"),
            ("notes/commits".into(), None, "other".into())
        );
    }

    #[test]
    fn github_web_url_rejects_other_hosts_and_shapes() {
        assert_eq!(github_web_url("https://gitlab.com/o/r.git"), None);
        assert_eq!(github_web_url("../local/path"), None);
        assert_eq!(github_web_url("https://github.com/only-owner"), None);
    }

    fn oid(hex: &str) -> gix::ObjectId {
        gix::ObjectId::from_hex(hex.as_bytes()).expect("valid 40-hex object id")
    }

    fn raw(id: gix::ObjectId, parents: &[gix::ObjectId], time: i64) -> RawCommit {
        RawCommit {
            id,
            parents: parents.to_vec(),
            summary: String::new(),
            author: String::new(),
            email: String::new(),
            time,
            signature: None,
        }
    }

    #[test]
    fn stash_helper_commits_stay_below_the_stash_commit() {
        // `git stash` writes three commits that share one timestamp: the stash
        // commit itself and its index and untracked-files parents. The
        // untracked parent has no parents of its own — nothing but the stash
        // points at it — so with identical times a naive time sort could float
        // it above the stash. Topological order must keep every child (here the
        // stash) strictly before its parents regardless of the tie.
        // These are the real ids from V:\RqmGuiWithMacro that read reversed.
        let t = 1_752_134_250; // the shared stash timestamp
        let stash = oid("2e67720893b8bf9327d659e55b2aff48952dec02");
        let untracked = oid("6c439db34558180d4a217168c1f0cf7734d1fbf9");
        let base = oid("8ef96920000000000000000000000000000000aa");
        let index = oid("5911c460000000000000000000000000000000bb");
        let tip = oid("aaaaaaaa0000000000000000000000000000ffff");

        let ordered = topological_order(vec![
            raw(tip, &[base], t + 100),          // main tip, newer than the stash
            raw(stash, &[base, index, untracked], t),
            raw(index, &[base], t),
            raw(untracked, &[], t),
            raw(base, &[], t - 100),
        ]);

        let pos = |id: gix::ObjectId| {
            ordered
                .iter()
                .position(|c| c.id == id.to_string())
                .unwrap_or_else(|| panic!("{id} missing from order"))
        };
        assert!(
            pos(stash) < pos(untracked),
            "the stash commit must render above its untracked parent"
        );
        assert!(
            pos(stash) < pos(index),
            "the stash commit must render above its index parent"
        );
        assert!(pos(index) < pos(base), "children precede the shared base");
    }

    #[test]
    fn a_newer_commit_stays_above_an_older_stash_trio() {
        // The real V:\RqmGuiWithMacro shape: c25f91b (17:18:25) is not a tip —
        // its child chain is newer still — while the stash trio shares
        // 17:17:30. The newer commit must sort above the whole trio, matching
        // `git log --date-order`.
        let t = 1_783_671_450; // the stash trio's shared timestamp
        let stash = oid("2e67720893b8bf9327d659e55b2aff48952dec02");
        let index = oid("5911c460000000000000000000000000000000bb");
        let untracked = oid("6c439db34558180d4a217168c1f0cf7734d1fbf9");
        let base = oid("8ef96920000000000000000000000000000000aa");
        let newer = oid("c25f91bf5878fa3b58d04b3a6ecddd12340e8479");
        let child = oid("6178985000000000000000000000000000000cc0");

        let ordered = topological_order(vec![
            raw(child, &[newer], t + 230_000), // tip, days later
            raw(newer, &[base], t + 55),
            raw(stash, &[base, index, untracked], t),
            raw(index, &[base], t),
            raw(untracked, &[], t),
            raw(base, &[], t - 100),
        ]);

        let pos = |id: gix::ObjectId| {
            ordered
                .iter()
                .position(|c| c.id == id.to_string())
                .unwrap_or_else(|| panic!("{id} missing from order"))
        };
        assert!(pos(child) < pos(newer));
        assert!(
            pos(newer) < pos(stash),
            "the newer commit must render above the stash"
        );
        assert!(pos(newer) < pos(untracked));
        assert!(pos(stash) < pos(untracked));
    }
}
