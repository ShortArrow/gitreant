//! Characterization test for the git adapter: build a real repository with a
//! branch and a merge, then check the adapter reads it and the layout is sound.

use std::collections::HashMap;
use std::path::Path;
use std::process::Command;

use gitreant::domain::layout;
use gitreant::git::{
    gitlink_updates, read_commit, read_commit_diff, read_file_diff, read_repo,
    read_repo_with_progress, read_status, read_submodules, read_uncommitted,
    read_uncommitted_diff, read_uncommitted_diffs, read_worktrees, uncommitted_paths,
    FileChange, UNCOMMITTED_ID,
};

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
fn reading_reports_a_running_commit_count() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path();
    git(dir, &["init", "-q", "-b", "main"]);
    git(dir, &["config", "commit.gpgsign", "false"]);
    for i in 0..3 {
        commit(dir, &format!("c{i}"), 1000 + i);
    }

    let mut counts = Vec::new();
    let repo = read_repo_with_progress(dir, |n| counts.push(n)).expect("read repo");
    assert_eq!(counts, vec![1, 2, 3]);
    assert_eq!(repo.commits.len(), 3);
}

#[test]
fn remote_refs_carry_their_remote_name() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path();

    git(dir, &["init", "-q", "-b", "main"]);
    git(dir, &["config", "commit.gpgsign", "false"]);
    commit(dir, "root", 1000);
    git(dir, &["update-ref", "refs/remotes/origin/main", "HEAD"]);
    // The remote's symbolic HEAD (origin/HEAD -> origin/main) must not
    // surface as a bogus "HEAD" branch badge.
    git(
        dir,
        &[
            "symbolic-ref",
            "refs/remotes/origin/HEAD",
            "refs/remotes/origin/main",
        ],
    );

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
    assert!(
        !repo.refs.iter().any(|r| r.name == "HEAD"),
        "the remote symbolic HEAD must be excluded"
    );
}

#[test]
fn read_status_counts_uncommitted_unpushed_and_local_branches() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path();
    git(dir, &["init", "-q", "-b", "main"]);
    git(dir, &["config", "commit.gpgsign", "false"]);
    commit(dir, "root", 1000);
    // An untracked file is an uncommitted change.
    std::fs::write(dir.join("new.txt"), "hi\n").unwrap();
    // A second branch that tracks no upstream.
    git(dir, &["branch", "feature"]);

    let status = read_status(dir);
    assert_eq!(status.dirty, 1, "one untracked file");
    // The drawer counts exactly what the graph's changes row counts, and
    // both list untracked files the way the user's git status does: an
    // untracked directory is one entry under the default setting.
    std::fs::create_dir(dir.join("scratch")).unwrap();
    std::fs::write(dir.join("scratch/a.txt"), "a\n").unwrap();
    std::fs::write(dir.join("scratch/b.txt"), "b\n").unwrap();
    assert_eq!(read_status(dir).dirty, uncommitted_paths(dir).len());
    assert_eq!(read_status(dir).dirty, 2);
    git(dir, &["config", "status.showUntrackedFiles", "all"]);
    assert_eq!(read_status(dir).dirty, 3, "the user's setting is honoured");
    assert_eq!(status.local_branches, 2, "main and feature track nothing");
    // With no remote, every commit is unpushed.
    assert!(status.unpushed >= 1, "the root commit is unpushed");
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
    commit(
        dir,
        "update README and add notes\n\nExplains why the notes exist.",
        1001,
    );

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
fn reads_file_diff_hunks() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path();

    git(dir, &["init", "-q", "-b", "main"]);
    git(dir, &["config", "commit.gpgsign", "false"]);
    std::fs::write(dir.join("README.md"), "one\ntwo\n").unwrap();
    git(dir, &["add", "README.md"]);
    commit(dir, "add README", 1000);
    std::fs::write(dir.join("README.md"), "one\nTWO\nthree\n").unwrap();
    git(dir, &["add", "README.md"]);
    commit(dir, "update README", 1001);

    let repo = read_repo(dir).expect("read repo");
    let head = &repo.commits[0].id;
    let root = &repo.commits[1].id;

    // Modification: unified hunks against the first parent.
    let diff = read_file_diff(dir, head, "README.md").expect("head diff");
    assert_eq!(diff.status, "M");
    assert!(!diff.binary);
    assert!(
        diff.text.contains("@@"),
        "hunk header missing: {}",
        diff.text
    );
    assert!(diff.text.contains("-two"), "removal missing: {}", diff.text);
    assert!(
        diff.text.contains("+TWO"),
        "addition missing: {}",
        diff.text
    );
    assert!(diff.text.contains(" one"), "context missing: {}", diff.text);

    // Addition in a root commit: everything is new.
    let diff = read_file_diff(dir, root, "README.md").expect("root diff");
    assert_eq!(diff.status, "A");
    assert!(
        diff.text.contains("+one"),
        "added line missing: {}",
        diff.text
    );

    // A path the commit does not touch is an error, not a panic.
    assert!(read_file_diff(dir, head, "missing.txt").is_err());
}

