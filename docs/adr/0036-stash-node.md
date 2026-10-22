# ADR 0036: Draw a stash apart from the line it sits on

## Status

Accepted (2026-10-22)

## Context

A `git stash` entry is a commit whose first parent is the commit HEAD was
on when it was made. The layout treats it like any other commit: stashed
on HEAD, it takes the column reserved for the checked-out branch and that
column's color, and its node is the filled circle every commit gets. In
the graph it reads as one more commit on the branch; only the `stash`
badge on its row says otherwise.

The graph already gives a meaning to its other marks. A hollow ring is
HEAD and a dashed ring the uncommitted row. Dashed lines are auxiliary
links: a squash-merged PR ([ADR 0018](0018-squash-merge-links.md)), a
stash's index and untracked-files helpers, and the uncommitted row's link
to HEAD. A dotted line beside these dashes would be hard to tell apart at
the graph's 2px stroke, over an edge that is often a single row long.

## Decision

- **Its own color.** A stash takes a fresh color, the way a new branch tip
  does, whichever column it sits in. Its node and its line down to its
  first parent use that color; the column keeps its own color for the
  line below, so the branch under the stash is drawn as it would be
  without it. The layout marks the node as a stash (`stash` on the node and
  the commit view).
- **A ring around a dot.** The stash's node is a ring in its color with a
  filled dot in the middle, as vscode-git-graph draws one. HEAD's ring is
  empty, so the dot tells the two apart.
- **The line stays solid.** The link to the first parent is real ancestry,
  so it is drawn like any first-parent edge, not dashed.

## Consequences

- Colors are handed out in order, so a stash shifts the color of every
  branch that starts below it by one, as an extra branch would.
- The palette has eight colors and cycles. With many branches a stash can
  still share a color with a branch near it; choosing colors by what is in
  use nearby is a separate change in the [ROADMAP](../ROADMAP.md).
