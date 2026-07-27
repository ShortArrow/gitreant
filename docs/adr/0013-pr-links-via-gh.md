# ADR 0013: Fetch PR data lazily through the gh CLI with a TTL cache

## Status

Accepted (2026-07-13)

## Context

When a branch has an open Pull Request, we want the badge to link to
the PR's web page. The mapping between PRs and branches is GitHub-side
state and cannot be derived from the repository's local state.

## Decision

- Delegate fetching to
  `gh pr list --state open --json number,url,headRefName`
  (the same CLI-delegation pattern as ADR 0007/0011). It rides on the
  user's `gh` authentication as-is; when gh is not installed, not
  authenticated, or there is no GitHub remote, it quietly degrades to
  an empty list.
- Because this is a network call, it is not part of repository reads
  (`/api/repos`); the frontend lazily fetches a dedicated
  `POST /api/prs` when a RepoCard is shown. Results are cached per
  repository with a **5-minute TTL**.
- Executed gh commands are recorded in the command log (ADR 0009).
- The UI appends a `#<number>` link segment to the end of the branch
  badge, opening the PR page in a new tab.

## Consequences

- In environments where gh is available, one click takes you from a
  branch to its PR.
- PR open/close state is reflected with up to the cache TTL (at most
  5 minutes) of delay. If immediate reflection becomes necessary,
  consider invalidating the cache from the fetch button.
- Hosting other than GitHub (GitLab, etc.) is out of scope; extend in
  a separate ADR if the need arises.