#[test]
fn file_diff_covers_deletions_and_binary_files() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path();

    git(dir, &["init", "-q", "-b", "main"]);
    git(dir, &["config", "commit.gpgsign", "false"]);
    std::fs::write(dir.join("gone.txt"), "gone\n").unwrap();
    std::fs::write(dir.join("data.bin"), [0u8, 1, 2, 3, 0, 255]).unwrap();
    git(dir, &["add", "."]);
    commit(dir, "root", 1000);
    git(dir, &["rm", "-q", "gone.txt"]);
    std::fs::write(dir.join("data.bin"), [0u8, 9, 9, 9]).unwrap();
    git(dir, &["add", "."]);
    commit(dir, "delete text, change binary", 1001);

    let repo = read_repo(dir).expect("read repo");
    let head = &repo.commits[0].id;

    let deleted = read_file_diff(dir, head, "gone.txt").expect("deletion diff");
    assert_eq!(deleted.status, "D");
    assert!(!deleted.binary);
    assert!(
        deleted.text.contains("-gone"),
        "removal missing: {}",
        deleted.text
    );

    let binary = read_file_diff(dir, head, "data.bin").expect("binary diff");
    assert_eq!(binary.status, "M");
    assert!(binary.binary, "NUL bytes must be detected as binary");
    assert_eq!(binary.text, "", "binary diffs carry no text");
}

#[test]
fn reads_the_whole_commit_diff_at_once() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path();

    git(dir, &["init", "-q", "-b", "main"]);
    git(dir, &["config", "commit.gpgsign", "false"]);
    std::fs::write(dir.join("a.txt"), "a\n").unwrap();
    git(dir, &["add", "a.txt"]);
    commit(dir, "root", 1000);
    std::fs::write(dir.join("a.txt"), "A\n").unwrap();
    std::fs::write(dir.join("b.txt"), "b\n").unwrap();
    git(dir, &["add", "a.txt", "b.txt"]);
    commit(dir, "change a, add b", 1001);

    let repo = read_repo(dir).expect("read repo");
    let mut diffs = read_commit_diff(dir, &repo.commits[0].id).expect("whole-commit diff");
    diffs.sort_by(|x, y| x.path.cmp(&y.path));

    assert_eq!(diffs.len(), 2, "diffs: {diffs:?}");
    assert_eq!(
        (diffs[0].path.as_str(), diffs[0].status.as_str()),
        ("a.txt", "M")
    );
    assert!(
        diffs[0].text.contains("-a"),
        "removal missing: {}",
        diffs[0].text
    );
    assert!(
        diffs[0].text.contains("+A"),
        "addition missing: {}",
        diffs[0].text
    );
    assert_eq!(
        (diffs[1].path.as_str(), diffs[1].status.as_str()),
        ("b.txt", "A")
    );
    assert!(
        diffs[1].text.contains("+b"),
        "added line missing: {}",
        diffs[1].text
    );
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

    // SSH signatures and unrecognized armor headers are classified too.
    let raw = format!(
        "tree {tree}\n\
         author Tester <tester@example.com> 1000 +0000\n\
         committer Tester <tester@example.com> 1000 +0000\n\
         gpgsig -----BEGIN SSH SIGNATURE-----\n fake\n -----END SSH SIGNATURE-----\n\
         \nssh-signed commit\n"
    );
    let id = git_hash_commit(dir, &raw);
    let signed = read_commit(dir, &id).expect("ssh detail");
    assert_eq!(signed.signature.as_deref(), Some("ssh"));

    let raw = format!(
        "tree {tree}\n\
         author Tester <tester@example.com> 1000 +0000\n\
         committer Tester <tester@example.com> 1000 +0000\n\
         gpgsig mystery-blob\n\
         \noddly signed commit\n"
    );
    let id = git_hash_commit(dir, &raw);
    let signed = read_commit(dir, &id).expect("unknown detail");
    assert_eq!(signed.signature.as_deref(), Some("unknown"));
}

