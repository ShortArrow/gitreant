//! The set of repositories currently on display.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::git::{
    discover_repo, gpg_available, read_repo_with_progress, uncommitted_paths, verification_state,
    verify_command, verify_signatures, RepoData, SignatureCheck,
};

use super::view::{build_view, RepoView};

/// An external command a signature check ran, so the server can log it.
#[derive(Debug, Clone)]
pub struct ExecutedCommand {
    /// The repository id (canonical path) the command ran in.
    pub repo: String,
    pub command: String,
    pub ok: bool,
    /// stderr on failure, empty on success.
    pub message: String,
}

/// An ordered, de-duplicated set of repository roots. Repository contents are
/// re-read on demand so the views always reflect the current state on disk.
#[derive(Default)]
pub struct Session {
    paths: Vec<PathBuf>,
    /// Raw `%G?` status and `%GK` key id per commit id. Commits are
    /// immutable, so a verdict never has to be re-checked (a keyring change
    /// needs a server restart).
    verify_cache: HashMap<String, SignatureCheck>,
    /// Bumped whenever the cache is cleared, so a check that started
    /// before cannot store verdicts from the old keyring.
    verify_generation: u64,
}

impl Session {
    pub fn new() -> Self {
        Self::default()
    }

    /// Add the repository containing `path`. Returns `Ok(true)` if it was newly
    /// added, `Ok(false)` if it was already present. Either way the returned id
    /// (canonical path string, matching `RepoView::id`) identifies the repository.
    pub fn add(&mut self, path: &Path) -> Result<(String, bool), String> {
        let root = discover_repo(path)?;
        let key = canonical(&root);
        let id = key.to_string_lossy().into_owned();
        if self.paths.iter().any(|p| p == &key) {
            return Ok((id, false));
        }
        self.paths.push(key);
        Ok((id, true))
    }

    /// Remove the repository identified by `id` (its canonical path string, as
    /// exposed in `RepoView::id`). Returns whether anything was removed.
    pub fn remove(&mut self, id: &str) -> bool {
        let before = self.paths.len();
        self.paths.retain(|p| p.to_string_lossy() != id);
        before != self.paths.len()
    }

    pub fn paths(&self) -> &[PathBuf] {
        &self.paths
    }

    /// The root path of the repository identified by `id`, if displayed.
    pub fn path_of(&self, id: &str) -> Option<&PathBuf> {
        self.paths.iter().find(|p| p.to_string_lossy() == id)
    }

    pub fn is_empty(&self) -> bool {
        self.paths.is_empty()
    }

    /// Forget every cached signature verdict so the next view read verifies
    /// them again — e.g. after the local gpg keyring gained a missing key.
    pub fn clear_verify_cache(&mut self) {
        self.verify_cache.clear();
        self.verify_generation += 1;
    }

    /// The cache's current generation, taken before a check starts.
    pub fn verify_generation(&self) -> u64 {
        self.verify_generation
    }

    /// Cache the verdicts a check that began at `generation` found for
    /// `ids`; an id it found nothing for is settled as "no verdict", so a
    /// broken gpg setup does not re-run (and re-log) the check on every
    /// read. Stores nothing, and returns false, when the cache was cleared
    /// since.
    pub fn store_verdicts(
        &mut self,
        generation: u64,
        ids: &[String],
        mut verdicts: HashMap<String, SignatureCheck>,
    ) -> bool {
        if generation != self.verify_generation {
            return false;
        }
        for id in ids {
            let verdict = verdicts.remove(id).unwrap_or(('?', None));
            self.verify_cache.insert(id.clone(), verdict);
        }
        true
    }
}

/// Read one repository and build its view, reporting the running commit
/// count while the walk proceeds. Signatures are not checked here
/// (ADR 0037): the view carries the verdicts already cached, and the signed
/// commits still to check come back, in display order, for
/// [`verify_batch`].
///
/// The session is locked only around its shared caches — never across the
/// repository read — so commit-detail and diff requests stay responsive
/// while a large repository is analyzed.
pub fn read_view(
    session: &Mutex<Session>,
    path: &Path,
    on_commits: impl FnMut(usize),
) -> (RepoView, Vec<String>) {
    read_view_with(session, path, gpg_available(), on_commits)
}

