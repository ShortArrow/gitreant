//! Characterization test for the git adapter: build a real repository with a
//! branch and a merge, then check the adapter reads it and the layout is sound.

use std::collections::HashMap;
use std::path::Path;
use std::process::Command;

use gitreant::domain::layout;
use gitreant::git::{read_commit, read_repo};

fn git(dir: &Path, args: &[&str]) {
    let status = Command::new("git")
        .current_dir(dir)
        .args(args)
        .env("GIT_AUTHOR_NAME", "Tester")
        .env("GIT_AUTHOR_EMAIL", "tester@example.com")
        .env("GIT_COMMITTER_NAME", "Tester")
        .env("GIT_COMMITTER_EMAIL", "tester@example.com")
        .status()
        .expect("run git");
    assert!(status.success(), "git {:?} failed", args);
}

/// Commit with a controlled timestamp so ordering is deterministic.
fn commit(dir: &Path, message: &str, epoch: i64) {
    let date = format!("@{epoch} +0000");
    let status = Command::new("git")
        .current_dir(dir)
        .args(["commit", "--allow-empty", "-m", message])
        .env("GIT_AUTHOR_NAME", "Tester")
        .env("GIT_AUTHOR_EMAIL", "tester@example.com")
        .env("GIT_COMMITTER_NAME", "Tester")
        .env("GIT_COMMITTER_EMAIL", "tester@example.com")
        .env("GIT_AUTHOR_DATE", &date)
        .env("GIT_COMMITTER_DATE", &date)
        .status()
        .expect("run git commit");
    assert!(status.success(), "git commit failed");
}

#[test]
fn remote_refs_carry_their_remote_name() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path();

    git(dir, &["init", "-q", "-b", "main"]);
    git(dir, &["config", "commit.gpgsign", "false"]);
    commit(dir, "root", 1000);
    git(dir, &["update-ref", "refs/remotes/origin/main", "HEAD"]);

    let repo = read_repo(dir).expect("read repo");

    let local = repo
        .refs
        .iter()
        .find(|r| r.name == "main" && r.remote.is_none())
        .expect("local main ref");
    let remote = repo
        .refs
        .iter()
        .find(|r| r.remote.as_deref() == Some("origin"))
        .expect("remote-tracking ref");
    assert_eq!(remote.name, "main");
    assert_eq!(remote.target, local.target);
}

#[test]
fn reads_commit_detail_with_message_body_and_file_changes() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path();

    git(dir, &["init", "-q", "-b", "main"]);
    git(dir, &["config", "commit.gpgsign", "false"]);

    std::fs::write(dir.join("README.md"), "one\ntwo\n").unwrap();
    git(dir, &["add", "README.md"]);
    commit(dir, "add README", 1000);

    std::fs::write(dir.join("README.md"), "one\nTWO\nthree\n").unwrap();
    std::fs::write(dir.join("notes.txt"), "hello\n").unwrap();
    git(dir, &["add", "README.md", "notes.txt"]);
    commit(dir, "update README and add notes\n\nExplains why the notes exist.", 1001);

    let repo = read_repo(dir).expect("read repo");
    let head = &repo.commits[0];
    let root = &repo.commits[1];

    let detail = read_commit(dir, &head.id).expect("read head detail");
    assert_eq!(detail.id, head.id);
    assert!(
        detail.message.contains("Explains why the notes exist."),
        "full message body missing: {:?}",
        detail.message
    );
    assert_eq!(detail.author, "Tester");
    assert_eq!(detail.email, "tester@example.com");
    assert_eq!(detail.parents, vec![root.id.clone()]);

    // README.md modified (1 line replaced + 1 added), notes.txt added.
    let mut files = detail.files.clone();
    files.sort_by(|a, b| a.path.cmp(&b.path));
    assert_eq!(files.len(), 2, "files: {files:?}");
    assert_eq!(files[0].path, "README.md");
    assert_eq!(files[0].status, "M");
    assert_eq!((files[0].additions, files[0].deletions), (2, 1));
    assert_eq!(files[1].path, "notes.txt");
    assert_eq!(files[1].status, "A");
    assert_eq!((files[1].additions, files[1].deletions), (1, 0));

    // The root commit diffs against the empty tree: everything is an addition.
    let detail = read_commit(dir, &root.id).expect("read root detail");
    assert!(detail.parents.is_empty());
    assert_eq!(detail.files.len(), 1);
    assert_eq!(detail.files[0].status, "A");
    assert_eq!(detail.files[0].additions, 2);

    // An unknown id is an error, not a panic.
    assert!(read_commit(dir, "0000000000000000000000000000000000000000").is_err());
}

