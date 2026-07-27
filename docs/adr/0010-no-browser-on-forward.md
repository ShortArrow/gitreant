# ADR 0010: Do not open a browser when forwarding to a running server

## Status

Accepted (2026-07-13)

## Context

Running `gitreant` a second or later time forwards the repository to
the running server (single-instance behavior, ADR 0002), but each
time `open_browser` opened a new tab. For users who already have a
tab open and in use, this only piles up tabs and gets in the way.
Moving focus to the existing tab was also considered, but browsers,
for security reasons, do not allow `window.focus()` from external
processes or other tabs, so it cannot be done.

## Decision

- **The forwarding path (`forward_to_running`) does not open a
  browser.** Instead, the running server's URL (`already serving on
  http://127.0.0.1:<port>`) is printed to standard output so the
  user can click or copy it if needed.
- Auto-open on the fresh-start paths (detached start and
  `--foreground`) stays as before (suppressible with `--no-open`).

## Consequences

- If the tab has been closed and gitreant is started a second time,
  no browser opens automatically. Open the printed URL, or run
  `--shutdown` once and start again.
- This relies on SSE live updates (the forwarded result is reflected
  immediately in the existing tab).
