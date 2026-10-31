# ADR 0069: Read a committed file under the working tree's size limit

## Status

Accepted (2026-10-31). Amends [ADR 0061](0061-diff-context.md).

## Context

ADR 0061 decided that the server reads a file's new side, "the working
tree for the uncommitted changes, read under the same size limit as an
untracked file". That limit is 4 MiB: an untracked file larger than that
is never read, so a stray VM image or dataset stays out of memory and out
of the response. The commit's tree had no limit. Opening a gap in a
commit's diff read the file's blob whole and returned it whole, whatever
its size, so a large file in the history landed in memory and in a
response as the working tree's never does.

Git keeps each object's size in its header, which can be read without
reading the object.

## Decision

- **A file in a commit's tree is read only when its blob is at most
  4 MiB,** the limit the working tree has. The blob's size is read from
  its header first, and a larger blob returns nothing, as a file too large
  to read on disk does.
- The commit's diff is unchanged: it still reads both sides whole to
  diff them.

## Consequences

- A committed file over 4 MiB keeps its unchanged lines hidden in the
  diff pane, which says it cannot read them, as it does for a working-tree
  file of that size.
- The adapter's tests read a committed file of exactly 4 MiB and expect
  its text, and one a byte larger and expect nothing.
