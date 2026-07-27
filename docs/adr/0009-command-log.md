# ADR 0009: Record executed external commands in a ring buffer shown in the UI

## Status

Accepted (2026-07-13)

## Context

Users had no way to see what gitreant executed behind the scenes
(notably `git fetch`). Like vscode-git-graph's output channel, we
want a log of executed commands.

## Decision

- The server's `AppState` holds a **ring buffer with a capacity of
  200**; each time an external command is executed, one entry is
  recorded (completion time, target repository id, command line,
  success/failure, and stderr on failure). At present the only
  external command is `git fetch` (ADR 0007). Repository reads via
  gix are not command executions and are not recorded.
- `GET /api/log` returns the whole buffer, oldest first. The
  frontend opens a bottom pane via a toggle in the top bar and shows
  entries newest first. While the pane is open, it refetches in step
  with repository state updates.
- The log lives in memory only (it is lost when the server stops).
  It is not persisted.

## Consequences

- Fetch failure reasons (authentication errors, etc.) can be checked
  directly from the UI.
- If more external commands are added in the future, they can be
  recorded in the same buffer. This presumes keeping command-line
  construction and execution separate
  (`git::fetch_command` / `git::fetch_remotes`).
- Entries older than the capacity are silently dropped. This is not
  meant as a long-term audit log.
