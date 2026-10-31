# ADR 0068: Read the working tree only at a path the uncommitted changes list

## Status

Accepted (2026-10-31). Amends [ADR 0061](0061-diff-context.md).

## Context

ADR 0061 decided that "the server reads a file's new side", reading "the
working tree for the uncommitted changes". The route took any relative
path made of plain names whose directory resolved inside the working
tree. The repository's own `.git` directory is such a path, so a request
for `.git/config` returned the configuration in full, a remote URL with
its credentials included. On Windows the same directory also answers to
`.GIT`, `GIT~1` and `.git.`, so refusing it by name means listing every
spelling the file system accepts. Ignored files such as `.env` were
readable too, though the diff pane never shows them.

The diff pane asks for a file's working-tree side only for a file the
uncommitted changes list, and that list comes from `git status`, which
names neither the `.git` directory nor ignored files.

## Decision

- **The working tree is read only at a path the uncommitted changes
  list,** matched exactly against what `git status` reports for the
  repository. Any other path returns nothing, as an absent one does.
- **The check on the path's directory stays,** so a changed path under a
  linked directory still leads no read out of the working tree.
- Reading a commit's tree is unchanged: it reads git objects, not files
  on disk.

## Consequences

- Each read of the working-tree side runs `git status` once more. The
  read happens only when a gap in an uncommitted diff is first opened.
- What the diff pane shows does not change, since it reads only the
  listed files.
- The adapter's tests read `.git/config`, `.GIT/config`, an ignored file
  and an unchanged file through the route's function and expect nothing.
