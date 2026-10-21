# ADR 0035: Navigate, compare and check out from graph nodes

## Status

Accepted (2026-10-21)

## Context

A graph node opens the commit menu and shows its hash on hover
([ROADMAP](../ROADMAP.md), 0.2.0). Everything else about a commit's place
in the history is read off the graph by eye: which commits a node descends
from, which commit follows it, what changed between two commits that are
not parent and child. A pane holds one selected commit, chosen by clicking
a row or node; there is no keyboard path to it.

Hovering a branch badge already fades the rows its tip cannot reach
(`reachableFrom` in `graph.ts`). The diff endpoints compare a commit with
its first parent only. `POST /api/checkout` runs `git switch <ref>`, which
git refuses for a bare commit id.

Writes go through the commit menu with the git command
([ADR 0014](0014-branch-operations.md), [ADR 0021](0021-tag-operations.md)),
and QUALITY.md already counts checkout among them.

## Decision

These apply to the main graph of a pane. A submodule graph has no
selection and gets none of them.

- **Lineage.** Hovering a node fades every row, node and edge outside its
  first-parent chain among the loaded commits. Leaving the node or a
  reload ends it. A branch badge's hover fades nodes and edges the same
  way, not only rows.
- **Selection by keyboard.** In the focused pane, while no text field,
  menu, dialog or palette has the keyboard:
  - `↑` / `↓` move the selection to the row above or below. With nothing
    selected, any of the six moves selects the first row.
  - `←` / `→` move it to the nearest commit in the closest lane to the
    left or right: the nearest row, the upper one on a tie. With no lane
    that way, the selection stays. Parents and children are reached from
    the menu: in a straight stretch of history they are the rows above and
    below, so keys for them would only repeat `↑` / `↓`.
  - `Home` / `End` move it to the first or last loaded row.
  - `Enter` opens the diff of every file, as "Diff all" does.
  - `Esc` clears the selection.

  While the diff pane replaces the graph, the arrows rest and `Esc` clears
  the diff's line selection, or with none closes the pane. The selected
  row is scrolled into view. A setting, off by default, adds
  `k` / `j` / `h` / `l` for the four moves and `gg` / `G` for the first
  and last rows; the arrows, `Home` and `End` keep working.
- **Parent and child in the menu.** The commit menu lists "Parent" and
  "Child" entries for the loaded ones, each by short id and summary;
  choosing one selects it. A commit with none has no entry. Only loaded
  commits count as parents and children.
- **Comparing two commits.** With a commit selected, the menu of another
  commit offers "Compare with selected". The base is whichever of the two
  is an ancestor of the other among the loaded commits, otherwise the
  selected one. The diff pane shows base → target, headed `base..target`,
  and its permalinks use the base for the old side and the target for the
  new. The detail pane shows both commits, the base above the target, and
  every file that differs with its line counts; picking a file scrolls the
  diff to it. Closing either pane or changing the selection ends the
  comparison.
  The uncommitted row takes no part. The server compares the two commits'
  trees with the same reader as a commit diff, so the `diff` attribute and
  binary detection ([ADR 0033](0033-diff-attribute.md)) apply.
- **Detached checkout.** The commit menu offers "Check out (detached)",
  confirmed inline with Yes / Cancel as a branch checkout is. The server
  runs `git switch --detach <commit>`, logs it and notifies clients like
  every other operation. It takes only a full commit id, so a request
  cannot hand git an option in its place. git refusing because of local changes shows as
  the operation's error.

## Consequences

- A child or parent beyond the loaded pages cannot be reached from the
  menu until more history loads.
- Two commits on unrelated lines compare from the selected one; swapping
  base and target means selecting the other first.
- Keys reach the graph only when nothing else in the pane takes them, so a
  later shortcut has to be checked against these eight (and the
  optional six).
