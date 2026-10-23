# ADR 0043: Chart the lines added and deleted, summed over time

## Status

Accepted (2026-10-24)

## Context

[ADR 0041](0041-diff-stats-per-commit.md) counts each commit's lines added
and deleted, and [ADR 0044](0044-graph-thickness.md) shows them as a
thickness along the graph. Neither shows how the code grew over time: whether a
period added more than it removed, or when the history paused.

Summing every commit counts a branch's changes twice: once in the
branch's own commits and again in the merge that brought them in, since a
merge counts against its first parent. Summing only HEAD's first-parent
chain counts each change once, and its net equals how the tree's line
count changed.

## Decision

- **A mode of its own, per pane.** A button in the pane's header shows the
  chart in place of the rows and their graph; pressing it again returns to
  the rows. The choice is not saved, and while the chart is shown the
  selection keys of [ADR 0035](0035-graph-node-navigation.md) are off.
- **What is summed.** HEAD's first-parent chain among the commits the pane
  has loaded, oldest first. Each step adds a commit's lines added and
  deleted, and their difference. The sums start at zero at the oldest
  loaded commit of the chain, so they describe the loaded span rather than
  the whole history. A commit not counted yet adds nothing until its count
  arrives; the chart says how many are still being counted.
- **Three lines.** The lines added so far in green, rising above zero; the
  lines deleted so far in red, falling below it; and their difference, the
  net change in lines, as a thicker line in the text color that runs
  between the two. Each is a step line, changing at each commit. The
  hover still names the lines deleted as a positive count.
- **Time across.** The horizontal axis is the commit time, so a quiet
  period shows as a flat stretch. A commit whose time is earlier than the
  one before it on the chain is drawn at that earlier one's time, keeping
  the lines moving forward.
- **Axes and reading it.** The vertical axis has a few round-numbered
  ticks and a zero line; the horizontal axis names the first and last
  dates. A legend above the lines names each of them in its color.
  Hovering the chart marks the nearest commit with a vertical line and
  names it with its date and the three sums.
- **Fills the pane.** The chart is drawn to the pane's size and redrawn
  when it changes; it does not scroll, so it loads no more commits.

## Consequences

- The sums are a pure function of the view, checked by unit tests, and
  draw into SVG; no chart library is added.
- A chart of a repository whose history is only partly loaded starts at
  the oldest loaded commit; loading more in rows extends it back.
- The calendar in the [ROADMAP](../ROADMAP.md) can share the time axis.
