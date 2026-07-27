# ADR 0006: Fetch file diffs one file at a time, on demand

## Status

Accepted (2026-07-10)

## Context

ADR 0005 limited commit details to per-file statistics and decided to
"add a separate endpoint when the patch body becomes necessary". A
requirement has emerged to show the diff body when a file name in the
commit detail is clicked; this ADR designs that endpoint.

## Decision

- **`POST /api/diff` with `{repo, id, path}`** fetches a single file
  at a time. We do not return the whole commit's patch in one go, to
  avoid computing unneeded blob diffs on large commits (users
  typically look at only a small fraction of the files).
- The diff is, as in ADR 0005, a **comparison against the first
  parent**. Blobs are fetched by direct lookup from the tree
  (`blob_at`); the tree diff is not re-walked.
- The output is **unified diff hunk text** (`@@` headers plus
  `-`/`+`/context lines), produced with `Diff::compute` from
  imara-diff (re-exported by gix) and gix-diff's `UnifiedDiff` sink (a
  hand-written `ConsumeHunk` implementation). We do not use
  structured per-line JSON because the frontend display needs nothing
  more than line-prefix coloring, and the format is battle-tested as
  `git diff -u`.
- If the first 8000 bytes contain a NUL, set the **binary** flag and
  return no body.
- The frontend replaces the graph area with a diff pane when a file
  is clicked, and returns to the graph when it is closed (the detail
  panel stays open).

## Consequences

- One click means one request, independent of repository or commit
  size.
- Intra-line (character-level) highlighting and side-by-side display
  are outside the text format, so if they become necessary the
  response must be extended (superseded) to a structured one.
- Rename tracking is not enabled, so a rename appears as two files,
  D + A.
