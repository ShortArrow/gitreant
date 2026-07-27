# ADR 0021: Tag operations also delegate to the git CLI, from row and badge menus

## Status

Accepted (2026-07-15)

## Context

Tags are now displayed distinctly from branches (refs with a kind).
Next we want to create and delete tags from the UI. The approach can
be the same as branch operations (ADR 0014).

## Decision

- **Create**: right-clicking a commit row shows a menu with a name
  input; `POST /api/tag` → `git tag <name> <commit>` (lightweight).
  Annotated tags are out of scope because they would require a
  message input UI (extend if the need arises).
- **Delete**: from the tag badge's right-click menu (copy name /
  delete), with confirmation, `DELETE /api/tag` → `git tag -d <name>`.
  Local deletion only; no push/deletion to remotes (per the policy
  that no outbound operations other than fetch are introduced).
- Executed commands are recorded in the command log, and completion
  is propagated to all clients via SSE. On failure, stderr is shown
  in the UI as-is.

## Consequences

- Retargeting a tag (forced overwrite) is two operations:
  delete then create. `-f` is never issued.
- No operation menu is shown for stash and "other"-kind refs.
