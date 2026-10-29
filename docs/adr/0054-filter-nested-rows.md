# ADR 0054: Let the drawer filter find nested rows

## Status

Accepted (2026-10-29)

## Context

The drawer nests a repository's submodules and its other worktrees under
its row, in an accordion. Its filter matched only the top-level rows, by
name or path, so a nested worktree or submodule could not be found by
filtering; [ADR 0028](0028-worktrees.md) recorded this as "a known
limitation". A worktree is often looked for by its branch, which shows on
its row but was not searched either.

## Decision

- **A nested row matches as a top-level one does.** A submodule matches by
  its name or path, a worktree by its name, path or branch, with the same
  case-insensitive substring as the top-level rows.
- **Its parent stays, opened to the matches.** A top-level row whose own
  name and path do not match stays listed while any of its nested rows
  matches. While the filter holds, its accordion shows open with the
  matching nested rows only.
- **A matching parent behaves as before.** When the top-level row matches
  itself, its accordion keeps the state the user left it in and shows all
  its nested rows.

## Consequences

- Which rows show, and which nested rows show under each, is a pure
  function of the rows and the filter, checked by unit tests.
