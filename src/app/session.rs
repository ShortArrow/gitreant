//! The set of repositories currently on display.

use std::fs;
use std::path::{Path, PathBuf};

use crate::git::{discover_repo, read_repo};

use super::view::{build_view, RepoView};

/// An ordered, de-duplicated set of repository roots. Repository contents are
/// re-read on demand so the views always reflect the current state on disk.
#[derive(Default)]
pub struct Session {
    paths: Vec<PathBuf>,
}

impl Session {
    pub fn new() -> Self {
        Self::default()
    }

    /// Add the repository containing `path`. Returns `Ok(true)` if it was newly
    /// added, `Ok(false)` if it was already present.
    pub fn add(&mut self, path: &Path) -> Result<bool, String> {
        let root = discover_repo(path)?;
        let key = canonical(&root);
        if self.paths.iter().any(|p| p == &key) {
            return Ok(false);
        }
        self.paths.push(key);
        Ok(true)
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

    pub fn is_empty(&self) -> bool {
        self.paths.is_empty()
    }

    /// Read every repository and build its view, in insertion order.
    pub fn views(&self) -> Vec<RepoView> {
        self.paths
            .iter()
            .map(|path| match read_repo(path) {
                Ok(data) => build_view(path, &data),
                Err(message) => RepoView::error(path, message),
            })
            .collect()
    }
}

/// Best-effort canonical form for de-duplication; falls back to the input when
/// the path cannot be canonicalized.
fn canonical(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
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
        assert_eq!(session.add(tmp.path()).unwrap(), true);
        // Adding a subpath resolves to the same repository root.
        assert_eq!(session.add(tmp.path()).unwrap(), false);
        assert_eq!(session.paths().len(), 1);
    }

    #[test]
    fn removing_by_id_drops_the_repository() {
        let tmp = tempfile::tempdir().unwrap();
        init_repo(tmp.path());

        let mut session = Session::new();
        session.add(tmp.path()).unwrap();
        let id = session.paths()[0].to_string_lossy().into_owned();

        assert_eq!(session.remove(&id), true);
        assert!(session.is_empty());
        // Removing again is a no-op.
        assert_eq!(session.remove(&id), false);
    }

    #[test]
    fn adding_non_repository_errors() {
        let tmp = tempfile::tempdir().unwrap();
        let mut session = Session::new();
        assert!(session.add(tmp.path()).is_err());
    }
}