/// [`read_view`], told whether signatures can be checked at all; with
/// `can_verify` false nothing is left pending.
fn read_view_with(
    session: &Mutex<Session>,
    path: &Path,
    can_verify: bool,
    mut on_commits: impl FnMut(usize),
) -> (RepoView, Vec<String>) {
    // Forward the walk's running count sparsely: the server throttles by
    // time on top, this only bounds the callback overhead. 64 is
    // fine-grained enough that even a medium repository surfaces a moving
    // counter.
    let walked = read_repo_with_progress(path, |commits| {
        if commits % 64 == 0 {
            on_commits(commits);
        }
    });
    match walked {
        Ok(mut data) => {
            on_commits(data.commits.len());
            let pending = stamp_verdicts(session, &mut data, can_verify);
            // Whatever the working tree holds against HEAD rides above it
            // as one synthetic row; the count is all the view needs.
            let uncommitted = uncommitted_paths(path).len();
            let mut view = build_view(path, &data, uncommitted);
            let waiting: HashSet<&str> = pending.iter().map(String::as_str).collect();
            for commit in &mut view.commits {
                commit.verifying = waiting.contains(commit.id.as_str());
            }
            (view, pending)
        }
        Err(message) => (RepoView::error(path, message), Vec::new()),
    }
}

/// Stamp every signed commit with its cached verdict and return the signed
/// commits with none yet, in display order — none when `can_verify` is
/// false.
fn stamp_verdicts(session: &Mutex<Session>, data: &mut RepoData, can_verify: bool) -> Vec<String> {
    let session = session.lock().expect("session mutex");
    let mut pending = Vec::new();
    for commit in data.commits.iter_mut().filter(|c| c.signature.is_some()) {
        match session.verify_cache.get(&commit.id) {
            Some((status, key)) => {
                commit.verified = verification_state(*status);
                commit.signature_key = key.clone();
            }
            None if can_verify => pending.push(commit.id.clone()),
            None => {}
        }
    }
    pending
}

/// Check the signatures of `ids` via the git/gpg CLI (ADR 0011) and cache
/// the verdicts, unless the cache was cleared while the check ran. Returns
/// the command, for the server's command log.
pub fn verify_batch(session: &Mutex<Session>, path: &Path, ids: &[String]) -> ExecutedCommand {
    let generation = session.lock().expect("session mutex").verify_generation();
    let result = verify_signatures(path, ids);
    let (verdicts, ok, message) = match result {
        Ok(verdicts) => (verdicts, true, String::new()),
        Err(message) => (HashMap::new(), false, message),
    };
    session
        .lock()
        .expect("session mutex")
        .store_verdicts(generation, ids, verdicts);
    ExecutedCommand {
        repo: path.to_string_lossy().into_owned(),
        command: verify_command(path, ids),
        ok,
        message,
    }
}

/// Best-effort canonical form for de-duplication and display; falls back to
/// the input when the path cannot be canonicalized.
pub fn canonical(path: &Path) -> PathBuf {
    strip_verbatim(fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf()))
}

