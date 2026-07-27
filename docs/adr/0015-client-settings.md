# ADR 0015: Store client settings in localStorage, starting with button styles

## Status

Accepted (2026-07-14)

## Context

In assigning icons to the action buttons (Inline/Split/Flat/Tree/
Diff all/Add), we want users to choose between icon only, icon plus
label, and label only. More display settings are expected to follow,
so a home for the settings UI is needed.

## Decision

- A ⚙ button in the top bar toggles the settings panel. Settings are
  stored in **client-side localStorage** (the same treatment as the
  theme, pane width, and diff view format). The server is not
  involved.
- Button display has three values: `icon` / `icon-label` (default) /
  `label`. In every format the label remains as `title` /
  `aria-label`, so it is always visible to tooltips and assistive
  technology.
- Target buttons go through a shared `LabeledButton`, and the setting
  is distributed via React Context. Icons are hand-rolled 14x14 SVGs
  (`Icons.tsx`) to avoid adding dependencies.

## Consequences

- Settings are per browser (origin); there is no sync across multiple
  machines. If needed, consider server-side storage in a separate ADR.
- New buttons automatically follow the setting as long as they use
  `LabeledButton`.
