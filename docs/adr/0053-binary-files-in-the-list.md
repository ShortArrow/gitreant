# ADR 0053: Name binary files in the changed-files list

## Status

Accepted (2026-10-28)

## Context

The detail pane lists a commit's changed files with the lines each added
and deleted. A binary file has no lines to count, so it showed `+0 −0`,
the same as a text file with no line added or deleted, such as an empty
file added or a file renamed without a change. Only opening its diff, which says "Binary file — no
text diff.", told the two apart. Which files diff as binary is already
decided for the diff pane ([ADR 0033](0033-diff-attribute.md)): the
`diff` attribute first, else a NUL byte near the start; git's own diff
decides for tracked files in the working tree, and an untracked file too
large to read counts as binary.

## Decision

- **The list says "Binary" in place of the counts.** A binary file's row
  carries a label like the one for line endings, and no `+N −M`, since it
  has no lines to count.
- **The same rule as the diff pane.** A file is binary in the list exactly
  when its diff is: for a commit, for the uncommitted changes (where git
  prints `-` for both counts of a tracked binary file) and for a
  comparison of two commits.
- **Each listed file carries the flag.** The server sends it with the
  file, left out when false, as it does for a change of line endings
  only.

## Consequences

- Telling a binary file apart is checked by the adapter's tests for
  commits and the working tree, and by an end-to-end test of the list.
