# ADR 0023: Stage loading: instant list, parallel repositories, paged rows

## Status

Accepted (2026-07-19)

## Context

`GET /api/repos` is an all-or-nothing structure that returns nothing
until every repository has been read, so a single huge repository
leaves the SPA stuck on the progress display with nothing drawn. If
analysis stalls, nothing ever appears. The current rendering, which
turns all commits into SVG rows at once, also breaks down on the
display side at the 100k-commit scale. Git has no O(1) way to return
the total commit count (commits form a DAG with no ledger), so a
progress "%" can, in principle, only ever be an estimate.

## Decision

- **The list answers immediately.** The session knows each
  repository's id/name/path right away, so a lightweight response
  separate from the graph body fills the drawer from the start.
- **Graphs become per-repository fetches that the client loads in
  parallel.** Repositories start displaying as each finishes
  loading, and one stalling does not block the others.
- **Progress is unified on a commit counter (N commits read).** The
  estimated % and its persisted denominator (CountCache) are metrics
  that can lie, so they are removed (superseding the relevant parts
  of the introducing commits f16ca24 / 29ae08a).
- **Graph rows are paged.** Only the first N rows (the initial page)
  are returned and drawn immediately; reaching the end of the scroll
  loads the next page. Display-order stability is required, so the
  server returns each page as a prefix of the display order as of
  that point. For the lazy display-order walk we use gix-traverse's
  topo walker (equivalent to `--topo-order`, generation-number
  based). If migrating from our own walk+sort changes row order, the
  fixtures follow.
- SSE analysis events are simplified to per-repository (id and
  counter). With parallel loading, "n of m" loses meaning; the
  per-item counter in the drawer replaces it.

## Consequences

- Implementation is three stages: (1) add the list endpoint and the
  per-repository view (coexisting with the old API), (2) switch the
  frontend to parallel loading and remove the old API, (3) migrate
  to the topo walker and page the rows. Keep all tests green at each
  stage.
- Paging lets users interact without waiting for "all commits read",
  but features that depend on rows below the end of the page (e.g. a
  squash dotted line whose far end is unread) are not drawn until
  further loading resolves them.
- Since estimating the commit count up front is no longer needed,
  approximation mechanisms such as the commit-graph file are not
  adopted.
