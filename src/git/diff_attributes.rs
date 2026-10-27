//! Whether a file diffs as binary, decided the way `git diff` decides it:
//! the `diff` attribute first (gitattributes(5)), then a NUL byte in the
//! content (ADR 0033).

use gix::attrs::StateRef;
use gix::worktree::stack::state::attributes::Source;

/// The `diff` attribute of the paths in one repository, from the places
/// `git diff <commit> <commit>` reads: `$GIT_DIR/info/attributes`, the
/// `.gitattributes` files in the working tree, and the global and system
/// attribute files. Neither the index nor the commits being diffed are read,
/// and a bare repository has only the first and last.
pub(super) struct DiffAttributes<'repo> {
    repo: &'repo gix::Repository,
    /// `None` when the attributes cannot be read; every path is then judged
    /// by its content alone.
    stack: Option<gix::AttributeStack<'repo>>,
    outcome: gix::attrs::search::Outcome,
}

impl<'repo> DiffAttributes<'repo> {
    /// Hands gix an empty index, so it has no `.gitattributes` to map from
    /// the index; this also spares loading an index, which takes hundreds of
    /// milliseconds in a large repository.
    pub(super) fn of(repo: &'repo gix::Repository) -> Self {
        let no_index = gix::index::State::new(repo.object_hash());
        let source = if repo.workdir().is_some() {
            Source::WorktreeThenIdMapping
        } else {
            Source::IdMapping
        };
        let stack = repo.attributes_only(&no_index, source).ok();
        let outcome = stack
            .as_ref()
            .map(|stack| stack.selected_attribute_matches(["diff"]))
            .unwrap_or_default();
        Self {
            repo,
            stack,
            outcome,
        }
    }

    /// `path` diffs as binary between the contents `old` and `new`.
    pub(super) fn binary(&mut self, path: &str, old: &[u8], new: &[u8]) -> bool {
        self.declared_binary(path)
            .unwrap_or_else(|| looks_binary(old) || looks_binary(new))
    }

    /// What the `diff` attribute says: `-diff` (and the `binary` macro) is
    /// binary, `diff` is text, and `diff=<driver>` is what
    /// `diff.<driver>.binary` says. `None` leaves it to the content.
    fn declared_binary(&mut self, path: &str) -> Option<bool> {
        self.stack
            .as_mut()?
            .at_entry(path, None)
            .ok()?
            .matching_attributes(&mut self.outcome);
        match self.outcome.iter_selected().next()?.assignment.state {
            StateRef::Unset => Some(true),
            StateRef::Set => Some(false),
            StateRef::Value(driver) => self
                .repo
                .config_snapshot()
                .boolean(format!("diff.{}.binary", driver.as_bstr()).as_str()),
            StateRef::Unspecified => None,
        }
    }
}

/// A NUL byte within the first 8000 bytes, the same rule git uses.
fn looks_binary(data: &[u8]) -> bool {
    data.iter().take(8000).any(|&b| b == 0)
}
