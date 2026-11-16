# ADR 0083: A ticket in a link opens the page once

## Status

Accepted (2026-11-16)

## Context

The page needs the server's secret ([ADR 0063](0063-request-token.md)).
`gitreant` and `gitreant open` hand it over through a launcher file that
posts it, or, with `--no-launcher` and on Android, in the fragment of the
address they open ([ADR 0076](0076-post-the-secret.md)). Both open the
browser themselves.

A program that only shows the user a link, such as another program's
terminal or a session that coordinates work on the machine, has neither.
A link to `http://127.0.0.1:<port>/` opens a page without the secret. A
link holding the secret puts it on the screen, in the clipboard, in the
terminal's scrollback and on the command line of the browser the link is
handed to. It stays there for as long as the server runs, which is what
[ADR 0072](0072-no-browser-showing-the-secret.md) and ADR 0076 keep the
secret away from.

## Decision

- **`gitreant open --ticket` prints a link holding a ticket.** It has the
  running server prove the secret, as `gitreant open` does
  ([ADR 0075](0075-prove-before-opening.md)), asks it for a ticket, and
  prints `http://127.0.0.1:<port>/#ticket=<ticket>`. It opens no browser.
- **The server issues a ticket only to a holder of the secret.** A
  `POST /api/tickets` carries the secret like any API request. The ticket
  is 32 bytes from the operating system's cryptographic random source, in
  hexadecimal. The server holds it in memory only, with the time it was
  issued. It is never written to the server's record or its command log.
- **A ticket trades for the secret once, within 60 seconds.** A
  `POST /api/tickets/redeem` needs no secret, but still passes the request
  guard of [ADR 0038](0038-loopback-request-guard.md): a loopback name, and
  the page's own origin. It is answered with the secret, never cached, when
  its ticket was issued less than 60 seconds before and was not traded yet.
  The ticket is removed at that trade, so the next try with it fails. A
  ticket that is spent, expired or never issued gets 403 and nothing of the
  secret. Tickets are compared in constant time, and expired ones are
  dropped when the next one is issued.
- **The ticket rides in the fragment.** A fragment never reaches a server,
  so the ticket is in no request line, access log or `Referer`. The page
  takes it out of its address and the session's history before it trades
  it, and then keeps the secret for its tab as it keeps one handed over in
  any other way. A page whose ticket is refused has no secret and names
  `gitreant open`.

| Alternative | Why not |
|---|---|
| A link holding the secret | The secret then stays wherever the link went, for as long as the server runs |
| A `file:` link to the launcher file | It exists only where a launcher file is written, which excludes WSL. A terminal or a remote view that shows links may not open `file:` links |
| A ticket that lasts until the server stops | A link copied or read later would still open the page |

## Consequences

- A ticket is worth what the secret is worth, but only until it is traded
  or 60 seconds pass. The secret lives until the server stops. Within that
  window, whoever reads the link from the screen, the clipboard, the
  scrollback or a log of the program that showed it, and trades it first,
  gets the secret. The user's page is then refused and names
  `gitreant open`. That refusal is the only sign that someone else traded
  the ticket.
- A link clicked in a terminal is usually handed to the browser on its
  command line. On Linux and macOS another account can read it there
  ([ADR 0071](0071-other-accounts-in-scope.md)) and trade the ticket before
  the browser does. This is the exposure of `--no-launcher`, limited to one
  trade within 60 seconds. Printing a ticket is the user's choice, as
  `--no-launcher` is.
- A service worker or a cached page that another account left on the port
  reads the fragment and can trade the ticket. This is the case
  [ADR 0073](0073-page-under-a-path-of-each-start.md) and
  [ADR 0079](0079-accept-the-cache-with-the-service-worker.md) accept for
  the secret.
- The link opens the page only in a browser on the machine the server runs
  on, since it names `127.0.0.1`.
- Tests cover: a ticket that trades once, an expired ticket, an unknown
  ticket, and issuing without the secret. They also check the trade in a
  running server, never cached; the page taking the ticket out of its
  address before trading it, and opening without a secret when the trade
  is refused; and the link's address. A page opened without a ticket
  behaves as before.
