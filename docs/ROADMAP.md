# Roadmap

[English](ROADMAP.md) | [日本語](ROADMAP.jp.md)

The next two versions each have a theme. Items after them are grouped by
area, not by priority. Settled designs live in [adr/](adr/).

## 0.2.0 — see the work in progress (release in preparation)

The version that brings the work in progress, not only committed history,
onto one screen.

- **Uncommitted changes as a row above HEAD**
  ([ADR 0027](adr/0027-uncommitted-changes-row.md))
- **git worktree support** ([ADR 0028](adr/0028-worktrees.md))
- A dedicated window with `--app` ([ADR 0026](adr/0026-app-mode-window.md))
- The app icon (favicon, Windows executable, README)
- Builds for Windows on ARM, Raspberry Pi and Termux
- A context menu and a hash tooltip on graph nodes (the groundwork for
  0.3.0)
- Copyable commit metadata and a timestamp format setting
  ([ADR 0025](adr/0025-timestamp-rendering.md))

Before release, pass the release gate in [QUALITY.md](QUALITY.md): the full
E2E suite and the `pnpm screenshot` assertions.

## 0.3.0 — more from graph nodes

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

Which of these go into 0.3.0 is narrowed when work starts, once the UI
behaviour (how selection starts and clears, how it relates to the panes)
is settled.

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

## Graph / UI

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
- **Consolidate the git-running helpers** — three functions start
  `git -C <path>` (`run` in `branch.rs`, `run` in `status.rs`, `output` in
  `uncommitted.rs`) and differ only in lock handling and how errors return
