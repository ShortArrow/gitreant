# ADR 0083: A background batch carries what it settled

## Status

Accepted (2026-11-16). Amends [ADR 0037](0037-deferred-signature-check.md)
and [ADR 0041](0041-diff-stats-per-commit.md).

## Context

A read of a repository leaves its signatures to check
([ADR 0037](0037-deferred-signature-check.md)) and its commits to count
([ADR 0041](0041-diff-stats-per-commit.md)) to the background, a batch of
up to 256 commits at a time. Each batch announced itself with a `verified`
or `counted` event naming only the repository, and every open page then
read that repository's view again. A read walks the whole history and
builds its graph before cutting it to the rows the page asked for, so each
batch cost a whole read, once per open page.

On 2026-11-16, a release build of `main` at 7d77945 read zed, 23,773
commits, on Windows 11. A single read took about 0.5 seconds. The batches
that followed it ran for 404 seconds: 118 of counts and 45 of signatures.
In the first 45 seconds after zed was added, one page read its view 127
times. Three pages of the same port read it 277 times, and the longest
read took 11.6 seconds instead of 0.55. Each figure is from one run.

## Decision

- **The event carries the batch's results.** `counted` carries
  `{"repo": <id>, "commits": [{"id", "stat"}]}`, and `verified` carries
  `{"repo": <id>, "commits": [{"id", "verified", "signature_key"}]}`. They
  hold what a read would now stamp on each commit of the batch. A commit
  whose verdict was dropped because the cache was cleared during the check
  is left out.
- **The page fills them in and reads nothing.** It keeps what the batches
  settled, by repository and commit, and lays it over every view of that
  repository it holds or receives later. That includes a read already on
  its way when the batch settled, which answers without it.
- **An `update` event clears what the page kept.** The read it triggers
  carries everything settled before it began, and a refresh clears the
  server's verdicts, which the kept ones must not outlive.

| Alternative | Why not |
|---|---|
| Keep the walked graph on the server between reads | Each batch would still send every page the whole view of up to 500 rows, about 360 KB for zed, to change a few fields |
| Read again at most once a second | A read still walks the whole history, once per page, as long as the batches run |

## Consequences

- A batch costs no read. A page reads a repository's view when it opens
  it, when it scrolls for more rows, and on `update`.
- An event is larger: up to 256 commits of a batch, each with its id.
- A page that misses events is resynced by `update`, which the server
  sends to a listener that fell behind.
- Tests cover what a batch reports for counts and for verdicts, the event
  a running server sends, laying the results over a view and keeping them
  for one that arrives later, and that a page counting a 150-commit history
  reads its view no more than twice.
