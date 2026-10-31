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
names no ignored file. It can still name a path that leads into `.git` on
disk: git for Windows walks a directory junction as a directory, so a
junction to `.git` lists its files, and a junction to an ignored directory
lists that directory's files under the junction's name. An index entry
named `.git./config` is listed as it is written and opens `.git/config`.

## Decision

- **The working tree is read only at a path the uncommitted changes
  list,** matched exactly against what `git status` reports for the
  repository. Any other path returns nothing, as an absent one does.
- **No directory on the path is a link or a junction,** and the
  directory the path resolves to lies outside the repository's git
  directory and its common directory. This replaces the check that the
  path's directory resolves inside the working tree, which a link no
  longer passes.
- Reading a commit's tree is unchanged: it reads git objects, not files
  on disk.

## Consequences

- Each read of the working-tree side runs `git status` once more. The
  read happens only when a gap in an uncommitted diff is first opened.
- What the diff pane shows does not change, since it reads only the
  listed files.
- The adapter's tests read `.git/config`, `.GIT/config`, an ignored file
  and an unchanged file through the route's function and expect nothing.
  On Windows they also read through a junction to `.git`, a junction to
  an ignored directory, and an index entry named `.git./config`.
- A path that a repository's own `core.worktree` lists from another
  directory is read at the same name in the repository's directory. That
  configuration is the repository's content, which QUALITY treats as
  trusted.