#[test]
fn repo_commits_carry_their_signature_kind() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path();

    git(dir, &["init", "-q", "-b", "main"]);
    git(dir, &["config", "commit.gpgsign", "false"]);
    commit(dir, "unsigned root", 1000);

    // Put a (fake-)signed commit on top of the branch.
    let tree = git_stdout(dir, &["rev-parse", "HEAD^{tree}"]);
    let parent = git_stdout(dir, &["rev-parse", "HEAD"]);
    let raw = format!(
        "tree {tree}\n\
         parent {parent}\n\
         author Tester <tester@example.com> 1001 +0000\n\
         committer Tester <tester@example.com> 1001 +0000\n\
         gpgsig -----BEGIN PGP SIGNATURE-----\n fake\n -----END PGP SIGNATURE-----\n\
         \nsigned tip\n"
    );
    let id = git_hash_commit(dir, &raw);
    git(dir, &["update-ref", "refs/heads/main", &id]);

    let repo = read_repo(dir).expect("read repo");
    assert_eq!(repo.commits.len(), 2);
    assert_eq!(repo.commits[0].summary, "signed tip");
    assert_eq!(repo.commits[0].signature.as_deref(), Some("openpgp"));
    assert_eq!(repo.commits[1].signature, None);
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
        .args([
            "hash-object",
            "-w",
            "-t",
            "commit",
            "--literally",
            "--stdin",
        ])
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
    git(
        dir,
        &["merge", "--no-ff", "feature", "-q", "-m", "merge feature"],
    );

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
    let graph = layout(&repo.commit_inputs(), repo.head.as_deref());
    assert_eq!(graph.nodes.len(), 5);
    assert!(
        graph.lane_count >= 2,
        "expected >=2 lanes, got {}",
        graph.lane_count
    );
}

#[test]
fn submodules_and_their_pointer_history_are_read() {
    let tmp = tempfile::tempdir().unwrap();
    let child = tmp.path().join("child");
    std::fs::create_dir(&child).unwrap();
    git(&child, &["init", "-q", "-b", "main"]);
    git(&child, &["config", "commit.gpgsign", "false"]);
    commit(&child, "c1", 1000);

    let parent = tmp.path().join("parent");
    std::fs::create_dir(&parent).unwrap();
    git(&parent, &["init", "-q", "-b", "main"]);
    git(&parent, &["config", "commit.gpgsign", "false"]);
    commit(&parent, "p1", 1000);
    git(
        &parent,
        &[
            "-c",
            "protocol.file.allow=always",
            "submodule",
            "add",
            "../child",
            "sub",
        ],
    );
    commit(&parent, "add submodule", 1010);

    // Advance the submodule working copy and record the new pointer.
    let sub_dir = parent.join("sub");
    git(&sub_dir, &["config", "commit.gpgsign", "false"]);
    commit(&sub_dir, "c2", 1020);
    git(&parent, &["add", "sub"]);
    commit(&parent, "bump submodule", 1030);

    let subs = read_submodules(&parent);
    assert_eq!(subs.len(), 1);
    assert_eq!(subs[0].rel, "sub");
    assert_eq!(subs[0].path, sub_dir);

    // The submodule opens as a repository of its own (its .git is a gitfile).
    let sub_repo = read_repo(&sub_dir).expect("read submodule repo");
    assert_eq!(sub_repo.commits.len(), 2);

    // Newest first: the bump points at the submodule's current HEAD, the
    // adding commit at its first commit.
    let updates = gitlink_updates(&parent, "sub");
    assert_eq!(updates.len(), 2);
    let head = Command::new("git")
        .current_dir(&sub_dir)
        .args(["rev-parse", "HEAD"])
        .output()
        .expect("rev-parse");
    let head = String::from_utf8_lossy(&head.stdout).trim().to_string();
    assert_eq!(updates[0].sha, head);
    assert_ne!(updates[1].sha, head);
}

