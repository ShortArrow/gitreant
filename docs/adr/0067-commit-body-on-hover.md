# ADR 0067: Show a commit's message body when the pointer rests on its row

## Status

Accepted (2026-10-31)

## Context

A commit row shows only the summary, the first line of the message. The
rest of the message, the body, shows only in the detail pane, and opening
the pane replaces the commit it was showing. Reading the bodies of a few
commits in turn therefore loses the pane's place each time.

The repository view the server sends carries each commit's summary, not
its body. The body can be read with `/api/commit`, but that endpoint also
diffs the commit against its first parent, which takes long on a commit
that changed many files.

## Decision

- **The pointer resting on a commit row for 0.4 s shows the row's message
  body in a popup.** The popup goes away when the pointer leaves the row.
  Selecting the commit is not needed, and the detail pane does not change.
  A commit with no body shows no popup.
- **The body is read on demand, from a new endpoint `/api/commit-body`
  that returns only the body.** A card keeps each body it has read, and
  does not ask for it again.
- **The popup renders the body as the detail pane does:** paragraphs,
  bullet lists and code blocks.

## Alternatives

| Option | Why not |
|---|---|
| Send every commit's body in the repository view | The view would carry the body of every loaded commit, over a million in a history such as the Linux kernel's, though few of them are ever read. |
| Read the body with `/api/commit` | It diffs the commit too, on every row the pointer rests on. |

## Consequences

- A row the pointer rests on costs one request the first time.
- The popup shows the body only as far as its height allows.
