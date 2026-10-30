# ADR 0066: Start background batches small and double them

## Status

Accepted (2026-10-30)

## Context

[ADR 0037](0037-deferred-signature-check.md) checks a repository's
signatures after the read, "in display order, 256 at a time", and
[ADR 0041](0041-diff-stats-per-commit.md) counts its lines the same way.
Display order puts the newest commits first, so the rows at the top of a
pane are always in the first batch. But no badge appears until that whole
batch is done, and gpg takes time for each signature: on gitreant's own
history, checking 32 signed commits took about 1.1 s and 256 about 8.3 s.
A pane shows a few dozen rows, so for most of those 8 seconds the rows on
screen wait for commits far below them.

## Decision

- **The first batch covers 32 commits, and each batch after it doubles,
  up to 256.** A run goes through 32, 64, 128, then 256 at a time, in
  display order as before. The same batches serve the signature checks
  and the line counts.
- **Everything else stays as ADR 0037 and ADR 0041 decided.** Each batch
  is still cached, logged and announced on its own, with one run of each
  kind per repository at once.

## Consequences

- On the history measured above, the rows at the top of a pane get their
  signature badges after about 1 s instead of about 8 s.
- A run with more than 32 pending commits starts up to three more git
  processes than before, and the command log gains up to three more
  entries for it.
