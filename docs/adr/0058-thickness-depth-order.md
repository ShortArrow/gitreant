# ADR 0058: Order the thickness by depth, the added side in front

## Status

Accepted (2026-10-29)

## Context

The graph's thickness ([ADR 0044](0044-graph-thickness.md)) stacks copies
of a commit's node up and to the left by the lines it added and down and
to the right by the lines it deleted, and draws them "behind their nodes
and edges", each side "as one see-through shape". Up and to the left
reads as toward the viewer and down and to the right as away, yet the
added side was drawn behind the nodes and even behind the deleted side,
so the picture contradicted the depth it suggests. Within a side, every
lane merged into the one shape, so where a branch's thickness crossed
another's, nothing told which stood in front.

## Decision

- **Back to front: deleted, edges, nodes, added.** The deleted side is
  drawn behind the edges, as before, and the added side in front of the
  nodes. The thickness still takes no pointer events, so the nodes under
  the added side are clicked and hovered as before.
- **A shape per lane, the rightmost in front.** Within a side, each lane's
  pillars and fins merge into one see-through shape, and the lanes are
  drawn from the leftmost to the rightmost. A fin belongs to the farther
  right of the two lanes it joins. Within a lane, the fins are drawn over
  the pillars.
- **An outline shows the order.** Each lane's shape carries a thin outline
  in a deeper shade of its side's color. A shape in front covers the
  outlines behind it, which is what tells the order: two see-through
  shapes of one color look the same in either order.

## Consequences

- Grouping the thickness by lane is a pure function, unit-tested; an
  end-to-end test checks the order of the sides against the edges and
  nodes, and of the lanes within a side.
