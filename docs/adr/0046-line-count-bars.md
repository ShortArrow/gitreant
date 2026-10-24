# ADR 0046: Draw a row's line counts as bars

## Status

Accepted (2026-10-24)

## Context

Each row shows the lines its commit added and deleted as `+N −M`
([ADR 0041](0041-diff-stats-per-commit.md)). Numbers are exact but are
read one row at a time; down a list of rows, which commits were large and
whether they mostly added or mostly removed is hard to see at a glance. A
bar per side, as in a trading screen's order book, shows both while
scanning.

## Decision

- **Bars instead of numbers, by a setting.** A setting draws each row's
  counts as bars in place of `+N −M`. It is off by default, so the rows
  keep their numbers until it is chosen; the choice is saved, and the
  command palette toggles it too.
- **Both ways from one axis.** A thin vertical axis sits in the middle;
  the lines deleted run left of it in red and the lines added run right
  of it in green. Rows line their axes up, so scanning down shows which
  side each commit leans to.
- **At the start of the row, as tall as it.** The bars fill the row's
  height, so the rows stack into one column of bars, and come first in
  the row, before its badges and summary, where every row starts at the same place; the
  numbers sat among the right-aligned details, whose widths differ from
  row to row. A row not counted yet keeps the bars' room empty, so the
  summaries stay lined up too.
- **The thickness's scale.** A bar is as long as the thickness of
  [ADR 0044](0044-graph-thickness.md) for the same count,
  `3 × log2(1 + lines)` pixels and at most 36, so a one-line fix and a
  lockfile rewrite both stay readable and a commit's bars match its
  thickness.
- **Numbers on hover.** The exact counts stay in the bars' tooltip, as
  they are on the numbers now. A commit not counted yet shows no bars.

## Consequences

- The bars take a fixed width, the same in every row, whatever the
  counts.
- The bar lengths come from the same pure function as the thickness, so
  the two cannot drift apart.
