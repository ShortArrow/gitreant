//! The other worktrees of a repository (`git worktree list`), read with
//! `gix` from the common git dir: no subprocess, so the instant repository
//! list (ADR 0023) can carry them.
//!
//! A linked worktree shares refs and objects with its main worktree but
//! has its own HEAD, index and working tree. gitreant treats each one as a
//! repository of its own (its path is its id); this module only says how
//! they relate, so the drawer can nest them and branch badges can mark
//! where a branch is checked out.

use std::path::{Path, PathBuf};

/// One worktree of a repository other than the one it was read from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Worktree {
    /// Directory name of the checkout, as the drawer labels it.
    pub name: String,
    /// Absolute path of the checkout.
    pub path: PathBuf,
    /// The branch checked out there; `None` when its HEAD is detached.
    pub branch: Option<String>,
    /// The main worktree (the one holding `.git/`), as opposed to a linked one.
    pub main: bool,
}

/// The worktrees sharing `path`'s repository, minus `path` itself: the main
/// worktree first (when `path` is a linked one), then the linked worktrees
/// in git's order. A linked worktree whose checkout directory is gone (what
/// `git worktree prune` would drop) is left out: it cannot be opened. Empty
/// for a repository with a single worktree, for a bare repository, or when
/// the repository cannot be read.
pub fn read_worktrees(path: &Path) -> Vec<Worktree> {
    let Ok(repo) = gix::discover(path) else {
        return Vec::new();
    };
    let Some(here) = repo.workdir().map(Path::to_path_buf) else {
        return Vec::new();
    };

    let mut out = Vec::new();
    if let Ok(main) = repo.main_repo() {
        if let Some(main_dir) = main.workdir() {
            if !same_dir(main_dir, &here) {
                out.push(Worktree {
                    name: dir_name(main_dir),
                    path: main_dir.to_path_buf(),
                    branch: branch_of(&main),
                    main: true,
                });
            }
        }
    }
    let linked = repo.worktrees().unwrap_or_default().into_iter().filter_map(|proxy| {
        let base = proxy.base().ok()?;
        if same_dir(&base, &here) || !base.is_dir() {
            return None;
        }
        let linked = proxy.into_repo_with_possibly_inaccessible_worktree().ok()?;
        Some(Worktree {
            name: dir_name(&base),
            branch: branch_of(&linked),
            path: base,
            main: false,
        })
    });
    out.extend(linked);
    out
}

fn branch_of(repo: &gix::Repository) -> Option<String> {
    repo.head_name()
        .ok()
        .flatten()
        .map(|name| name.shorten().to_string())
}

fn dir_name(path: &Path) -> String {
    path.file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

/// Path equality after canonicalization, so a worktree registered through
/// a symlink or a different case still matches the one that was opened.
fn same_dir(a: &Path, b: &Path) -> bool {
    let canon = |p: &Path| std::fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf());
    canon(a) == canon(b)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_directory_that_is_no_repository_lists_nothing() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(read_worktrees(tmp.path()).is_empty());
    }

    #[test]
    fn dir_name_falls_back_to_the_whole_path() {
        assert_eq!(dir_name(Path::new("/repos/feature-wt")), "feature-wt");
        assert_eq!(dir_name(Path::new("/")), "/");
    }
}
