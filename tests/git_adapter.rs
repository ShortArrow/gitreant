//! Characterization test for the git adapter: build a real repository with a
//! branch and a merge, then check the adapter reads it and the layout is sound.

use std::collections::HashMap;
use std::path::Path;
use std::process::Command;

use gitreant::domain::layout;
use gitreant::git::read_repo;

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
