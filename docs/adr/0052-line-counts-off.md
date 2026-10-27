# ADR 0052: Let the rows leave out their line counts

## Status

Accepted (2026-10-27)

## Context

Each row shows the lines its commit added and deleted, as `+N −M` or, by
a setting, as bars at the start of the row
([ADR 0046](0046-line-count-bars.md)). The same counts also show as the
graph's thickness ([ADR 0044](0044-graph-thickness.md)), in the chart of
lines over time and in the calendar
([ADR 0050](0050-calendar.md)), so a reader who takes the sizes from
those may want the rows' room for the summary and the other details
instead. The setting was a single checkbox, bars or numbers, with no way
to show neither.

## Decision

- **One setting with three choices.** Numbers, Bars and None, as
  segmented buttons in their own group of the settings, take the place of
  the bars checkbox. Numbers is the default. The command palette offers
  each choice, as it does for the date format.
- **None leaves the rows alone.** With None a row shows neither the
  numbers nor the bars, and keeps no room for the bars. The counts are
  still loaded, since the thickness, the chart, the calendar and the
  commit details read them.
- **An earlier choice carries over.** The choice is saved under a key of
  its own. Where none is saved yet, a bars choice saved by the checkbox
  reads as Bars, and anything else as Numbers.

## Consequences

- Reading the saved choice is a pure function of the two stored values,
  checked by unit tests.
