# ADR 0048: List the commits under the cursor of the chart of lines over time

## Status

Accepted (2026-10-25)

## Context

The chart of [ADR 0043](0043-cumulative-chart.md) and its candles and bars
([ADR 0047](0047-net-candles.md)) show how much changed over time, but
not which commits made the change. To find them, one has to leave the
chart and search the rows by date.

The chart places each commit at its time. Over a long span, the commits
of a few hours fall on the same pixel and draw one step of the lines; the
cursor stops at that step, but names only the nearest of its commits.

## Decision

- **Click to list the commits under the cursor.** Clicking the chart
  lists, in a panel to the right of the chart, the commits drawn within
  3 pixels of the cursor: the step it stops at. They are the commits the
  chart sums there, HEAD's first parents, newest first, each with its
  summary, its line counts and its short id. The list does not follow
  the candles' periods: a candle can hold commits drawn far apart, and a
  list of them would not match where one clicked. Clicking elsewhere
  replaces the list.
- **From a listed commit to its row.** Right-clicking a listed commit
  opens the same commit menu as its row, with "Show in rows" first.
  Choosing it closes the chart and selects the commit in the rows,
  scrolled into view, as moving to a parent or child from the menu does.
- **Closing the list.** A × in the panel's heading and Esc close it. With
  the commit menu open, Esc closes the menu first.

## Consequences

- The list keeps the times under the cursor at the click, so it stays
  the same while the panel narrows the chart and the chart redraws to
  the room left. Which commits fall under a cursor is a pure function of
  the layout, checked by unit tests.
- Over a long history, a list can hold a day's commits or more; over a
  short one, a commit or two.
