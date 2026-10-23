# ADR 0045: Tilt the graph's thickness by dragging its background

## Status

Accepted (2026-10-23)

## Context

[ADR 0044](0044-graph-thickness.md) gives each counted commit a thickness
that extrudes up and to the left for the lines it added and down and to
the right for the lines it deleted. A fixed direction hides what lies
behind a tall pillar or fin, and a fixed depth leaves no way to look at
the graph flat again short of the setting.

## Decision

- **Dragging the background tilts it.** Dragging the graph's background
  sideways turns the direction the thickness extrudes in, half a degree
  per pixel; dragging it up deepens the thickness and down makes it
  shallower, down to none, as if seen from straight above. Nodes and
  dashed links keep their own clicks and drags.
- **Within its range.** The depth runs from 0 to 1, where 1 is the
  thickness ADR 0044 describes; the direction turns all the way round.
  Double-clicking the background returns to the start: up and to the left,
  at depth 1. The tilt is not saved.
- **Rows stay put.** The rows, nodes and edges never move. The room the
  main graph keeps on each side is the farthest a thickness can reach in
  any direction, so turning it never shifts the lanes or cuts it off.

## Consequences

- The tilt is a pure function of the drag, checked by unit tests.
- The graph keeps 36 pixels on each side while the thickness is on,
  rather than the 22 a fixed direction needed.
