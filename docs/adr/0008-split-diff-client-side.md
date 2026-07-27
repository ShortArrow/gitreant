# ADR 0008: Build the side-by-side diff by parsing unified text client-side

## Status

Accepted (2026-07-10)

## Context

The diff pane only had an inline (unified) view, and we want a toggle
to a side-by-side view. ADR 0006 anticipated that "side-by-side falls
outside the text format, so an extension to a structured response
would be needed", but since unified hunk headers contain the line
numbers for both sides, **all the information the display needs is in
fact in the text**.

## Decision

- The `/api/diff` / `/api/commit-diff` responses stay as **unified
  text**, unchanged. The side-by-side view is assembled by the pure
  frontend function `parseUnified` (frontend/src/diffModel.ts), which
  parses the text: within a hunk, runs of deleted lines and runs of
  added lines are paired line by line, and leftovers get an empty
  cell on the opposite side. Line numbers are counted for both sides
  from the hunk header.
- The display mode (Inline | Split) is switched with a toggle in the
  diff pane and persisted to localStorage.
- For the all-at-once view (diffs of all files in a commit), a new
  `POST /api/commit-diff {repo, id}` endpoint returns an array of
  `FileDiff`. The per-file `/api/diff` remains as-is for lightweight
  per-click fetches.

## Consequences

- A single API format suffices, and both the inline and split views
  can evolve without server changes. ADR 0006's predicted consequence
  that "a structured response would be needed" is updated by this ADR
  (the decision itself is unchanged).
- Character-level word-diff highlighting cannot be derived from
  unified text, so if it becomes necessary a structured extension
  will be considered at that point.
- The all-at-once view computes the blob diffs of every file in one
  request, so huge commits take correspondingly long (it fires only
  on an explicit action).
