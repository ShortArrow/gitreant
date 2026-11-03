# ADR 0080: Prove the server once when forwarding to it

## Status

Accepted (2026-11-03). Supersedes [ADR 0075](0075-prove-before-opening.md).

## Context

When `gitreant` forwards repositories to a running server, it proves the server
holds the secret in its record
([ADR 0064](0064-prove-the-secret.md)), asks it to add each repository,
and opens its page. ADR 0075 added a second proof just before the opening, for
a server that exits while the repositories are being added and an account that
takes the port in that time.

The second proof shortens that gap and does not close it, since whoever holds
the port when the browser connects is the one it reaches. What the account gets
in the gap is the secret of a server that has exited, which opens nothing, and
a page in the user's browser, where it can leave a service worker or a cached
response. [ADR 0073](0073-page-under-a-path-of-each-start.md) and
[ADR 0079](0079-accept-the-cache-with-the-service-worker.md) accept both, once
the browser opens such a page from a stale tab, a bookmark or the history.

## Decision

- **The CLI proves the server once, before it sends anything.** It does not
  prove it again before printing the page's address or opening it.

## Consequences

- The gap runs from the proof to the browser's connection, including the time
  the server takes to open the repositories. An account that takes the port in
  that gap gets its page opened, with no error from the CLI. This route joins
  the ones ADR 0073 accepts.
- A first proof that fails still sends nothing, which `tests/impostor.rs` checks.
