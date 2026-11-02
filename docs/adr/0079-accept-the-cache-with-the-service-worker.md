# ADR 0079: Accept what another account's page leaves in the cache, as its service worker is

## Status

Accepted (2026-11-02). Amends [ADR 0073](0073-page-under-a-path-of-each-start.md)
and [ADR 0076](0076-post-the-secret.md).

## Context

[ADR 0073](0073-page-under-a-path-of-each-start.md) accepts that a service
worker left by another account's page reads the secret. Four measures still
kept that page's cached responses away from gitreant's page: a base path new
at each start for the page's files, a query new at each start on an address
holding the secret, `Clear-Site-Data: "cache"` on the page, and
`cache: "no-store"` on its API requests.

A page can leave a cached response only when the browser opened it while
another account held the port, and that is also all it needs to register a
service worker. The worker reads the secret in the `POST` that opens the page
([ADR 0076](0076-post-the-secret.md)), so an attacker who can use the cache
has no need of it. The four measures close one of two routes open under the
same conditions.

They would still count in a browser where a service worker cannot run.
Copies of MDN's documentation name Firefox's private windows as one. On
2026-11-02, Playwright's build of Firefox 151 was started headless with
`--private-window` against a local program playing both parties. The window
was private: `navigator.storage.getDirectory()` failed with `SecurityError`
there and worked in a normal window. A service worker registered in it read
the secret in the `POST`, as in a normal window. Without the four measures, a
script cached for a year at the address of the page's file read the secret
from the page in both kinds of window. Safari was not tried.

## Decision

- **A response another account's page leaves in the browser's cache is
  accepted**, under the conditions ADR 0073 lists for its service worker.
- **The page loads its files from where they are**, with no base path, and an
  address holding the secret is `http://127.0.0.1:<port>/#token=<secret>`,
  with no query.
- **The page no longer asks the browser to clear its cache**, and its API
  requests no longer ask to skip it.
- **The page's own response stays `no-store`**, since it can hold the secret.

## Consequences

- A cached script, or a cached page at `/`, can read the secret in any browser,
  not only one running the service worker. In a browser that has service
  workers turned off, as a policy can do, the cache is a way in that was closed
  before.
- There is one thing to say about what such a page leaves: clearing the
  browser's site data for `127.0.0.1` removes it.
- `gitreant` no longer derives a value from the secret to name the page's path.
- A test against a running server checks that the page carries no base and no
  `Clear-Site-Data`, and stays `no-store`. A unit test checks the address.
