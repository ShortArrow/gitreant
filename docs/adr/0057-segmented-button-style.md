# ADR 0057: Let the calendar's shading buttons follow the button style

## Status

Accepted (2026-10-29)

## Context

The button style setting ([ADR 0015](0015-client-settings.md)) draws
action buttons as an icon, an icon with its label, or the label, and
reaches the buttons that "go through a shared `LabeledButton`". Choices
of one among a few are segmented buttons instead, each a radio input with
a text label, so they always showed text. Above the calendar, the choice
of shading by both, added or deleted lines sits beside the header's
icon buttons and is the only control there that ignores the setting.

## Decision

- **A segmented choice may carry icons.** Each choice can name an icon
  along with its label. When every choice has one, the group follows the
  button style as `LabeledButton` does: the icon, the icon with the
  label, or the label, with the label kept as the tooltip and for
  assistive technology.
- **The calendar's shadings take the diff icons.** Both, added and
  deleted show the icons of a diff, of an added line and of a removed
  line.
- **Choices written as values stay text.** The settings' groups and the
  chart's timeframe and range carry no icons: their labels, such as a
  language or "1Y", are the values themselves.

## Consequences

- An end-to-end test checks the calendar's shadings under each button
  style.
