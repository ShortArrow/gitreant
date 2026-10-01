# ADR 0028: Handle git worktrees by nesting them in the drawer and marking their branches

## Status

Accepted (2026-09-23)

## Context

A linked worktree made with `git worktree` shares refs and objects with the
main one but has its own HEAD, index and working tree. gitreant identifies
repositories by path, so adding a linked worktree already opened it as a
view of its own, but nothing said whose worktree it was, or which branches
another worktree had checked out (issue #3). Checking out such a branch is
something `git switch` refuses ("already checked out"), so the UI offered
the operation only to show its failure.

## Decision

- **Read the worktree relation with gix.** List `worktrees/` in the common
  git dir (`Repository::worktrees()`), and when opened from a linked
  worktree also take the main one through `main_repo()`. Keep "the other
  worktrees", excluding the one itself, with their name (directory name),
  path, checked-out branch and a main flag. No subprocess is involved, so
  the relation goes into both the instant list (ADR 0023) and the view.
- **Open a linked worktree as a repository of its own.** The session keeps
  identifying repositories by path; no worktree-specific id is introduced.
  The view draws the shared refs with the worktree's own HEAD as they are.
- **Nest worktrees in the drawer the way submodules are nested** (the
  accordion). A row shows the directory name and the branch, and clicking
  it adds the worktree and opens it in a pane. When a linked worktree is
  added directly, its main worktree is the one nested. An added linked
  worktree has no top-level row only while its main worktree is listed
  too; it is removed from view through the nested row's context menu. The
  nesting rule lives in the pure function `topLevelRepos`, pinned by unit
  tests.
- **Mark the branch badge and block the checkout.** A local branch checked
  out in another worktree gets a worktree-icon segment whose tooltip names
  the path. The badge menu's Checkout is disabled with the reason given (the
  UI does not offer an operation git would refuse). Merging works as
  before.
- **No creating, removing or moving worktrees.** Adding a write operation on
  the repository requires revising QUALITY.md (ADR 0024), so gitreant only
  shows worktrees and leads to them.

## Consequences

- Every list and view read scans `.git/worktrees/*` and opens each linked
  worktree with gix to read its HEAD. There are usually a handful, so the
  cost is negligible.
- A bare repository is not listed as a main worktree (it has no working
  tree); its linked worktrees are listed.
- A linked worktree whose checkout directory is gone (what `git worktree
  prune` would drop) is not listed: what cannot be opened is not shown.
- Looking at the same branch from several worktrees, each view marks it as
  held by the other. The mark means "checked out elsewhere" only; it is not
  the HEAD badge.
- Nested rows show the dirty / unpushed indicators once the worktree is
  added. The drawer's name filter, however, only looks at top-level rows,
  so a nested worktree cannot be found by filtering (a known limitation).
- Checking that a worktree exists touches the file system, so a worktree on
  a disconnected network drive delays the list's answer by that drive's
  timeout.
