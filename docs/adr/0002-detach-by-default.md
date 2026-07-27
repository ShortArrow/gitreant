# ADR 0002: Detach from the terminal by default

## Status

Accepted (2026-07-09)

## Context

The reference implementation [k1LoW/mo](https://github.com/k1LoW/mo)
detaches the server into the background after the CLI runs and returns
control to the shell immediately (the default since v0.11.0). gitreant
so far blocked in the foreground and occupied the terminal. For the
"I want to look at the graph" use case, leaving the terminal free is
more natural, and we want to match mo's experience.

## Decision

- **Default behavior**: if no server is running, spawn our own
  executable as a detached process with `--foreground --no-open` and
  canonicalized path arguments. The parent polls `/api/ping` until it
  responds, then opens the browser, prints the URL and pid, and exits.
- **Detach mechanism**: on Windows,
  `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP`; on Unix,
  `process_group(0)` (a new process group). The child's standard
  streams are null.
- **Foreground mode**: `--foreground` runs the server in the current
  terminal (for debugging, or for test harnesses that want to kill it
  via a process handle).
- **Shutdown**: add a `POST /api/shutdown` endpoint, called from the
  CLI via `--shutdown`. Long-lived connections such as SSE stall a
  graceful shutdown indefinitely, so the server force-stops one second
  after the shutdown request.
- Do not adopt the restore file mo uses. gitreant's session state is
  reproducible from just the list of repository paths, which can be
  passed to the child process as arguments as-is.

## Consequences

- Callers that want to manage the server process directly (such as
  Playwright's global-setup) must pass `--foreground` explicitly.
- The detached child's stderr is discarded, so on startup failure the
  parent detects it as "ping never answered" or "child exited early"
  and suggests re-running with `--foreground`.
- Second-launch detection (`/api/ping` → forwarding to
  `POST /api/repos`) happens before the detach step, so the existing
  single-instance behavior is unchanged.
