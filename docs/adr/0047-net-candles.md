# ADR 0047: Add candles and each period's lines to the chart of lines over time

## Status

Accepted (2026-10-24)

## Context

The chart of [ADR 0043](0043-cumulative-chart.md) draws the lines added
and deleted, summed, and their net change as step lines. Over a long
history the lines show the trend but not how much the code swung within a
stretch, nor how busy each stretch was: a week that added a large feature
and then removed most of it ends close to where it began, and a sum hides
how many lines a single week touched. A trading chart answers both with
candles and with volume bars under the price.

## Decision

- **Series turned on and off in the legend.** The legend names five
  series: the lines added, the lines deleted and the net change as lines,
  the net change as candles, and each period's lines as bars. Pressing a
  name hides or shows its series, and a hidden one's name is faded. All
  five show at first, so candles sit on the net line; as with the chart
  itself, the choice is not saved.
- **A candle per period.** A candle opens at the net change just before
  the period's first commit and closes at its value after the period's
  last commit; its wick reaches the highest and lowest values in between.
  A candle that closes at or above its open is green, one that closes
  below is red. A period without commits has no candle.
- **Each period's lines as bars.** On the same axes, from the zero line,
  a see-through green bar rises by the lines the period's commits added
  and a red one falls by the lines they deleted, under each candle. They
  are never longer than the sums, so the axis needs no room of its own.
- **The period follows the span.** The period is a day, a week or a
  month, whichever is the shortest that keeps the candles to about sixty
  across the commits shown. Periods follow the local calendar; a week
  starts on Monday.
- **Reading a period.** Hovering still names the nearest commit and its
  sums. While the candles show, it adds the open, high, low and close of
  that commit's period; while the bars show, the lines the period added
  and deleted.

## Consequences

- The candles and the bars are a pure function of the sums, checked by
  unit tests.
- A short history has a few wide candles; a long one has narrower ones,
  never more than the period allows.
