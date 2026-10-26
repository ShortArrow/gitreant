# ADR 0049: Choose the timeframe of the candles and bars

## Status

Accepted (2026-10-26)

## Context

The candles and bars of [ADR 0047](0047-net-candles.md) span a day, a
week or a month, chosen from the span of the history shown. One cannot
look at the same history by week instead of by day, nor see how much each
commit changed, which a trading chart offers by switching its timeframe.

## Decision

- **A timeframe beside the legend.** A row of buttons offers Auto,
  Commit, Day, Week and Month. Auto keeps the choice of ADR 0047; Day,
  Week and Month fix the period. The candles and the bars both follow the
  timeframe. As with the series, the choice is not saved.
- **Commit merges what is drawn together.** With Commit, each candle and
  bar covers the commits drawn within the same 4-pixel column of the
  chart, so a short history has one per commit. Over a long one, the
  commits of a few hours fall on the same column; their bars add up, and
  their candle opens before the first and closes after the last, so the
  bars read as the waves of each day's work rather than piling on one
  another.

## Consequences

- A timeframe is one way of cutting the time axis into periods, by the
  calendar or by the chart's columns; the candles and bars take any of
  them, checked by unit tests.
- With Commit the candles redraw when the chart's width changes, since
  the columns follow the pixels.
