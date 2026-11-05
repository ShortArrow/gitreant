# ADR 0082: The event stream carries the secret in its header

## Status

Accepted (2026-11-05). Amends [ADR 0063](0063-request-token.md).

## Context

ADR 0063 had every API request carry the server's secret in the
`X-Gitreant-Token` header, except "for the event stream a browser opens
without headers", which carried it in a `token` query parameter. The page
opened that stream with `EventSource`, which cannot set a header.

The query did not reach the address bar or the browser's history. It did
reach everything that records a page's requests. A Lighthouse report of the
page, written to a file for reading elsewhere, held
`/api/events?token=<secret>` with the secret still valid. Developer tools and
their exported request logs show it the same way. Every other route of the
handover keeps the secret out of an address that reaches the server
([ADR 0076](0076-post-the-secret.md)), so this was the one left.

## Decision

- **The page reads the stream with `fetch`.** `frontend/src/eventStream.ts`
  opens `/api/events` with the same `apiFetch` as every other request, so the
  secret rides in the header, and parses the stream's text itself.
- **The server no longer reads the query.** A request to `/api/events` with
  the secret only in its query gets 401, as any other route does.
- **It behaves as `EventSource` does where the page relies on it.** It reports
  each connection, connects again after a drop, after the `retry` the server
  set or three seconds, and stops when the server answers with an error.

| Alternative | Why not |
|---|---|
| Keep `EventSource`, and accept the query | The secret stays in every record of the page's requests while it is valid |
| A cookie the browser sends with the stream | It belongs to the origin, and the secret is kept for one tab ([ADR 0073](0073-page-under-a-path-of-each-start.md)) |
| A short-lived ticket in the query, got with the secret | It adds a second credential and state on the server to keep one address clean, where a header needs neither |

## Consequences

- Connecting again is gitreant's own code, and its tests cover the drop, the
  server's delay, the refusal and the close.
- A 401 on the stream now reaches the page as any other request's does. A tab
  left open across a restart says it lacks the server's secret when its stream
  connects again, rather than at its next request.
- The parser reads lines ending in `\n` or `\r\n`, which is what the server
  writes. A lone `\r`, which the event stream format also allows, is not read
  as an ending.
- A request log still shows the header's value to whoever reads it in
  developer tools, and a request log exported with headers holds it.
