# ADR 0065: Outline a lane's two sides as one shape

## Status

Accepted (2026-10-29)

## Context

[ADR 0058](0058-thickness-depth-order.md) outlines each lane's shape, and
[ADR 0059](0059-thickness-outline-setting.md) makes that outline a
setting. A lane's thickness has two sides, the added one in green and the
deleted one in red, and each side was outlined as a shape of its own. Where
a commit both added and deleted lines, the two sides overlap, and each
side's outline ran across the inside of the other side's shape: a red line
crossed the green shape and a green line the red one, though both sides
read as one solid.

## Decision

- **A lane's two sides are outlined as one shape.** The outline follows
  only the border of the two sides taken together; neither side's outline
  is drawn inside the other side's shape in the same lane.
- **Each part of that border keeps its side's color.** Where the border
  runs along the added side, it is drawn in the added side's deeper shade,
  and along the deleted side in the deleted side's, so the two colors meet
  on the border and go round the shape as one line.
- **The depth order stays.** Each side's outline is drawn with its side,
  as ADR 0058 orders them, so the nodes may cover the deleted side's
  outline as they cover its shape.

## Consequences

- Each side's outline needs the other side's shape in the same lane, so
  with the outline on, the graph draws those shapes once more, as a mask.
- An end-to-end test checks, on a lane with both sides, that each side's
  outline leaves out exactly the other side's shapes in that lane.
