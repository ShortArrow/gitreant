# ADR 0016: Adopt Octicons for the icon set

## Status

Accepted (2026-07-14) — supersedes the "hand-rolled SVG icons" item of
ADR 0015.

## Context

ADR 0015 started with hand-rolled SVG icons to avoid adding
dependencies, but the target buttons have spread to the top bar, the
drawer, and the theme toggle, and the cost of maintaining quality and
consistency ourselves has outgrown the benefit. gitreant's UI
deliberately follows GitHub's look (the Verified badge, the
line-selection dropdown, permalinks, etc.).

## Decision

- Adopt GitHub's official **Octicons** (`@primer/octicons-react`,
  MIT). The set covers the git-domain vocabulary (diff, rows/columns,
  file-directory, etc.), and its 16px optimization suits small
  buttons.
- Imports are centralized in `Icons.tsx`; the app uses only domain
  names (`FetchIcon`, `TreeIcon`, etc.). Swapping the icon set touches
  this single file.
- All action buttons go through `LabeledButton` and follow the
  icon / icon+label / label setting from ADR 0015.

## Consequences

- One more dependency (per-icon imports keep the bundle growth small).
- If vocabulary missing from Octicons becomes necessary, first
  consider an existing icon with a close meaning; if there is none,
  fill the gap with a hand-rolled SVG inside `Icons.tsx`.
