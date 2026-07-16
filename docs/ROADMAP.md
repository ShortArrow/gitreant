# Roadmap

[English](ROADMAP.md) | [日本語](ROADMAP.jp.md)

Grouped by area, not by priority. Settled designs live in [adr/](adr/).

## Forge support (GitHub / GitLab / Codeberg …)

Generalize the currently GitHub-only features behind a forge
abstraction keyed off the remote URL's host.

- **Affected features**: permalinks (`blob/<commit>/<path>#L..`),
  PR/MR badges and links, dashed squash-merge links
- **Approach**: the CLI-delegation pattern of ADR 0007/0013
  - GitHub: `gh` (implemented)
  - GitLab: `glab` (MR = merge request)
  - Codeberg / Forgejo / Gitea: `fj` or the REST API
- **Degradation rule**: silently disabled without the CLI, without
  auth, or on unknown hosts (same as gh today)
- Start by generalizing the remote-URL normalization
  (`github_web_url`) into per-forge providers

## Graph / UI

- **Blame** — add it to the diff line-selection menu (the UI
  foundation exists); backend via gix blame or git CLI delegation
- **Stash visibility toggle** — show/hide the stash badge and its WIP
  commits (commit collection is server-side, so this needs a query
  parameter design; awaiting confirmation that it is wanted)
- **Command palette extensions** — repository-scoped commands such as
  branch checkout

## Tag / branch operations (follow-ups to ADR 0021)

- Annotated tags (message input, showing the annotation)
- Pushing/deleting tags and branches on the remote (needs a decision
  on outbound operations first)
- Branch delete/rename in the badge menu

## Miscellaneous

- Conflict-resolution support in the UI (future item of ADR 0014)
- ~~Release binaries~~ — done: tag-driven GitHub Releases + crates.io
  publishing with the prebuilt frontend bundled (see CONTRIBUTING.md,
  "Releasing"); v0.1.x line for now
