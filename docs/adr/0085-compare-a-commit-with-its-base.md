# ADR 0085: Compare a commit with its base from where it parts from it

## Status

Accepted (2026-11-17)

## Context

A pull request shows `base...head`: the changes since the head parted from
the base, without what the base gained since. The commit menu could compare
a commit with another selected one ([ADR 0035](0035-graph-node-navigation.md)),
which diffs the two trees as they are, `base..head`. Comparing a commit on
a topic branch with its base that way also shows, reversed, everything the
base gained after the topic branched off.

## Decision

- **The commit menu offers "Compare with base \<branch\>".** The diff runs
  from the commit where the commit parts from that branch, as
  `git merge-base` finds it, to the commit: the three-dot diff a pull
  request shows.
- **The base is chosen as the pull request would.** Among the local
  branches holding the commit, the one whose tip is fewest steps from it
  and has an open pull request names the base, with the pull request's
  number in the item. Without one, the base is the branch `origin/HEAD`
  names, else `main`, else `master`, else the checked-out branch, whichever
  exists first. A branch that exists only on origin is compared as
  `origin/<branch>`.
- **No item where the base already holds the commit,** since the diff
  would be empty, or where no base exists.
- **The comparison shows where comparing two commits does.** It names the
  branch point as "Branch point with \<branch\>". The branch point need not
  be among the loaded rows, so the server's answer carries what the panel
  shows of it.
- **The server answers `POST /api/merge-base`** with the branch point of a
  revision and a commit, and pull requests carry their base branch.

## Consequences

- Which branches hold a commit is found among the loaded commits only
  ([ADR 0023](0023-progressive-loading.md)), so a branch whose tip is
  further back than the loaded rows is not considered.
- A commit on a branch with no pull request in a repository whose default
  branch is not its real base, such as a feature branch off `develop` in
  git-flow, is compared with the default branch.
- Tests cover choosing the base, the branch point the server finds and
  answers, and the item and comparison on the page.
