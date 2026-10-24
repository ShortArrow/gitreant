# Roadmap

[English](ROADMAP.md) | [日本語](ROADMAP.jp.md)

The next version has a theme. Items after it are grouped by area, not by
priority. Settled designs live in [adr/](adr/).

## 0.2.0 — see the work in progress (released)

The version that brings the work in progress, not only committed history,
onto one screen. Released on 2026-10-01.

- **Uncommitted changes as a row above HEAD**
  ([ADR 0027](adr/0027-uncommitted-changes-row.md))
- **git worktree support** ([ADR 0028](adr/0028-worktrees.md))
- A dedicated window with `--app` ([ADR 0026](adr/0026-app-mode-window.md))
- The app icon (favicon, Windows executable, README)
- Builds for Windows on ARM, Raspberry Pi and Termux
- A context menu and a hash tooltip on graph nodes (the groundwork for
  0.4.0)
- Copyable commit metadata and a timestamp format setting
  ([ADR 0025](adr/0025-timestamp-rendering.md))

## 0.2.1 — line-ending changes (released)

A fix release, released on 2026-10-01: a file whose only change is its
line endings no longer shows identical removed and added lines
([ADR 0029](adr/0029-line-ending-changes.md)).

- The changed line end is marked (`␍␊` or `␊`) on both lines of the pair
- The file list labels the file "line endings only"
- The diff header names the direction (`LF → CRLF` and so on)

## 0.3.0 — around the graph and packaging (released)

Released on 2026-10-21. The node features planned as its theme moved to
0.4.0; what shipped is work around the graph and the release packaging.

- Hovering a branch badge fades the rows its tip cannot reach
- Collapsing a submodule graph to a narrow strip, remembered per repository
- Copying a commit's full id and its web page (github.com, gitlab.com) from
  the commit menu
- "Diff all" as a toggle
- Submodule graph nodes that behave like the main graph's
- The `diff` attribute of `.gitattributes`
  ([ADR 0033](adr/0033-diff-attribute.md))
- Debian packages and a `SHA256SUMS` on every release, and an arm64 Linux
  binary that starts on glibc 2.35
  ([ADR 0034](adr/0034-debian-packages.md))

## 0.4.0 — more from graph nodes

Build on the node interactions 0.2.0 introduced (`nodeProps` in
`RepoCard.tsx`, and the `CommitMenu` shared with rows) to let a node do
more.

- **Read-only**
  - Highlight the lineage (the first-parent chain) of the hovered node
  - Pick two nodes and show the diff between them (reusing the diff pane)
  - Move to a parent or child commit from the menu
  - Move between and select nodes with the keyboard
- **Within the existing operation policy (ADR 0014/0021)**
  - "Check out this commit (detached)" from the menu
- **New writes to the repository** (need a QUALITY.md revision and an ADR
  first)
  - cherry-pick, revert, reset to this commit

0.4.0 takes the read-only items and the detached checkout; how each
behaves is settled in [ADR 0035](adr/0035-graph-node-navigation.md). The
new writes stay for later.

## Forge support (GitHub / GitLab / Codeberg …)

Generalize the currently GitHub-only features behind a forge abstraction
keyed off the remote URL's host.

- **Affected features**: permalinks (`blob/<commit>/<path>#L..`), PR/MR
  badges and links, dashed squash-merge links
- **Approach**: the CLI-delegation pattern of ADR 0007/0013
  - GitHub: `gh` (implemented)
  - GitLab: `glab` (MR = merge request)
  - Codeberg / Forgejo / Gitea: `fj` or the REST API
- **Degradation rule**: silently disabled without the CLI, without auth, or
  on unknown hosts (same as gh today)
- Start by generalizing the remote-URL normalization (`github_web_url`)
  into per-forge providers
- **Self-hosted hosts**: the commit menu's web page (`commit_url_base`)
  knows github.com and gitlab.com by name only. A self-hosted GitLab or
  GitHub Enterprise cannot be told from other hosts by its name, so it needs
  a setting that names the host and its forge

## Working tree (follow-ups to ADR 0027 / 0028)

- **Split staged and unstaged in the uncommitted row** — today both are
  shown combined, compared with HEAD
- **Stage, commit and discard from the uncommitted row** — writes, so a
  QUALITY.md revision and an ADR come first
- **Create and remove worktrees** — likewise
- **Let the drawer filter find nested worktrees** — today it only looks at
  top-level rows
- **Keep a worktree on a disconnected network drive from stalling the
  list** — check existence with a timeout, or leave it out of the list and
  resolve it later

## Diff display (follow-ups to ADR 0029 / 0033)

- **Tell binary files apart in the file list** — the list shows a binary
  file as `+0 −0`, the same as text whose line count did not change; git's
  numstat prints `- -`
- **Show the end-of-file newline change** — removing or adding the final
  newline shows identical `-x` / `+x` lines, because git's
  "\ No newline at end of file" marker is dropped. The working-tree side
  also labels such a file "line endings only" while the commit side does
  not (`--ignore-cr-at-eol` ignores it, the blob comparison does not);
  make both consistent
- **Name endings exactly** — a lone CR at the end of a line (old Mac
  endings, a CR without LF) is called CRLF today, and with `a\r\r\n`-style
  input a CR can reach copied text
- **Give mixed conversions a direction** — when some lines go LF → CRLF and
  others CRLF → LF, the file gets the label and the marks but the diff
  header names no direction

## Graph / UI

- **Calendar** — a calendar of the history, with a bubble on each day
  sized by its activity (what the size counts is still open)
- **Blame** — add it to the diff line-selection menu (the UI foundation
  exists); backend via gix blame or git CLI delegation
- **Hide stashes entirely** — hide the stash badge and the stash commit
  itself. Toggling a stash's internals (its index and untracked-files
  commits) is implemented. Hiding the whole stash needs a query parameter
  design, since commit collection is server-side (awaiting confirmation
  that it is wanted)

## Tag / branch operations (follow-ups to ADR 0021)

- Annotated tags (message input, showing the annotation)
- Pushing/deleting tags and branches on the remote (needs a decision on
  outbound operations first)
- Branch delete/rename in the badge menu

## Miscellaneous

- Conflict-resolution support in the UI (future item of ADR 0014)
- **Submit to WinGet from the release workflow** — each version's manifest
  is submitted to `microsoft/winget-pkgs` by hand
- **Consolidate the git-running helpers** — three functions start
  `git -C <path>` (`run` in `branch.rs`, `run` in `status.rs`, `output` in
  `uncommitted.rs`) and differ only in lock handling and how errors return
