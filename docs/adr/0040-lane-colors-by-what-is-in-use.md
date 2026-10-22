# ADR 0040: Choose a lane's color by the lanes in use

## Status

Accepted (2026-10-22)

## Context

The layout hands colors out in turn: every new branch tip, merged branch
and stash takes the next number, and the frontend cycles a palette of
eight. A graph with many branches therefore reuses a color every eighth
branch, wherever those branches are, and two lanes side by side can come
out the same color. A stash takes a number too, so it shifts the color of
every branch below it ([ADR 0036](0036-stash-node.md)).

A lane holds its color from the row where it starts to the row where it
frees: a merged branch's lane starts at its merge commit and lasts down to
its fork point, so it is in use for as long as the branch stayed unmerged.
Lanes are thus intervals of rows, and handing each, from the top row down,
the lowest color no lane in use holds gives the fewest colors any choice
could.

## Decision

- **The lowest color no lane in use holds.** A lane that starts takes the
  lowest color of the palette that no other lane in use holds. A lane is in
  use while it waits for a commit, including while it is kept for a fork
  edge to reach its parent. The layout knows the palette's size
  (`PALETTE_SIZE`, eight) and hands out no color past it.
- **Not the color the column had last.** A lane that starts in a freed
  column does not take the color the column ended with, so a new branch
  below one that ended does not read as its continuation.
- **Past the palette, apart from the neighbors.** When more lanes are in
  use than the palette has colors, a lane takes the lowest color that
  neither column beside it holds.
- **A stash, the same way.** A stash takes the lowest color that no lane in
  use holds, its own column's included.

## Consequences

- Colors no longer shift as branches are added above: a lane's color
  depends only on the lanes in use when it starts.
- A stash's color is not held once its row is drawn, so a lane that starts
  below it, before its line reaches its parent, may take the same color.
  Its line is usually a single row long.
- A branch's color may differ from the one it had before this change.
