# ADR 0063: Require a secret made at each start on every API request

## Status

Accepted (2026-10-29)

## Context

The server answers requests addressed to its loopback name, and a page's
only from its own page ([ADR 0038](0038-loopback-request-guard.md)). It
lets the rest through: "A request without `Origin` passes: browsers
attach it to every such request, so its absence means a client such as
the gitreant CLI, which could reach the port directly anyway." That holds
on a machine one person uses. Where other accounts share the machine,
or a container or sandbox shares its loopback, any of them reaches the
port too, and without `Origin` it may read every repository the server
shows, change them, and open their files with the user's editors
([ADR 0062](0062-open-with-editors.md)) as the user.

## Decision

- **A secret made at each start.** The server draws 32 bytes from the
  operating system's cryptographic random source at start and writes
  them as 64 hexadecimal digits. If the source fails, the server does not
  start: it never falls back to a weaker secret. The secret lives as long
  as the process; a restart makes a new one.
- **Every API request carries it.** A request to `/api/` needs the secret
  in the `X-Gitreant-Token` header, or, for the event stream a browser
  opens without headers, in a `token` query parameter; it is compared in
  constant time, and a request without it gets 401. `/api/ping`, which
  only says a gitreant answers, needs none, so the CLI can still find
  running servers. The page itself and its files need none either: they
  hold no repository's data.
- **The page gets it in the address that opens it.** `gitreant` opens the
  browser at `http://127.0.0.1:<port>/#token=<secret>`. A fragment never
  reaches a server; the page reads it, removes it from the address so it
  stays out of history, and keeps it in the storage of its own origin,
  which a page on another port cannot read. A page opened without it, or
  with a secret from an earlier start, says to open gitreant from its
  command, and `gitreant list` prints each server's address with its
  secret.
- **The CLI reads it from the server's record.** The record each server
  writes ([ADR 0039](0039-server-records.md)) holds its secret, in the
  user's own directory; on Unix the file is readable by its owner only.
  The CLI's requests to a server carry the secret its record holds.
- **Not a signed token.** The secret says only that a request comes from
  the page or the CLI of this user and this start; it carries no claims,
  expiry or keys, so a JSON Web Token would add parsing and algorithm
  choices with nothing to carry.

## Consequences

- Reading the secret's header or query, comparing it in constant time and
  leaving `/api/ping` and the page open are unit-tested; the server's
  tests send the secret, and the end-to-end tests open the page from its
  address with the secret rather than adding it to the browser's every
  request, so they check that the page sends it.
- A bookmark of the bare address no longer opens a working page; it says
  how to open one.
- The address with the secret passes through the browser's command line
  when gitreant opens it, which other accounts on some systems can read
  while the browser starts.
