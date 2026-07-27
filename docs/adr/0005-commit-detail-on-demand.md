# ADR 0005: Fetch commit details on demand

## Status

Accepted (2026-07-10)

## Context

When a commit row is clicked, we want to show the full message
(description) and the changes. Getting the changes requires a tree
diff against the parent commit and a per-file blob diff (line counts);
precomputing this for every commit in the repository would make
`/api/repos` heavy (most of the diffs are never displayed).

## Decision

- Commit details are **fetched on demand via `POST /api/commit`**. The
  graph data in `/api/repos` (summary/author/time) stays as before.
- The request is a JSON body of
  `{ "repo": "<repo id>", "id": "<commit id>" }`. The repo id is a
  canonicalized path (containing backslashes on Windows), so to avoid
  URL-encoding pitfalls we align with the JSON-body style of the
  existing `DELETE /api/repos`. We lose GET cacheability, but that
  does not matter for a local tool.
- The diff is a **comparison against the first parent** (the empty
  tree for roots; the first parent only for merge commits too). Same
  default as `git show` and other graph tools.
- The response goes down to per-file changes (status A/M/D/R plus
  added/deleted line counts). No patch body (hunks). If an in-file
  diff view becomes necessary, add it as a separate endpoint.
- The implementation is confined to `git::read_commit` (gix tree diff
  plus blob-diff line counting), with `CommitDetailView` in the `app`
  layer keeping the serialization boundary.

## Consequences

- Details are read for exactly one commit at click time, so the cost
  of the list view is unchanged regardless of repository size.
- Every selection issues an HTTP request, but a local tree diff is
  fast enough. Frontend caching can be bolted on later if needed.
- A merge commit's "diff against the second parent" (the content
  brought in by the merge itself) is not visible. Add a parent index
  to the request if it becomes necessary.
