# ADR 0027: Show uncommitted changes as a synthetic row above HEAD

## Status

Accepted (2026-09-23)

## Context

Uncommitted changes in the working tree showed up only as a count in the
drawer (the dirty indicator); the graph offered no way to see what changed
or what the diff looked like (issue #5). GitKraken and vscode-git-graph put
the working tree above HEAD as a "WIP" row. gitreant assigns lanes on the
server (ADR 0001 / 0020), so the question is where such a row is
synthesized.

## Decision

- **Synthesize the row when the server builds the view.** When
  `git status --porcelain` reports at least one path and HEAD exists, a
  synthetic commit with the id `uncommitted` and HEAD as its parent is
  inserted at the front of the layout input and becomes the start of the
  spine. The row sits in HEAD's lane and drops straight onto HEAD. A
  repository without HEAD (unborn) shows no such row.
- **The synthetic row is not a commit.** It is not counted in `total`, and
  paging (ADR 0023) adds one to the limit so the row always stays on top.
  It carries no author, time or hash; it shows a label and the number of
  changed paths. Its node is a hollow dashed ring and its edge to HEAD is
  dashed, so it reads apart from history.
- **Details and diffs reuse the existing API with the same id.**
  `/api/commit`, `/api/diff` and `/api/commit-diff` branch to a
  working-tree read on the server only when the id is `uncommitted`. The
  client's select, detail and diff flow is unchanged.
- **Reads are delegated to the git CLI** (the ADR 0007 / 0014 pattern). The
  list comes from `git status --porcelain -z --no-renames` (the granularity
  of untracked files follows the user's `status.showUntrackedFiles`), line
  counts from `git diff HEAD --numstat`, and tracked files' diffs from
  `git diff HEAD -- <path>`. This keeps line-ending conversion and
  `.gitattributes` filters identical to the user's own `git diff`; matching
  the index against the working tree with gix is not adopted. Untracked
  files have nothing to compare against, so they are read from disk and
  diffed against empty content locally. None of these reads take the index
  lock (`GIT_OPTIONAL_LOCKS=0`).
- **HEAD is the comparison base**, and index and working-tree changes are
  shown combined. The staged / unstaged distinction is deliberately left
  unspecified (a flag on `UncommittedPath` can carry it if it is needed).
- The row refreshes when everything else does (the Reload button, SSE). No
  file watching is introduced.

## Consequences

- `git status` runs once per view read and once per drawer `/api/status`
  (loading another page counts as a view read). The drawer's dirty count
  uses the same function (`uncommitted_paths`), so it always matches the
  row's count.
- Untracked files are listed as the user's `status.showUntrackedFiles`
  setting lists them (by default an untracked directory is one entry; so
  is an embedded repository, whose diff is empty). A rename counts as two
  entries, a deletion and an addition.
- Untracked files are read up to 4 MiB; anything larger is treated as
  binary. A symbolic link's content is its target path, as git sees it.
  "Diff all" skips untracked files that cannot be read (locked by another
  process, for instance); only a request for that single file reports the
  error.
- Tracked files are diffed with `--literal-pathspecs`, so a name such as
  `a[1].txt` cannot glob onto other files.
- The synthetic row's `time` is 0; it does not change from read to read.
- Reloading while the row is selected re-reads its details and diffs; when
  the working tree has become clean and the row is gone, the selection is
  cleared.
- New-side permalinks in the diff pane cannot point at the working tree and
  are disabled; old-side (HEAD) permalinks work as before.
- The README screenshot scenario contains a `dirty` step, so the next
  `pnpm screenshot` shows the synthetic row (`commitCount` already counts
  the `dirty` step as a row).
