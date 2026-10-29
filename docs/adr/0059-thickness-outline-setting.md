# ADR 0059: Make the thickness's outline a setting, off by default

## Status

Accepted (2026-10-29)

## Context

[ADR 0058](0058-thickness-depth-order.md) draws each lane's thickness as
one see-through shape and gives it an outline, since "two see-through
shapes of one color look the same in either order". The outline shows
which lane stands in front where branches cross, but in a history with few
crossings, a single line of commits above all, it is a line around every
shape that tells nothing and only adds to the picture.

## Decision

- **A graph setting draws the outline.** A checkbox in the graph settings,
  beside the thickness's own, turns the outline on; it is off by default,
  and the command palette toggles it. The choice is kept in the browser.
- **Only the outline depends on it.** The order of the sides and of the
  lanes stays as ADR 0058 decided, whether the outline is drawn or not.

## Consequences

- An end-to-end test checks that the lanes carry no outline at first and
  carry one once the setting is on.