#[test]
fn uncommitted_changes_list_files_with_counts_and_diff_against_head() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path();
    git(dir, &["init", "-q", "-b", "main"]);
    git(dir, &["config", "commit.gpgsign", "false"]);
    std::fs::write(dir.join("note.txt"), "one\n").unwrap();
    std::fs::write(dir.join("gone.txt"), "bye\n").unwrap();
    git(dir, &["add", "."]);
    commit(dir, "root", 1000);
    let head = read_repo(dir).expect("read repo").head.expect("head");

    // A tracked edit, a staged addition, an untracked file and a deletion:
    // every kind of change the working tree can hold against HEAD.
    std::fs::write(dir.join("note.txt"), "one\ntwo\n").unwrap();
    std::fs::write(dir.join("staged.txt"), "s1\ns2\n").unwrap();
    git(dir, &["add", "staged.txt"]);
    std::fs::write(dir.join("scratch.txt"), "wip\n").unwrap();
    std::fs::remove_file(dir.join("gone.txt")).unwrap();

    let detail = read_uncommitted(dir).expect("read uncommitted changes");
    assert_eq!(detail.id, UNCOMMITTED_ID);
    assert_eq!(detail.parents, vec![head]);
    let files: HashMap<&str, &FileChange> =
        detail.files.iter().map(|f| (f.path.as_str(), f)).collect();
    let expect = |path: &str, status: &str, additions: usize, deletions: usize| {
        let file = files.get(path).unwrap_or_else(|| panic!("{path} missing"));
        assert_eq!(file.status, status, "{path} status");
        assert_eq!(
            (file.additions, file.deletions),
            (additions, deletions),
            "{path} counts"
        );
    };
    expect("note.txt", "M", 1, 0);
    expect("staged.txt", "A", 2, 0);
    expect("scratch.txt", "A", 1, 0);
    expect("gone.txt", "D", 0, 1);
    assert_eq!(detail.files.len(), 4);

    // A tracked file diffs through git (filters and all); an untracked one
    // diffs against nothing.
    let note = read_uncommitted_diff(dir, "note.txt").expect("note diff");
    assert_eq!(note.status, "M");
    assert!(!note.binary);
    assert!(note.text.starts_with("@@"), "hunks only, got {:?}", note.text);
    assert!(note.text.contains("+two\n"), "got {:?}", note.text);
    let scratch = read_uncommitted_diff(dir, "scratch.txt").expect("scratch diff");
    assert_eq!(scratch.status, "A");
    assert!(scratch.text.contains("+wip\n"), "got {:?}", scratch.text);
    let gone = read_uncommitted_diff(dir, "gone.txt").expect("gone diff");
    assert_eq!(gone.status, "D");
    assert!(gone.text.contains("-bye\n"), "got {:?}", gone.text);

    let all = read_uncommitted_diffs(dir).expect("all diffs");
    assert_eq!(all.len(), 4);

    // An untracked embedded repository shows up as a directory entry that
    // git will not descend into; it must neither error nor sink the other
    // diffs.
    let nested = dir.join("nested");
    std::fs::create_dir(&nested).unwrap();
    git(&nested, &["init", "-q", "-b", "main"]);
    std::fs::write(nested.join("inner.txt"), "in\n").unwrap();
    let detail = read_uncommitted(dir).expect("with an embedded repository");
    let entry = detail
        .files
        .iter()
        .find(|f| f.path == "nested/")
        .expect("the embedded repository is listed as a directory");
    assert_eq!((entry.status.as_str(), entry.additions, entry.deletions), ("A", 0, 0));
    let all = read_uncommitted_diffs(dir).expect("diffs survive the directory");
    assert_eq!(all.len(), 5);
    let dir_diff = read_uncommitted_diff(dir, "nested/").expect("directory diff");
    assert_eq!((dir_diff.binary, dir_diff.text.as_str()), (false, ""));

    // An unchanged path is not part of the uncommitted changes.
    assert!(read_uncommitted_diff(dir, "missing.txt").is_err());

    // Pathspecs are literal: a file named like a glob diffs only itself.
    std::fs::write(dir.join("a[1].txt"), "one\n").unwrap();
    std::fs::write(dir.join("a1.txt"), "one\n").unwrap();
    git(dir, &["add", "a[1].txt", "a1.txt"]);
    commit(dir, "globby names", 1001);
    std::fs::write(dir.join("a[1].txt"), "one\nbracket\n").unwrap();
    std::fs::write(dir.join("a1.txt"), "one\nplain\n").unwrap();
    let bracket = read_uncommitted_diff(dir, "a[1].txt").expect("bracket diff");
    assert!(bracket.text.contains("+bracket\n"), "got {:?}", bracket.text);
    assert!(!bracket.text.contains("+plain\n"), "globbed onto a1.txt: {:?}", bracket.text);
    assert_eq!(bracket.text.lines().filter(|l| l.starts_with("@@")).count(), 1);
}

