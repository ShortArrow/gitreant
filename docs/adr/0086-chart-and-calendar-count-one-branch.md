# ADR 0086: The chart and the calendar count one branch's commits

## Status

Accepted (2026-11-17). Amends [ADR 0043](0043-cumulative-chart.md) and
[ADR 0050](0050-calendar.md).

## Context

The line-count chart ([ADR 0043](0043-cumulative-chart.md)) summed HEAD's
first-parent chain, each commit against its first parent, a merge
included. The calendar ([ADR 0050](0050-calendar.md)) counted every loaded
commit but merges, on any branch.

In a repository that brings `develop` into `main` through release merges,
as git-flow does, `main`'s first-parent chain holds little but those merges.
Each counted every line of its release, so the chart showed a few huge
candles and was flat in between, while the calendar under it showed work on
most days. The two counted different commits.

## Decision

- **Both count the work of one branch.** The commits are those the branch's
  tip reaches among the loaded ones, less merges, stash entries and the
  uncommitted row, each against its first parent. A merge only brings in
  work its own commits already count. The chart sums them by commit time.
- **A list in the pane's header picks the branch,** shown while the chart
  or the calendar is open. It offers HEAD, labelled with its branch, every
  branch at once, and each local then remote-tracking branch by name. HEAD
  is the default and follows a checkout. A branch that goes away falls back
  to HEAD.

| Alternative | Why not |
|---|---|
| Count HEAD's work with no choice | No way to see `develop` or a feature branch alone |
| Tick several branches at once | Heavier to use, and the union of several branches says little more than every branch |

## Consequences

- On a branch whose history is mostly merges, the chart rises where its
  commits were made rather than at each merge.
- A change cherry-picked onto two branches counts twice under every branch.
- Only the loaded commits are walked
  ([ADR 0023](0023-progressive-loading.md)), as before.
- Tests cover which commits a branch counts, the sums over them, and the
  list switching both the chart and the calendar.
