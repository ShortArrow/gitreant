# ADR 0039: Keep a record of each running server and let the CLI find it

## Status

Accepted (2026-10-22)

## Context

Every command that talks to a running server — `--shutdown`, `restart`,
`refresh` — reaches it by port, and the port defaults to 4000. A server
started on another port is stopped only by naming that port again, and
nothing lists which servers are running or where. The CLI can tell a
gitreant from anything else on a port (`GET /api/ping`), but it cannot
find a port it was not given. Nor can anyone tell how a repository came
to be shown: given at startup, handed over by another CLI call, or added
from the browser.

## Decision

- **A record per server.** A server writes `<port>.json` (port, pid, start
  time, version) into a per-user directory once it is listening, and
  removes it when it stops. The directory is `%LOCALAPPDATA%\gitreant\servers`
  on Windows, `~/Library/Caches/gitreant/servers` on macOS, and on other
  systems `$XDG_RUNTIME_DIR/gitreant/servers`, falling back to
  `$XDG_STATE_HOME`, then `~/.local/state`. `GITREANT_STATE_DIR` replaces
  the directory, for tests.
- **A record is a hint.** A record counts only while its port answers as a
  gitreant; one that does not, left by a server that crashed or was
  killed, is deleted when found. The repositories a server shows are asked
  of it, never stored.
- **A server records how each repository came.** With the time, it
  records one of: `startup` (given when the server started), `cli` (a
  request without `Origin`, such as the CLI handing a path to a running
  server) or `browser` (a request with `Origin`, which only the server's
  own page gets through, [ADR 0038](0038-loopback-request-guard.md)). A
  browser request also names why it adds the path: `add` (the drawer's
  input), `submodule` or `worktree` (a nested row opened); this is the
  page's own claim, and any other value is dropped. `GET /api/list` carries
  the record as `added`.
- **`gitreant list`** prints one line per running server — URL, pid, start
  time, version and how many repositories it shows — or that none is
  running. `--verbose` lists each server's repositories under it, with how
  and when each came; `--json` prints all of it for programs.
- **The port is found when not given.** `--shutdown`, `restart` and
  `refresh` without `--port` act on the only running server. With none,
  they use 4000 as before; with several, they list them and fail, asking
  for `--port`. `--shutdown --all` stops every running server.

## Consequences

- A server started by a version before this one writes no record, so it is
  neither listed nor found until it is restarted.
- Starting a server still uses `--port` or 4000; finding one is only for
  the commands that talk to a running server.
- `restart` gives the new server its repositories as arguments, so they
  are recorded as `startup` again.
- The records are as trustworthy as the directory they sit in, so the
  directory is per user; a record never makes the CLI act on a port that
  does not answer as a gitreant.
