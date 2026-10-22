# ADR 0038: Answer only requests addressed to the loopback server from its own page

## Status

Accepted (2026-10-22)

## Context

The server listens on 127.0.0.1 only, and nothing else stood between a
request and the API. A browser lets any page send it requests:

- `POST /api/shutdown` and `POST /api/refresh` take no body, so a page on
  any site can send them without a CORS preflight and stop the server or
  drop its signature cache.
- With DNS rebinding, a site's own name resolves to 127.0.0.1. The browser
  then treats the server as that site's origin, and the page can read the
  API and send JSON requests to it: check out, merge, create and delete
  tags and branches.

The JSON endpoints were safe from other sites only because a JSON
`Content-Type` needs a preflight the server never answers.

## Decision

- **Host.** Every request must name a loopback host in its `Host` header:
  `127.0.0.1`, `localhost` or `[::1]`, with any port. Any other name is
  answered 403. A rebound name is not a loopback name, so DNS rebinding
  reaches nothing.
- **Origin.** A request other than `GET` and `HEAD` that carries an
  `Origin` header must come from the server's own origin: `http`, a
  loopback host and the server's port. Any other origin is answered 403. A
  request without `Origin` passes: browsers attach it to every such
  request, so its absence means a client such as the gitreant CLI, which
  could reach the port directly anyway.
- **The development proxy.** `pnpm dev` serves the SPA from its own port
  and proxies the API; the proxy rewrites `Origin` to the backend's, as
  if the page were served by gitreant.

## Consequences

- Reads stay open to any loopback client; the guard is about what a
  browser page from elsewhere can do, not about other local processes.
- A page served by another program on another loopback port cannot drive
  gitreant either.
- A web control that changes the server's state, such as a restart
  button, is guarded the same way as the endpoints already there.
