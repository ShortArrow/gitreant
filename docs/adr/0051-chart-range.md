# ADR 0051: Narrow the chart's range, and cut it by quarter or year

## Status

Accepted (2026-10-26)

## Context

The chart of lines over time ([ADR 0043](0043-cumulative-chart.md)) sums
from the oldest loaded commit. Loading reaches further back as the rows or
the calendar ([ADR 0050](0050-calendar.md)) read more pages, so the chart
only ever widens: once a few years are loaded, the last weeks shrink to a
sliver at its right end, with no way to look at them alone. And the
timeframes of [ADR 0049](0049-chart-timeframe.md) stop at a month, which
over years still draws too many candles to read.

## Decision

- **A range beside the timeframe.** A row of buttons offers All, 5 years,
  1 year, 6 months, 3 months and 1 month. A range other than All draws
  only the commits from that long before the newest one, by the local
  calendar; All keeps every loaded commit. All is the first choice, and
  as with the timeframe the choice is not saved.
- **Sums start at the range.** Within a range, the lines added and deleted
  are summed from zero at its first commit, so the chart reads how much
  changed in that range. The candles, the bars, the hovering and the list
  under the cursor all read these sums.
- **Quarters and years.** The timeframes gain Quarter and Year, by the
  local calendar: a quarter starts in January, April, July or October. Auto
  goes on to a quarter, and then a year, when months would draw more than
  about sixty candles.

## Consequences

- A range is a pure function of the sums and the newest commit's time,
  checked by unit tests, as are the quarters and years.
- Loading more no longer changes a narrowed chart unless the newest commit
  changes.