/// On Windows `fs::canonicalize` returns verbatim paths (`\\?\C:\...`,
/// `\\?\UNC\server\share\...`); strip the prefix so ids stay human-readable.
fn strip_verbatim(path: PathBuf) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        PathBuf::from(format!(r"\\{rest}"))
    } else if let Some(rest) = text.strip_prefix(r"\\?\") {
        PathBuf::from(rest)
    } else {
        path
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    fn init_repo(dir: &Path) {
        Command::new("git")
            .current_dir(dir)
            .args(["init", "-q"])
            .status()
            .unwrap();
    }

    #[test]
    fn adding_same_repo_twice_is_deduplicated() {
        let tmp = tempfile::tempdir().unwrap();
        init_repo(tmp.path());

        let mut session = Session::new();
        assert!(session.add(tmp.path()).unwrap().1);
        // Adding a subpath resolves to the same repository root.
        assert!(!session.add(tmp.path()).unwrap().1);
        assert_eq!(session.paths().len(), 1);
    }

    #[test]
    fn removing_by_id_drops_the_repository() {
        let tmp = tempfile::tempdir().unwrap();
        init_repo(tmp.path());

        let mut session = Session::new();
        session.add(tmp.path()).unwrap();
        let id = session.paths()[0].to_string_lossy().into_owned();

        assert!(session.remove(&id));
        assert!(session.is_empty());
        // Removing again is a no-op.
        assert!(!session.remove(&id));
    }

    #[test]
    fn repo_id_has_no_windows_verbatim_prefix() {
        let tmp = tempfile::tempdir().unwrap();
        init_repo(tmp.path());

        let mut session = Session::new();
        let (id, _) = session.add(tmp.path()).unwrap();
        assert!(
            !id.starts_with(r"\\?\"),
            "id should be human-readable, got {id}"
        );
    }

    #[test]
    fn strip_verbatim_handles_drive_and_unc_prefixes() {
        assert_eq!(
            strip_verbatim(PathBuf::from(r"\\?\C:\repos\demo")),
            PathBuf::from(r"C:\repos\demo")
        );
        assert_eq!(
            strip_verbatim(PathBuf::from(r"\\?\UNC\server\share\demo")),
            PathBuf::from(r"\\server\share\demo")
        );
        assert_eq!(
            strip_verbatim(PathBuf::from("/plain/path")),
            PathBuf::from("/plain/path")
        );
    }

    #[test]
    fn read_view_builds_the_view_of_one_repository() {
        let tmp = tempfile::tempdir().unwrap();
        init_repo(tmp.path());
        let mut session = Session::new();
        session.add(tmp.path()).unwrap();
        let path = session.paths()[0].clone();

        let (view, pending) = read_view(&Mutex::new(session), &path, |_| {});
        assert!(view.error.is_none());
        assert_eq!(view.commits.len(), 0);
        assert!(pending.is_empty());
    }

    /// A repository with an unsigned root and a tip carrying a gpgsig header
    /// nothing can verify; returns its path and the tip's id.
    fn fake_signed_repo(dir: &Path) -> (PathBuf, String) {
        let git = |args: &[&str], input: Option<&str>| -> String {
            let mut child = Command::new("git")
                .current_dir(dir)
                .args(args)
                .env("GIT_AUTHOR_NAME", "T")
                .env("GIT_AUTHOR_EMAIL", "t@e.com")
                .env("GIT_COMMITTER_NAME", "T")
                .env("GIT_COMMITTER_EMAIL", "t@e.com")
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::piped())
                .spawn()
                .unwrap();
            if let Some(input) = input {
                use std::io::Write;
                child
                    .stdin
                    .take()
                    .unwrap()
                    .write_all(input.as_bytes())
                    .unwrap();
            }
            let out = child.wait_with_output().unwrap();
            assert!(out.status.success(), "git {args:?} failed");
            String::from_utf8(out.stdout).unwrap().trim().to_string()
        };
        git(&["init", "-q", "-b", "main"], None);
        git(
            &[
                "-c",
                "commit.gpgsign=false",
                "commit",
                "-q",
                "--allow-empty",
                "-m",
                "base",
            ],
            None,
        );
        let tree = git(&["rev-parse", "HEAD^{tree}"], None);
        let parent = git(&["rev-parse", "HEAD"], None);
        let raw = [
            format!("tree {tree}"),
            format!("parent {parent}"),
            "author T <t@e.com> 1700000100 +0000".to_string(),
            "committer T <t@e.com> 1700000100 +0000".to_string(),
            "gpgsig -----BEGIN PGP SIGNATURE-----".to_string(),
            " fake".to_string(),
            " -----END PGP SIGNATURE-----".to_string(),
            String::new(),
            "signed tip".to_string(),
            String::new(),
        ]
        .join("\n");
        let tip = git(
            &[
                "hash-object",
                "-w",
                "-t",
                "commit",
                "--literally",
                "--stdin",
            ],
            Some(&raw),
        );
        git(&["update-ref", "refs/heads/main", &tip], None);
        (canonical(dir), tip)
    }

    #[test]
    fn a_read_leaves_unchecked_signatures_pending_for_later() {
        let tmp = tempfile::tempdir().unwrap();
        let (path, tip) = fake_signed_repo(tmp.path());
        let session = Mutex::new(Session::new());

        let (view, pending) = read_view_with(&session, &path, true, |_| {});
        assert_eq!(pending, vec![tip.clone()]);
        let verifying =
            |view: &RepoView, id: &str| view.commits.iter().find(|c| c.id == id).unwrap().verifying;
        assert!(verifying(&view, &tip));
        assert_eq!(view.commits.iter().filter(|c| c.verifying).count(), 1);

        // Without gpg nothing can be checked, so nothing waits.
        let (view, pending) = read_view_with(&session, &path, false, |_| {});
        assert!(pending.is_empty());
        assert!(!verifying(&view, &tip));
    }

    #[test]
    fn a_cached_verdict_is_stamped_and_no_longer_pending() {
        let tmp = tempfile::tempdir().unwrap();
        let (path, tip) = fake_signed_repo(tmp.path());
        let session = Mutex::new(Session::new());
        {
            let mut session = session.lock().unwrap();
            let generation = session.verify_generation();
            let verdicts = HashMap::from([(tip.clone(), ('G', Some("ABCD1234".to_string())))]);
            assert!(session.store_verdicts(generation, std::slice::from_ref(&tip), verdicts));
        }

        let (view, pending) = read_view_with(&session, &path, true, |_| {});
        assert!(pending.is_empty());
        let commit = view.commits.iter().find(|c| c.id == tip).unwrap();
        assert_eq!(commit.verified, Some(true));
        assert_eq!(commit.signature_key.as_deref(), Some("ABCD1234"));
        assert!(!commit.verifying);
    }

    #[test]
    fn verdicts_from_before_a_cleared_cache_are_dropped() {
        let mut session = Session::new();
        let generation = session.verify_generation();
        session.clear_verify_cache();
        let ids = vec!["a".repeat(40)];
        assert!(!session.store_verdicts(generation, &ids, HashMap::new()));
        assert!(session.verify_cache.is_empty());

        // A run that misses a commit still settles it, as "no verdict".
        let generation = session.verify_generation();
        assert!(session.store_verdicts(generation, &ids, HashMap::new()));
        assert_eq!(session.verify_cache.get(&ids[0]), Some(&('?', None)));
    }

    #[test]
    fn adding_non_repository_errors() {
        let tmp = tempfile::tempdir().unwrap();
        let mut session = Session::new();
        assert!(session.add(tmp.path()).is_err());
    }

    #[test]
    fn views_verify_signed_commits_via_gpg_and_report_the_command() {
        if !crate::git::gpg_available() {
            eprintln!("skipping: gpg is not on the PATH");
            return;
        }
        let tmp = tempfile::tempdir().unwrap();
        // Forward slashes: an MSYS gpg (Git for Windows) treats a backslashed
        // GNUPGHOME as relative; both gpg flavors accept the C:/-style form.
        let home = tmp
            .path()
            .join("gnupg")
            .to_string_lossy()
            .replace('\\', "/");
        std::fs::create_dir(&home).unwrap();
        // The verification child processes inherit this process environment.
        std::env::set_var("GNUPGHOME", &home);

        let run = |dir: &Path, args: &[&str]| {
            Command::new(args[0])
                .args(&args[1..])
                .current_dir(dir)
                .env("GNUPGHOME", &home)
                .env("GIT_AUTHOR_NAME", "Tester")
                .env("GIT_AUTHOR_EMAIL", "tester@example.com")
                .env("GIT_COMMITTER_NAME", "Tester")
                .env("GIT_COMMITTER_EMAIL", "tester@example.com")
                .status()
                .unwrap()
                .success()
        };
        let sh = |dir: &Path, args: &[&str]| {
            assert!(run(dir, args), "command failed: {args:?}");
        };
        // An MSYS gpg (Git for Windows) cannot take a Windows GNUPGHOME even
        // with forward slashes; skip rather than fail on such setups.
        if !run(
            tmp.path(),
            &[
                "gpg",
                "--batch",
                "--pinentry-mode",
                "loopback",
                "--passphrase",
                "",
                "--quick-gen-key",
                "Tester <tester@example.com>",
                "ed25519",
                "sign",
                "never",
            ],
        ) {
            eprintln!("skipping: this gpg cannot use the test GNUPGHOME");
            return;
        }

        let repo = tmp.path().join("repo");
        std::fs::create_dir(&repo).unwrap();
        sh(&repo, &["git", "init", "-q", "-b", "main"]);
        sh(
            &repo,
            &[
                "git",
                "-c",
                "user.signingkey=tester@example.com",
                "commit",
                "-S",
                "--allow-empty",
                "-q",
                "-m",
                "signed",
            ],
        );

        let mut session = Session::new();
        session.add(&repo).unwrap();
        let path = session.paths()[0].clone();
        let session = Mutex::new(session);

        // The read itself waits for nothing; the check runs as a batch.
        let (view, pending) = read_view(&session, &path, |_| {});
        assert_eq!(view.commits[0].signature.as_deref(), Some("openpgp"));
        assert_eq!(view.commits[0].verified, None);
        assert!(view.commits[0].verifying);
        let executed = verify_batch(&session, &path, &pending);
        assert!(executed.command.contains("%H %G?"));
        assert!(executed.ok);

        let (view, pending) = read_view(&session, &path, |_| {});
        assert!(pending.is_empty());
        assert!(!view.commits[0].verifying);
        assert_eq!(view.commits[0].verified, Some(true));
        let key = view.commits[0].signature_key.as_deref().unwrap_or("");
        assert!(
            key.len() >= 8 && key.chars().all(|c| c.is_ascii_hexdigit()),
            "expected a hex key id, got {key:?}"
        );
    }
}
