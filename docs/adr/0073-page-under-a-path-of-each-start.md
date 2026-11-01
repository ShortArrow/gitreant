# ADR 0073: Open the page under a path of each start, and accept what a service worker left

## Status

Accepted (2026-11-01).

## Context

The page opened at `http://127.0.0.1:<port>/#token=<secret>`
([ADR 0063](0063-request-token.md)). A browser keeps what an origin left
behind, its cache and its service workers, across the programs that serve
it, and the origin is only the address and the port. Another account,
which [ADR 0071](0071-other-accounts-in-scope.md) puts in scope, can take
a port gitreant has left and serve a page there. If the user's browser
opens that address while it does, from a stale tab, a bookmark or the
history, the page can leave a response cached for a year or a service
worker. When gitreant later starts on the same port and opens its page,
the browser answers from what was left without asking the server, and the
planted script reads the secret from the address or from the page's
storage. A page the user left open while that program held the port keeps
running after it lets go, and reads what the real page later writes to
the origin's storage.

Any origin kept across starts can be poisoned this way, including a name
under `localhost` known only to the user, since the browser reveals it to
whoever holds the port when it is opened. Handing the secret over some
other way does not help: the poisoned page runs as that origin's script
and receives whatever the page would. Opening the page at a name new at
each start does close it, but every setting the page keeps in the
browser's storage, such as the language, the theme, the date format and
the panel widths, belongs to one origin, so each start would lose them
all.

Within one origin the two ways differ. A cached response answers only for
its own address, and the server can clear the origin's cache with
`Clear-Site-Data: "cache"`, which leaves the page's storage in place. A
service worker answers for every address under it before the server is
asked, and only `Clear-Site-Data: "storage"` removes it, which also
removes every setting. Both ways, and both headers, were tried on
2026-11-01 in Chromium with storage partitioning on, as Chrome ships it.

## Decision

- **The page lives under a path of this start.** It is served at
  `/<path>/`, where the path is 32 hexadecimal digits of
  `HMAC-SHA256(secret, "page path")`: new at each start, unknown before
  it, and telling nothing of the secret. The addresses gitreant opens and
  prints carry it. A request for any other path is sent on to it with a
  `303` that is never cached.
- **The page clears the origin's cache.** Its response is never cached
  and carries `Clear-Site-Data: "cache"`.
- **The page asks the API past the cache.** Its requests are made with
  `cache: "no-store"`.
- **The page keeps the secret for its own tab.** It holds it in the tab's
  session storage rather than the origin's storage that every tab of the
  origin reads, and drops a secret an earlier version kept there.
- **What another account's page leaves running is accepted** as a way to
  read the secret: a service worker, or a window of that page that holds a
  reference to the tab the page later loads in, which the same-origin
  policy lets it read. It needs all of the following:
  - another account, not an administrator, holds the port gitreant left;
  - the user's browser opens that address while it does;
  - gitreant later starts on the same port and its page is opened in that
    browser, before the browser drops the worker, or in a tab that window
    holds, which gitreant's own opening never uses.

## Consequences

- A response another program left in the browser's cache does not reach
  the page opened from gitreant. Where the browser clears its cache on
  `Clear-Site-Data: "cache"`, it does not reach a bookmark of `/` either.
- The page's settings stay across starts. A tab opened without the
  secret, from a bookmark or by hand, has none and says how to open one
  that has it.
- The path is not a secret: whoever connects learns it from the `303`. It
  only has to be unknown before the start.
- Other accounts get nothing without the secret, except as accepted
  above. Clearing the browser's site data for `127.0.0.1` removes a
  service worker; closing that page's windows removes the rest.
- The path's derivation and the routing are unit-tested; the `303`, the
  headers and the page's files at the path are tested against a running
  server; and the page's requests are tested to skip the cache and its
  secret to stay out of the origin's storage.
