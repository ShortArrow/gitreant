# ADR 0012: Record user actions client-side and merge them into the log

## Status

Accepted (2026-07-13)

## Context

The log pane (ADR 0009) is a record of the external commands the
server executed; it does not capture what the user triggered in the
UI (fetch, reload, repository add/remove). We want to display these
as operation feedback to the user.

## Decision

- User actions are recorded client-side only, as frontend state
  (`UserAction` in `logModel.ts`). The server's command log keeps
  its meaning as "a record of executed external commands" and the
  two are not mixed.
- The log pane merges both by timestamp for display (`mergeLog`).
  On equal timestamps the action is placed on the older side of the
  command — because the action is what triggered the command.
- The action log is lost on a page reload. It exists for feedback,
  so it is not persisted.

## Consequences

- No server API changes. Actions that go unrecorded (such as
  automatic reloads caused by SSE) are by design — only actions the
  user performed are captured.
- If actions that should be recorded server-side emerge in the
  future, consolidating them into a server log with entry kinds will
  be considered in a separate ADR at that point.
