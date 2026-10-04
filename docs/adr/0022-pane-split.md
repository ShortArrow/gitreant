# ADR 0022: Pane splitting targets repository comparison, two side-by-side panes first

## Status

Accepted (2026-07-17)

## Context

We want to look at multiple repositories side by side (strengthening
mo-style multi-repository monitoring). A generic pane tree (VS
Code-style arbitrary splitting) and separating graph/diff within a
single repository were also candidates, but we confirmed that the
primary use case is "putting different repositories side by side".

## Decision

- **Start with two fixed panes (left/right).** The state model is a
  pane array `Pane { tabs, activeId }[]` plus the index of the
  focused pane, shaped so it extends to a future N-way split with no
  model change.
- **One repository = one tab across all panes.** "Open in right
  pane" is a move, not a duplication. There are no multiple views of
  the same repository (selection state and tab-name uniqueness are
  preserved, and duplication is unnecessary for comparison).
- **Three ways to split**: the tab's right-click menu, the drawer
  item's right-click menu, and the command palette (registered in
  the command registry).
- **A pane disappears when it runs out of tabs.** Closing the right
  pane's last tab (or losing it via repository removal) returns to a
  single pane. If the left pane runs out of tabs, the right pane slides left
  (simply removing empty panes from the array).
- **Focus**: clicking inside a pane moves focus. A normal click in
  the drawer opens in the focused pane. Repository operation
  commands (branch checkout etc.) are registered in the registry
  only by the focused pane's card.
- Pane transition logic is extracted into a pure function
  (`paneModel.ts`) and pinned down with unit tests.

## Consequences

- The tab bar moves from the top bar into the panes (at the top of
  each pane).
- Pane widths are an even 1:1 split for now. Drag-based ratio
  adjustment will be added by reusing `ResizeHandle` when needed.
- Separate graph/diff views and vertical splitting are out of scope
  for this ADR. If needed, a separate ADR will extend the pane array
  into a tree.
