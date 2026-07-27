# ADR 0007: Delegate remote fetch to the git CLI

## Status

Accepted (2026-07-10)

## Context

Like vscode-git-graph, we want a fetch button in the UI that pulls in
new commits from remotes. gitreant's git reads are done entirely with
the pure-Rust gix, and working as a standalone binary was a benefit.
Fetch, however, involves authentication: reimplementing HTTPS
credential helpers, SSH agents, and per-host configuration in gix is
complex, and owning code that handles credentials carries significant
risk.

## Decision

- **`POST /api/fetch` delegates to the installed `git` CLI**
  (`git -C <repo> fetch --all --prune --quiet`). The user's git
  configuration, credential helpers, and SSH agent are used as-is,
  and gitreant never touches credentials.
- All displayed repositories are fetched in sequence; failures are
  returned per repository as `{errors: [{repo, message}]}` (one
  failure does not stop the others).
- After the fetch, an SSE update is fired and the frontend reloads.
- **Browsing stays on gix.** In environments without a git command,
  only fetch fails with a "git not found" error; the other features
  are unaffected.

## Consequences

- The git CLI is required in the runtime environment only when the
  fetch button is used.
- Remote-access behavior (proxies, insteadOf, authentication) matches
  the user's git configuration exactly.
- Operations that change the working tree, such as pull/push, remain
  out of scope.
