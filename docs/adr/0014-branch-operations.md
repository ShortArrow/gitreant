# ADR 0014: Run branch operations from badge context menus via the git CLI

## Status

Accepted (2026-07-14)

## Context

From a branch badge on the graph, we want to copy the branch name,
check the branch out, and merge it into the current branch. checkout /
merge are operations that modify the working tree, so hooks, user
configuration, and conflict handling should follow the behavior of
git itself.

## Decision

- Show a custom menu on the badge's `contextmenu`. Left-click behavior
  is unchanged (to prevent accidental operations). The items are
  Copy branch name / Checkout / Merge into <current branch>.
- The two mutating operations go through an inline confirmation
  (Yes/Cancel) inside the menu before calling `POST /api/checkout` /
  `POST /api/merge`. The server delegates to `git switch <branch>`
  (`switch --detach` for remote-tracking branches) and
  `git merge --no-edit <ref>` (the ADR 0007 pattern).
- Executed commands are recorded in the command log (ADR 0009), and on
  completion all clients are notified of the update via SSE. git
  failures (conflicts, etc.) are returned as HTTP 200 + `ok:false`,
  with stderr shown in the UI as-is. Resolving the conflict itself is
  left to the user's terminal.
- The merge message is the default wording from `--no-edit`. The
  server has no terminal to host an editor.

## Consequences

- Switching and merging branches takes one or two clicks from the UI.
- On conflict, only the error is shown and the repository stays in the
  conflicted state (same as git). Conflict-resolution support in the
  UI is a future, separate ADR.
- Branch creation, deletion, and rename are not supported. Add them to
  the same menu when they become necessary.
