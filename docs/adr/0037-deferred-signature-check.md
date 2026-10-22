# ADR 0037: Show the graph first and check signatures after it

## Status

Accepted (2026-10-22)

## Context

[ADR 0011](0011-signature-verification.md) verifies signatures inside the
view read: the read walks the history, then waits for one `git log` that
has git call gpg once per signed commit not seen before. The first read of
a repository whose history is mostly signed waits on gpg for every commit;
in a repository of 2,668 commits, 2,376 of them signed, that wait is about
16 seconds while the walk itself takes well under one. Meanwhile the
analyzing counter ([ADR 0023](0023-progressive-loading.md)) has nothing
to report, so it rests on its first value and the graph appears all at
once at the end.

## Decision

- **The view read does not wait for signatures.** It stamps the verdicts
  already cached, as before. When gpg is available, a signed commit with no
  verdict yet is marked `verifying` in the view.
- **Signatures are checked after the read, in the background.** The server
  checks a repository's pending commits in display order, 256 at a time,
  with one run per repository at once. After each batch it caches the
  verdicts, records the command in the command log
  ([ADR 0009](0009-command-log.md)) and sends a `verified` event naming the
  repository; the client then reads that repository's view again. The
  command, the reading of `%G?` and the cache are ADR 0011's.
- **A cleared cache wins over a run in progress.** "Re-verify signatures"
  clears the cache; a batch that started before it does not store its
  verdicts, and the next read checks those commits again.
- **A pulsing skeleton stands in for the badge.** While a commit is
  `verifying`, its row shows a placeholder the size of the badge that
  pulses, and the detail pane says the signature is being checked. Under
  `prefers-reduced-motion` the placeholder does not pulse. An unsigned
  commit shows nothing, as before.

## Consequences

- The graph appears as soon as the walk ends; badges fill in from the top,
  one batch at a time.
- The command log gains one entry per batch instead of one per read.
- Without gpg nothing is marked `verifying`, and a signed commit shows
  "Signed" as before.
