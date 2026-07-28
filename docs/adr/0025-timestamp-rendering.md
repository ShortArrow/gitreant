# ADR 0025: One client setting governs every timestamp, and the absolute time always stays in the tooltip

## Status

Accepted (2026-07-28)

## Context

Timestamps appear in two places — the right edge of the graph rows and the
commit detail panel — and the two were rendered differently: a fixed-width
`YYYY-MM-DD HH:mm` in the rows, `toLocaleString()` in the details. Making
the format user-selectable requires deciding where the choice is stored
(a server-side file or the client) and what to do about the formats that
drop information.

## Decision

- **Store it in localStorage.** The format is a per-machine, per-browser
  display preference — neither repository state nor session state. No
  server-side configuration file (config.toml) and no session persistence
  (session.json) are introduced for it.
- **One setting governs every place a timestamp is shown.** Different
  formats in the rows and the details would be the same information wearing
  two faces. The values are `iso` (default, fixed-width
  `YYYY-MM-DD HH:mm`), `locale` (the selected UI language's own rendering)
  and `relative` (`3 days ago`).
- **`iso` is the default.** It is fixed-width, columns line up, it does not
  depend on the browser locale, and the field order reads unambiguously.
- **Every format keeps the absolute time, to the second, in the `title`
  attribute.** `relative` is a lossy rendering, so the exact moment must
  stay reachable; choosing a format is then never a choice to discard
  information.
- **Delegate the relative wording to `Intl.RelativeTimeFormat`.** No
  per-unit translations are added to the hand-rolled dictionaries (ADR
  0019). The reference instant is passed in as an argument so the
  formatting function stays pure.

## Consequences

- The log pane's clock is out of scope: it shows a time of day within the
  running session and carries no date, so it does not sit on this axis.
- `relative` has a variable width, so the graph rows' time column is no
  longer fixed-width. Readers who value the alignment have the default.
- Adding a format is confined to a branch in the formatting function plus
  the dictionary labels.
