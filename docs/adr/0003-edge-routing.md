# ADR 0003: Route lane-crossing edges as a one-row curve plus a vertical run

## Status

Accepted (2026-07-09)

## Context

When many commits sit between two merged commits, the previous
rendering — a single Bezier curve spanning every row from the child
node to the parent node — degenerated into a nearly vertical slanted
line (asymptote-like), making it impossible to tell which lane the
line belonged to.

Surveying how existing tools solve this, all of them use a "never draw
a long line diagonally" approach.

- **VSCode Git Graph** (mhutchie/vscode-git-graph): a line is a
  sequence of segments belonging to a branch; vertical stretches are
  straight lines, and only the lane-crossing stretch is a curve one
  row tall.
- **git-graph** (mlange-42/git-graph): a three-segment construction
  that runs vertically down a column and moves horizontally (a curve
  in SVG) to the neighboring column at the row where it bends.
- **GitKraken** (closed source): the on-screen behavior is the same.
  Lines run vertically within their lane and curve briefly only at
  the rows where they merge or fork.

## Decision

- A lane-crossing edge (child → parent) **moves from the child's row
  to `to_lane` (the parent's lane) with a curve one row tall, and the
  remainder descends `to_lane` as a straight vertical line**.
  Same-lane edges remain vertical lines as before; adjacent-row edges
  are the curve only.
- Path computation is confined to the frontend pure function
  `edgePath` (frontend/src/graph.ts). The domain layer's lane
  assignment and edge representation (`from_lane`/`to_lane`) are
  unchanged.
- The bend sits at the **child end**. Because the domain layout keeps
  holding an unplaced parent in its lane, the vertical corridor of
  `to_lane` is guaranteed to be unused by other nodes from the child's
  row down to the parent's row (bending at the parent end has no such
  guarantee on the `from_lane` side). This invariant is a cross-layer
  contract the renderer depends on, and is also stated in the `layout`
  docstring (src/domain/graph.rs).

## Consequences

- When multiple children merge into the same parent, the vertical runs
  overlap on the same lane and "appear to join into a single line".
  This is the same correct representation as Git Graph.
- If the layout's lane-reuse behavior changes (e.g. freeing a lane
  before the parent is placed), this rendering contract breaks and the
  edge routing must be redesigned.
- We do not adopt git-graph's bend-row insertion or its
  crossing-minimizing column assignment. SVG can draw arbitrary curves
  within a row, so row insertion is unnecessary, and crossing
  minimization was judged overkill at the current lane counts.
