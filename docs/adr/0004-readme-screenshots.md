# ADR 0004: Generate README screenshots from declarative fixtures

## Status

Accepted (2026-07-09)

## Context

We want screenshots of the SPA in the README published as OSS. Manual
capture is problematic.

- Every UI change requires retaking the shots with matching
  composition, theme, and window size; updates fall behind and the
  images drift from the implementation.
- Hand-building a repository with a photogenic branch structure every
  time is not reproducible, and we cannot control what commit messages
  or author names end up in the shot.

## Decision

- Screenshots are generated automatically with Playwright, so
  `pnpm screenshot` can regenerate them with the same composition at
  any time (committed under `docs/images/`).
- The subject repository is described as a **declarative scenario** (a
  sequence of branch / commit / merge steps in
  `frontend/screenshot/scenario.ts`), which a builder
  (`frontend/screenshot/build.ts`) turns into a real repository with
  deterministic timestamps. To change the branch structure, just edit
  the scenario.
- Both dark and light themes are captured; the README switches between
  them with `<picture>` and `prefers-color-scheme`.
- The generating spec asserts the composition's assumptions (lane
  count, presence of curved edges, commit count) at capture time, to
  detect scenario degradation.
- The fixture-building and server-startup helpers are shared with the
  E2E suite (`frontend/e2e/git.ts` / `frontend/e2e/server.ts`).

## Consequences

- After a UI change, just re-running `pnpm screenshot` brings the
  images in line with the current UI.
- Because the subject is a fixture, there is no risk of a real
  repository's contents appearing in the shot. On the other hand, it
  is a staged repository, not "a real project's screen".
- The images remain in the repository as binaries, so gratuitous
  regeneration bloats diffs. Regenerate and commit only when the
  appearance changes.
