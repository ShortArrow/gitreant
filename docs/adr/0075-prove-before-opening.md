# ADR 0075: Prove the server again just before handing out its page

## Status

Accepted (2026-11-01).

## Context

When `gitreant` finds its server already running, it proves the server
holds the secret in its record ([ADR 0064](0064-prove-the-secret.md)),
asks it to add each repository given, then prints the page's address and
opens it in the browser. The proof and the opening use separate
connections, and the requests to add repositories wait for the server to
open each one.

If the server exits in between and another account takes the port, the
browser opens that account's page. The secret in the address is then no
server's, but the page can leave a service worker that reads the secret
of the next gitreant whose page opens on that port in that browser, the
case [ADR 0073](0073-page-under-a-path-of-each-start.md) accepts. That
ADR names a stale tab or a bookmark as the way the browser reaches such a
page; here gitreant itself would take it there.

No check by the CLI can close the gap: whoever holds the port when the
browser connects is the one it reaches.

## Decision

- **The CLI proves the server again after adding the repositories**, just
  before it prints the page's address or opens it. A server that no
  longer proves the secret gets no page opened, and the CLI says which
  port could not prove it. The repositories it was asked to add stay
  added.

## Consequences

- The gap between the last proof and the opening no longer includes the
  time the server takes to open the repositories; it is the time it takes
  to print the address and start the browser.
- What remains is part of the case ADR 0073 accepts.
- A CLI test faces `gitreant` with a program that proves the secret the
  first time it is asked and not after, and checks that no address with
  the secret is printed and the CLI fails.
