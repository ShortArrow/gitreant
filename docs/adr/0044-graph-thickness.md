# ADR 0044: Give the rows' graph a thickness of the lines each commit changed

## Status

Accepted (2026-10-23). Supersedes [ADR 0042](0042-terrain-mode.md).

## Context

[ADR 0042](0042-terrain-mode.md) showed the lines each commit added and
deleted ([ADR 0041](0041-diff-stats-per-commit.md)) as pillars on a tilted
copy of the graph, in a mode of its own. A view turned away from the rows
no longer reads as the graph beside them, and it took the rows' place to
be seen at all.

An illustration tool's blend fakes depth on a flat drawing: copies of a
shape, stepped from one place to another, read as a solid. Drawn that way,
the size of each commit can sit on the graph that is already beside the
rows.

## Decision

- **On the rows' graph.** The main graph's counted commits get a
  thickness behind their nodes and edges; the rows, the nodes and the
  edges stay where they are. The terrain mode of ADR 0042 is removed.
- **Up for added, down for deleted.** Copies of a commit's node stack up
  and to the left by the lines it added, and down and to the right by the
  lines it deleted, every 2 pixels. A thickness is
  `3 × log2(1 + lines)` pixels, at most 36, so a one-line fix and a
  lockfile rewrite both stay readable and near their row.
- **Fins between commits.** Copies of an edge join the thickness at its
  child to the thickness at its parent, so the thickness runs along the
  history as a fin. A fin's copies are as wide as a node, so it reaches as
  far as the pillars at its ends. Dashed links and the uncommitted row's
  link stay flat; a commit not counted yet has no thickness.
- **Green and red, see-through.** The added side is green and the deleted
  side red, each drawn as one see-through shape, so its copies merge
  instead of darkening where they overlap. The thickness takes no pointer
  events: the nodes in front of it are clicked and hovered as before, and
  it fades with them off a hovered node's first-parent chain.
- **Room for it.** The main graph moves in by the farthest a thickness
  reaches sideways, on both sides, so it is not cut off.
- **A setting.** The graph settings turn the thickness on and off; it is
  on by default and the choice is saved. The command palette toggles it
  too.

## Consequences

- The copies are a pure function of the counts, checked by unit tests,
  drawn into the same SVG as the graph; no 3D library is added.
- A pane draws a copy every 2 pixels of thickness for each counted commit
  and edge, but only for the rows within a screen of the scroll, so a long
  history stays quick to draw and to tilt. The tilt and those rows live
  outside the card's state: a drag or a scroll redraws the thickness alone,
  not every row.
- Turning the thickness, by changing the direction and depth it extrudes
  in, can build on the same copies; it is in the
  [ROADMAP](../ROADMAP.md).
