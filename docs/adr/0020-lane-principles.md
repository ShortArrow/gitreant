# ADR 0020: Lane assignment: HEAD pins the straight leftmost line, forks go right, merges come from the right

## Status

Accepted (2026-07-15)

## Context

The previous lane assignment had only one policy — "reuse the lowest
free lane" — so depending on the shape of the history, branches could
appear to the left of their base and merges could come in from both
the left and the right, producing a "chaotic" picture. This was
especially pronounced when the HEAD branch did not hold the latest
commit.

## Decision

Add the following two principles to the domain layout (`layout`
receives `head`).

1. **Pinned spine**: HEAD's first-parent chain (the spine) reserves
   lane 0 and is always drawn as the leftmost straight line. Other
   commits cannot take the spine's lane, and edges converging onto
   the spine point at lane 0.
2. **Merges come from the right**: a new lane for a merge parent
   (second parent onward) is assigned the lowest free lane to the
   right of the merge commit's lane. Free-lane reuse happens only
   within the same direction, never flowing back to the left.

Fork (fork-convergence) routing is unchanged, but because the above
places branches to the right of their base, the picture settles into
"fork toward the right, merge toward the left".

## Consequences

- The checked-out branch is always the baseline for reading.
- Some histories get wider because lane reuse is suppressed
  (correctness first).
- When HEAD is not among the displayed commits (detached etc.,
  outside the visible range), behavior is unchanged.
