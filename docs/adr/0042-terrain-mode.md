# ADR 0042: Show the history as terrain, raised by lines added and deleted

## Status

Accepted (2026-10-23)

## Context

[ADR 0041](0041-diff-stats-per-commit.md) puts each commit's lines added
and deleted in its row, as `+N −M`. Read one row at a time, the numbers do
not show where in the history the large changes cluster, or which branch
carried them. Height does: a graph tilted back, with each commit raised by
its size, shows the large changes as peaks across the whole history at
once.

A tilted graph no longer lines up with the rows beside it, so it cannot
share the rows' layout.

## Decision

- **A mode of its own, per pane.** A button in the pane's header switches
  the pane between the rows and the terrain. The terrain takes the place
  of the graph and its rows; the diff pane still replaces both. The pane
  opens in rows; the choice is not saved.
- **What it draws.** The main graph's commits that the pane has loaded in
  rows, with its edges on the ground. The terrain fills the pane and does
  not scroll, so it loads no more. Submodule regions and squash-merge links
  are not drawn.
- **Pillars.** Each commit stands a green pillar up by its lines added and
  a red pillar down by its lines deleted. Its height is
  `8 × log2(1 + lines)` pixels, so a one-line fix and a lockfile rewrite
  both stay readable. A commit not counted yet, and the uncommitted row,
  have no pillars.
- **Projection.** A commit stands on the ground at its place in the rows'
  graph. The ground turns about the vertical axis through a pivot, the
  ground point drawn at the pane's center, by the rotation; then it tilts
  back by the tilt, is projected straight onto the screen (orthographic,
  no perspective) and scaled by the zoom. Turning about the pivot keeps
  what is in the middle of the pane there. Pillars are drawn from back to
  front. The tilt stays between 0° (from above) and 85°.
- **The start.** The terrain opens at a rotation of 30° and a tilt of 60°,
  pivoted on the middle of the loaded commits and zoomed out until every
  node and pillar fits the pane, but never zoomed in past its natural size.
  It is fitted once, when it opens; counts arriving later do not move it.
- **Moving it.** Dragging sideways rotates the terrain and dragging up or
  down tilts it. A right drag or a Shift drag moves the ground with the
  pointer. The wheel zooms about the pointer, keeping the ground under it
  in place, between 0.02 and 8 times. With the terrain focused, `←` / `→`
  rotate it by 15°, `↑` / `↓` tilt it by 5°, `+` / `-` zoom it by 1.25
  times about the pane's center and `0` returns to the start. The
  selection keys of [ADR 0035](0035-graph-node-navigation.md) are off in
  this mode, since there are no rows to select. Every change takes effect
  at once, without animation, so it needs nothing more under
  `prefers-reduced-motion`.
- **Reading it.** Hovering a commit's node or pillar shows its hash,
  summary and `+N −M`.

## Consequences

- The projection is a pure function, checked by unit tests, and draws into
  SVG like the rows' graph; no 3D library is added.
- Every loaded commit is drawn, so a pane that has loaded thousands of
  commits draws thousands of pillars.
- A cumulative chart, still in the [ROADMAP](../ROADMAP.md), can sit beside
  this mode as another view of the same counts.
