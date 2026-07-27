# ADR 0018: Draw squash-merge links from gh merged-PR data

## Status

Accepted (2026-07-14)

## Context

When the branch of a squash-merged PR still exists, the graph's
ancestry does not show that its changes have landed on the base
branch. Inference from local information alone (patch-id,
commit-message parsing) is unreliable and was rejected once
(vscode-git-graph is also heuristic for the same reason).

## Decision

- Do not infer; use **facts GitHub knows**:
  `gh pr list --state merged --limit 50 --json number,url,headRefName,mergeCommit`
  fetches the mapping between a PR's head branch and the commit that
  landed on the base (mergeCommit) (piggybacking on the ADR 0013
  query, with the same TTL cache, command-log recording, and quiet
  degradation in gh-less environments).
- **Only when both the mergeCommit and the tip of a still-remaining
  local branch exist in the graph** are the two nodes connected with a
  dashed pseudo-edge (colored with the branch tip's lane color, drawn
  by the frontend's `squashEdges`). If the branch has been deleted or
  the mergeCommit is outside the visible range, nothing is drawn.

## Consequences

- Exactly the "squashed, yet the branch does not look connected" case
  is correctly visualized. Regular merge PRs also get a dashed line,
  but it merely overlaps a real edge and does no harm.
- Merges older than the most recent 50 are out of scope. gh and a
  GitHub remote are required.