#[test]
fn a_clean_working_tree_has_no_uncommitted_paths() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path();
    git(dir, &["init", "-q", "-b", "main"]);
    git(dir, &["config", "commit.gpgsign", "false"]);
    std::fs::write(dir.join("note.txt"), "one\n").unwrap();
    git(dir, &["add", "."]);
    commit(dir, "root", 1000);

    assert!(uncommitted_paths(dir).is_empty());
    assert!(read_uncommitted(dir).expect("clean detail").files.is_empty());
}

#[test]
fn linked_worktrees_are_listed_from_either_side() {
    let tmp = tempfile::tempdir().unwrap();
    let main = tmp.path().join("main");
    std::fs::create_dir(&main).unwrap();
    git(&main, &["init", "-q", "-b", "main"]);
    git(&main, &["config", "commit.gpgsign", "false"]);
    commit(&main, "root", 1000);
    let linked = tmp.path().join("feature-wt");
    git(
        &main,
        &["worktree", "add", "-q", linked.to_str().unwrap(), "-b", "feature"],
    );
    let canon = |p: &Path| std::fs::canonicalize(p).unwrap();

    // From the main worktree: the linked one, on its own branch.
    let from_main = read_worktrees(&main);
    assert_eq!(from_main.len(), 1, "{from_main:?}");
    assert_eq!(from_main[0].name, "feature-wt");
    assert_eq!(from_main[0].branch.as_deref(), Some("feature"));
    assert!(!from_main[0].main);
    assert_eq!(canon(&from_main[0].path), canon(&linked));

    // From the linked worktree: the main one, on main.
    let from_linked = read_worktrees(&linked);
    assert_eq!(from_linked.len(), 1, "{from_linked:?}");
    assert!(from_linked[0].main);
    assert_eq!(from_linked[0].name, "main");
    assert_eq!(from_linked[0].branch.as_deref(), Some("main"));
    assert_eq!(canon(&from_linked[0].path), canon(&main));

    // A linked worktree reads as a repository of its own: shared refs, its
    // own HEAD, and it carries its relatives.
    let repo = read_repo(&linked).expect("read the linked worktree");
    assert_eq!(repo.head_branch.as_deref(), Some("feature"));
    assert!(repo.refs.iter().any(|r| r.name == "main" && r.remote.is_none()));
    assert_eq!(repo.worktrees.len(), 1);
    assert!(repo.worktrees[0].main);

    // A linked worktree whose directory was deleted (prunable) is not
    // offered: it cannot be opened.
    let gone = tmp.path().join("gone-wt");
    git(
        &main,
        &["worktree", "add", "-q", gone.to_str().unwrap(), "-b", "gone"],
    );
    assert_eq!(read_worktrees(&main).len(), 2);
    std::fs::remove_dir_all(&gone).unwrap();
    let remaining = read_worktrees(&main);
    let names: Vec<&str> = remaining.iter().map(|w| w.name.as_str()).collect();
    assert_eq!(names, vec!["feature-wt"], "the pruned worktree must vanish");

    // A repository with a single worktree lists nothing.
    let alone = tmp.path().join("alone");
    std::fs::create_dir(&alone).unwrap();
    git(&alone, &["init", "-q", "-b", "main"]);
    git(&alone, &["config", "commit.gpgsign", "false"]);
    commit(&alone, "root", 1000);
    assert!(read_worktrees(&alone).is_empty());
    assert!(read_repo(&alone).unwrap().worktrees.is_empty());
}
