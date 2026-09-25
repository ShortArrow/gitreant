//! The set of repositories currently on display.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::git::{
    discover_repo, gpg_available, read_repo_with_progress, uncommitted_paths, verification_state,
    verify_command, verify_signatures, RepoData, SignatureCheck,
};

use super::view::{build_view, RepoView};

/// An external command a view read had to run, so the server can log it.
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
    }
}

/// Read one repository and build its view, reporting the running commit
/// count while the walk proceeds. Also returns the external command the
/// read ran (signature verification), for the server's command log.
///
/// The session is locked only around its shared caches — never across the
/// repository read or a verification subprocess — so commit-detail and
/// diff requests stay responsive while a large repository is analyzed.
pub fn read_view(
    session: &Mutex<Session>,
    path: &Path,
    mut on_commits: impl FnMut(usize),
) -> (RepoView, Option<ExecutedCommand>) {
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
            // The walk is done: report its true total now, before the
            // (possibly slow) signature verification, so the counter never
            // lags at a stale value while gpg runs.
            on_commits(data.commits.len());
            let command = annotate_verification(session, path, &mut data);
            // Whatever the working tree holds against HEAD rides above it
            // as one synthetic row; the count is all the view needs.
            let uncommitted = uncommitted_paths(path).len();
            (build_view(path, &data, uncommitted), command)
        }
        Err(message) => (RepoView::error(path, message), None),
    }
}

/// Verify the signatures of any signed commits not seen before, via the
/// git/gpg CLI, and stamp every signed commit with its cached verdict.
/// Returns the executed command when one actually ran.
fn annotate_verification(
    session: &Mutex<Session>,
    path: &Path,
    data: &mut RepoData,
) -> Option<ExecutedCommand> {
    let pending: Vec<String> = {
        let session = session.lock().expect("session mutex");
        data.commits
            .iter()
            .filter(|c| c.signature.is_some() && !session.verify_cache.contains_key(&c.id))
            .map(|c| c.id.clone())
            .collect()
    };

    let command = if !pending.is_empty() && gpg_available() {
        let result = verify_signatures(path, &pending);
        let mut session = session.lock().expect("session mutex");
        let (ok, message) = match &result {
            Ok(statuses) => {
                session.verify_cache.extend(statuses.clone());
                (true, String::new())
            }
            Err(message) => (false, message.clone()),
        };
        // Cache failures as "unknown" so a broken gpg setup does not
        // re-run (and re-log) the check on every view read.
        for id in &pending {
            session
                .verify_cache
                .entry(id.clone())
                .or_insert(('?', None));
        }
        Some(ExecutedCommand {
            repo: path.to_string_lossy().into_owned(),
            command: verify_command(path, &pending),
            ok,
            message,
        })
    } else {
        None
    };

    let session = session.lock().expect("session mutex");
    for commit in &mut data.commits {
        if commit.signature.is_some() {
            if let Some((status, key)) = session.verify_cache.get(&commit.id) {
                commit.verified = verification_state(*status);
                commit.signature_key = key.clone();
            }
        }
    }
    command
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

        let (view, executed) = read_view(&Mutex::new(session), &path, |_| {});
        assert!(view.error.is_none());
        assert_eq!(view.commits.len(), 0);
        assert!(executed.is_none());
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

        let (view, executed) = read_view(&session, &path, |_| {});
        assert_eq!(view.commits[0].signature.as_deref(), Some("openpgp"));
        assert_eq!(view.commits[0].verified, Some(true));
        let key = view.commits[0].signature_key.as_deref().unwrap_or("");
        assert!(
            key.len() >= 8 && key.chars().all(|c| c.is_ascii_hexdigit()),
            "expected a hex key id, got {key:?}"
        );
        let executed = executed.expect("a verification command ran");
        assert!(executed.command.contains("%H %G?"));
        assert!(executed.ok);

        // The verdict is cached: a second read runs nothing new.
        let (view, executed) = read_view(&session, &path, |_| {});
        assert_eq!(view.commits[0].verified, Some(true));
        assert!(executed.is_none());
    }
}
