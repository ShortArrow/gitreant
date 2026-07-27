# ADR 0024: Three-stage quality gates and a four-pillar responsibility scope

## Status

Accepted (2026-07-24)

## Context

Testing has grown into four layers — unit (cargo test --lib /
vitest), integration (cargo test), E2E (Playwright, one serial run,
10–17 minutes), and functional assertions during screenshot
generation — but which layer is mandatory when was left to implicit
practice. E2E in particular is expensive to run, and in reality
multiple features piled up without it ever running, which allowed
gaps between layers (e.g. the case where stash_internal was never
serialized and collapsing never actually worked).

Also, what gitreant is and is not responsible for — the
localhost-only trust boundary, which operations may be applied to a
repository, behavior when gh/gpg are absent, outbound transmission —
was undocumented, and judgment wavered with every feature addition.

## Decision

- **Quality gates are three stages.**
  1. Every push: all backend tests and the frontend's tsc / vitest /
     build must be green. For bug fixes, write the reproducing test
     first (Red→Green).
  2. Per feature milestone (when a coherent set of UI features is
     complete): run the full E2E suite and get it green before
     moving on.
  3. Before a release/tag: in addition to full E2E, get the
     `pnpm screenshot` assertions (visual regression of features
     shown in the README) green.
- **The responsibility scope is documented as four pillars**: trust
  boundary, data safety, degraded behavior for external
  dependencies, and an enumeration of network transmission. The
  operational details have [docs/QUALITY.md](../QUALITY.md) as the
  single source.
- Adding destructive git operations (history rewriting, force push,
  deletion) requires a revision of QUALITY.md and an ADR.

## Consequences

- When several features have piled up without E2E, that is the
  signal a milestone is complete: run the full suite before starting
  the next feature.
- Because screenshot generation doubles as a regression test that
  features are "visible", breaking a README-listed feature makes the
  screenshots fail.
- Questions and decisions about the responsibility scope point to
  QUALITY.md, and any guarantee not found there can be answered with
  "we do not make it".
