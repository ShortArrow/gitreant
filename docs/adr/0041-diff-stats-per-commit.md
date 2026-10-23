# ADR 0041: Show how many lines each commit adds and deletes

## Status

Accepted (2026-10-23)

## Context

A row names a commit's summary, author, time and hash, but not how much
it changed. A commit that touched one line and one that rewrote a
thousand look the same until their diff is opened. The count is also
what a view of the history by the size of its changes, such as a tilted
graph whose height is lines added and deleted, would stand on.

Counting means diffing every commit against its parent. That costs a
tree diff per commit, too much to make the first view of a repository
wait for, the way signature checks were ([ADR 0037](0037-deferred-signature-check.md)).

## Decision

- **What is counted.** A commit's lines added and deleted are those of
  `git diff --numstat` from its first parent to it, with renames detected
  (`-M`, git's default). A merge counts against its first parent, so it
  shows what the merge brought in. A root commit counts against the empty
  tree. Every file counts; a binary file counts as zero lines, as
  `--numstat` reports it.
- **Counted after the view, in the background.** The view read does not
  wait for counts. It carries the counts already known, as `stat` on each
  commit. The server counts the rest in display order, 256 commits at a
  time, with one run per repository at once, by feeding
  `git diff-tree --stdin -r --numstat -M --root` a line of each commit and
  its first parent. After each batch it keeps the counts, records the
  command in the command log ([ADR 0009](0009-command-log.md)) and sends a
  `counted` event naming the repository; the client then reads that
  repository's view again, as it does after `verified`.
- **Kept by commit id.** A commit's count never changes, so the session
  keeps it for as long as it runs and never clears it.
- **Shown in the row.** The row shows `+N −M` before its signature badge,
  in the colors of added and deleted lines. A commit not counted yet shows
  nothing there; the uncommitted row keeps its file count.

## Consequences

- The graph still appears as soon as the walk ends; counts fill in from
  the top, a batch at a time, alongside the signature checks.
- The command log gains one entry per batch.
- A later view built on the size of changes, such as a tilted graph or a
  cumulative chart, can read `stat` from the view; both are in the
  [ROADMAP](../ROADMAP.md).