#[test]
fn commit_detail_reports_signature_presence() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path();

    git(dir, &["init", "-q", "-b", "main"]);
    git(dir, &["config", "commit.gpgsign", "false"]);
    commit(dir, "root", 1000);

    let repo = read_repo(dir).expect("read repo");
    let unsigned = read_commit(dir, &repo.commits[0].id).expect("unsigned detail");
    assert_eq!(unsigned.signature, None);

    // Craft a commit object with a (fake) OpenPGP signature header; only the
    // header's presence is detected, no verification happens.
    let tree = git_stdout(dir, &["rev-parse", "HEAD^{tree}"]);
    let raw = format!(
        "tree {tree}\n\
         author Tester <tester@example.com> 1000 +0000\n\
         committer Tester <tester@example.com> 1000 +0000\n\
         gpgsig -----BEGIN PGP SIGNATURE-----\n \n fake\n -----END PGP SIGNATURE-----\n\
         \nsigned commit\n"
    );
    let id = git_hash_commit(dir, &raw);
    let signed = read_commit(dir, &id).expect("signed detail");
    assert_eq!(signed.signature.as_deref(), Some("openpgp"));
}

fn git_stdout(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .current_dir(dir)
        .args(args)
        .output()
        .expect("run git");
    assert!(out.status.success(), "git {args:?} failed");
    String::from_utf8(out.stdout).unwrap().trim().to_string()
}

/// Store a raw commit object and return its id.
fn git_hash_commit(dir: &Path, raw: &str) -> String {
    use std::io::Write;
    use std::process::Stdio;
    let mut child = Command::new("git")
        .current_dir(dir)
        .args(["hash-object", "-w", "-t", "commit", "--literally", "--stdin"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("spawn git hash-object");
    child
        .stdin
        .take()
        .unwrap()
        .write_all(raw.as_bytes())
        .unwrap();
    let out = child.wait_with_output().unwrap();
    assert!(out.status.success(), "git hash-object failed");
    String::from_utf8(out.stdout).unwrap().trim().to_string()
}

#[test]
fn reads_branch_and_merge_repo() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path();

    git(dir, &["init", "-q", "-b", "main"]);
    git(dir, &["config", "commit.gpgsign", "false"]);
    commit(dir, "root", 1000);
    commit(dir, "main-1", 1001);
    git(dir, &["switch", "-c", "feature", "-q"]);
    commit(dir, "feature-1", 1002);
    git(dir, &["switch", "main", "-q"]);
    commit(dir, "main-2", 1003);
    git(dir, &["merge", "--no-ff", "feature", "-q", "-m", "merge feature"]);

    let repo = read_repo(dir).expect("read repo");

    // root, main-1, feature-1, main-2, and the merge = 5 commits.
    assert_eq!(repo.commits.len(), 5, "unexpected commit count");

    // The merge commit is newest and has two parents.
    let merge = &repo.commits[0];
    assert_eq!(merge.summary, "merge feature");
    assert_eq!(merge.parents.len(), 2);

    // Topological invariant: every parent appears after its child.
    let position: HashMap<&str, usize> = repo
        .commits
        .iter()
        .enumerate()
        .map(|(i, c)| (c.id.as_str(), i))
        .collect();
    for (i, c) in repo.commits.iter().enumerate() {
        for parent in &c.parents {
            let pi = position[parent.as_str()];
            assert!(pi > i, "parent {parent} must come after child {}", c.id);
        }
    }

    // Refs include both branches.
    let ref_names: Vec<&str> = repo.refs.iter().map(|r| r.name.as_str()).collect();
    assert!(ref_names.contains(&"main"), "refs: {ref_names:?}");
    assert!(ref_names.contains(&"feature"), "refs: {ref_names:?}");
    assert!(repo.head.is_some());

    // The layout spans two lanes (main + feature) and places every commit.
    let graph = layout(&repo.commit_inputs());
    assert_eq!(graph.nodes.len(), 5);
    assert!(graph.lane_count >= 2, "expected >=2 lanes, got {}", graph.lane_count);
}
