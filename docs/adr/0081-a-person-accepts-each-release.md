# ADR 0081: A person accepts each release

## Status

Accepted (2026-11-03).

## Context

The gate before a release was the full E2E suite and the `pnpm screenshot`
assertions. Neither involves a person, and neither reaches some of what a user
meets first:

- The browser opening a launcher file. No test does this: the E2E suite posts a
  form of its own, and the unit tests read the launcher's text.
- The system's folder dialog and file manager, and an editor the user names.
- Whether the page reads well. `pnpm screenshot` asserts that elements exist.
  Its capture for 0.4.0 passed with a commit's message covering two rows, and
  only someone looking at the image saw that.

## Decision

- **A release needs a person to pass [ACCEPTANCE](../ACCEPTANCE.md).** Each of
  its steps states what passes, and a step that differs holds the release until
  the cause is fixed and the affected steps are redone.
- **A pass covers the operating system and browser it was done on.** The commit
  that bumps the version records them, with the person, and names the operating
  systems the release ships for that no person tried. Those ship on the automated
  suites alone.
- **The document is called acceptance, not a tutorial.** A tutorial teaches a
  user, and its steps are chosen for learning. These are chosen for what the
  automated suites miss, and read by whoever releases.

## Consequences

- Every release takes a person's time, and an agent cannot pass it for them.
- Changing a screen or a command also changes the document's steps, in both
  languages.
- Users get no introduction from this; they still start from the README.
- Behaviour only reachable elsewhere, such as `--no-launcher` in WSL or the
  address printed on Android, stays unchecked by a person unless someone chooses
  to try it.
