# ADR 0076: Hand the secret over in a POST, at a fixed address

## Status

Accepted (2026-11-02). Amends [ADR 0063](0063-request-token.md),
[ADR 0072](0072-no-browser-showing-the-secret.md) and
[ADR 0073](0073-page-under-a-path-of-each-start.md).

## Context

The page was opened at `http://127.0.0.1:<port>/<path>/#token=<secret>`,
the path new at each start ([ADR 0073](0073-page-under-a-path-of-each-start.md)).
The address changed at every start, so it could not be bookmarked, and a
person reading it could not tell a right one from a wrong one. The secret
sat in the address: in the address bar, in the history, and, where the
address itself was handed to the browser, on its command line.

A form submitted with `POST` is never answered from the browser's cache,
so a navigation by `POST` reaches the server even where another program
left a cached response at the same address. On 2026-11-02, in Chromium
with storage partitioning on, a launcher file submitting a form to
`http://127.0.0.1:<port>/` reached the server past a page cached there
for a year, and the page then set its address to `/` with
`history.replaceState`, after which a reload asked nothing and fetched
`/` with `GET`. A service worker left on the port still answered the
`POST` and read the secret in its body, as it read the fragment before.

## Decision

- **The page lives at `/`.** The address `gitreant` and `gitreant list`
  print is `http://127.0.0.1:<port>/`, the same at every start, with no
  secret in it.
- **The launcher file posts the secret.** Wherever a launcher file can be
  written, Windows included, the browser opens a file holding a form that
  submits the secret to `/` by `POST`. The server answers a `POST` to `/`
  whose secret matches with the page, the secret written into it, never
  cached and clearing the origin's cache; one whose secret does not match
  gets no page. The page keeps the secret for its tab and sets its address
  to `/`.
- **A `POST` to `/` passes the request guard from any origin.** The
  launcher's origin is `null`, so the check of
  [ADR 0038](0038-loopback-request-guard.md) on state changes does not
  apply to it; the check of the name it is addressed to still does, and
  the secret in its body stands in for the origin.
- **The address is handed over only where no launcher file can be.** With
  `--no-launcher`, and on Android, where the browser cannot read the
  launcher, the browser is handed
  `http://127.0.0.1:<port>/?<value>#token=<secret>`, whose query, new at
  each start, keeps it clear of a response another program cached. In WSL
  and where the launcher file cannot be written, the browser is not
  opened, as [ADR 0072](0072-no-browser-showing-the-secret.md) decided.

## Consequences

- The address is the same at every start and carries no secret, so a
  person can check it at a glance and keep it as a bookmark. A tab opened
  from it has no secret and says how to open one that has.
- On Windows the browser no longer receives the secret on its command
  line.
- A reload, or a bookmark of `/`, asks the server with `GET`. It is kept
  clear of a response another program cached only where the browser
  clears its cache on `Clear-Site-Data: "cache"`.
- A service worker left on the port still reads the secret, the case ADR
  0073 accepts.
- The launcher's form, the guard's exception for a `POST` to `/`, the
  page answered to a matching and a mismatching secret, and the page's
  reading of the secret are each tested.
