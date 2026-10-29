# ADR 0056: Choose the day a week starts on

## Status

Accepted (2026-10-29)

## Context

Two views cut the history into weeks. The calendar under the rows
([ADR 0050](0050-calendar.md)) says "Each column is a week, starting
on Monday", and the chart of lines over time
([ADR 0047](0047-net-candles.md)) says of its periods that "a week starts
on Monday". Monday is the ISO week, but much of the world, and many
calendars a reader is used to, start the week on Sunday, and reading a
calendar laid out the other way trips the eye.

## Decision

- **A setting chooses Monday or Sunday.** Segmented buttons in their own
  group of the settings, Monday by default, and the command palette offers
  each choice as it does for the date format. The choice is kept in the
  browser.
- **Both views follow it.** The calendar's columns start on the chosen
  day, and so do the chart's weekly candles and bars, whether the week is
  chosen as the timeframe or picked by Auto. The two views never cut a
  week differently.
- **The calendar names the same weekdays.** Its rows keep their labels on
  Monday, Wednesday and Friday, whichever row they fall on.

## Consequences

- The start of a period and the calendar's weeks take the week's first
  day as an argument; both are pure and unit-tested for either day.
