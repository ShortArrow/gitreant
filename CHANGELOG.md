# Changelog

All notable changes to this project are documented in this file. Each
release's section becomes its GitHub Release notes.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Hovering a graph node fades every row, node and edge off its
  first-parent chain
  ([ADR 0035](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0035-graph-node-navigation.md)).
- The keyboard moves the selection in the focused pane: `↑` / `↓` to the
  row above or below, `←` / `→` to the nearest commit in the next lane
  over, `Home` / `End` to the first or last row, `Enter` opens every
  file's diff and `Esc` clears the selection or closes the diff. A setting
  adds `hjkl` and `gg` / `G`.
- The commit menu goes to a commit's parents and children, compares the
  commit with the selected one, and checks it out with a detached HEAD
  after a confirmation. A comparison lists both commits and the files
  between them beside the diff.
- `gitreant list` shows the running servers, and `--shutdown`, `restart`
  and `refresh` find the only one without `--port`; `--shutdown --all`
  stops every one. A server records how each repository came, at startup,
  from the CLI or from the browser, which `list --verbose` and `--json`
  show
  ([ADR 0039](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0039-server-records.md)).
- Right-clicking a submodule's graph, or its collapsed strip, opens the
  submodule in a tab, here or in the right pane.

### Changed

- Hovering a branch badge fades the graph's nodes and edges with the rows.
- A stash's node is a ring around a dot, in a color of its own rather
  than the color of the branch it sits on
  ([ADR 0036](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0036-stash-node.md)).
- A repository's graph shows as soon as its history is read; signatures
  are checked after it, and a pulsing placeholder stands in for each badge
  until its verdict arrives
  ([ADR 0037](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0037-deferred-signature-check.md)).
- A lane takes the lowest color no lane in use holds, so lanes side by
  side no longer share one, and colors no longer shift as branches are
  added above
  ([ADR 0040](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0040-lane-colors-by-what-is-in-use.md)).

### Security

- The server refuses requests addressed to any name but a loopback one,
  which DNS rebinding would need, and state changes from another site's
  page, such as a shutdown sent from any open tab
  ([ADR 0038](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0038-loopback-request-guard.md)).

## [0.3.0] - 2026-10-21

### Added

- Hovering a branch badge fades the rows its tip cannot reach
  ([#17](https://github.com/ShortArrow/gitreant/issues/17)).
- Each submodule graph collapses to a narrow strip with its name, giving
  the commit rows their width back; the choice is kept per repository
  ([#18](https://github.com/ShortArrow/gitreant/issues/18)).
- The commit menu, on a row or a graph node, copies the full commit id and,
  when the origin is on github.com or gitlab.com, copies or opens the
  commit's web page
  ([#15](https://github.com/ShortArrow/gitreant/issues/15)).
- Each release carries Debian packages for amd64 and arm64, and a
  `SHA256SUMS` listing every release asset
  ([ADR 0034](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0034-debian-packages.md)).

### Changed

- "Diff all" is a toggle: pressed while every file's diff is open, it closes
  the diff and brings the graph back
  ([#19](https://github.com/ShortArrow/gitreant/issues/19)).
- A submodule graph's nodes behave like the main graph's: hovering shows the
  commit's hash, and the context menu copies its id and its web page on the
  submodule's own origin. The dashed pointer links no longer cover the node
  they end on.

### Fixed

- Commit diffs and untracked files follow the `diff` attribute of
  `.gitattributes`, as `git diff` does: `-diff` and `binary` show as binary
  with no line counts, and `diff` shows as text
  ([ADR 0033](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0033-diff-attribute.md)).
- The arm64 Linux binary starts on glibc 2.35 and later, Debian 12 and
  Raspberry Pi OS bookworm included; it needed glibc 2.39.

## [0.2.3] - 2026-10-09

### Fixed

- The Windows executables link the C runtime statically, so they start on
  a Windows without the Visual C++ Redistributable. Before, they failed
  with exit code 0xC0000135 and printed nothing
  ([ADR 0032](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0032-static-crt-on-windows.md)).

## [0.2.2] - 2026-10-04

### Fixed

- `gitreant` with no arguments outside any git repository prints the usage
  and exits with success, as `--help` does, instead of failing with
  "server exited during startup". Naming a path that is not a repository
  still fails.

### Changed

- Releases check that the tag is on `main`, names the version in
  `Cargo.toml` and has a section here; a prerelease tag (`vX.Y.Z-rc.N`)
  rehearses the pipeline without publishing to crates.io, and publishing
  waits for approval in the `release` environment
  ([ADR 0030](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0030-release-safeguards.md)).
- Release notes come from this changelog instead of being generated.

### Added

- A security policy ([SECURITY.md](https://github.com/ShortArrow/gitreant/blob/main/.github/SECURITY.md)).

## [0.2.1] - 2026-10-01

### Fixed

- Line-ending-only changes are now visible. Before, a file whose lines
  changed only from LF to CRLF (or back) listed every line as removed and
  re-added with identical text. Now:
  - where a removed and an added line differ only in their ending, the
    ending is drawn at the end of both lines (`␍␊` or `␊`), highlighted;
  - a file whose only change is its line endings carries a "Line endings
    only" label in the file list;
  - the diff header names the direction (`LF → CRLF` and so on).

  See [ADR 0029](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0029-line-ending-changes.md).

### Changed

- Commit line counts now count lines whose ending changed, matching
  `git diff`. Counts for files with CRLF content can differ from 0.2.0.

### Known limitations

- `.gitattributes` `binary` / `-diff` is not respected: git shows such
  files as binary, while gitreant counts and diffs them as text.
- Adding or removing the final newline shows identical `-x` / `+x` lines
  (git's "\ No newline at end of file" marker is dropped), and only the
  working-tree side labels it "Line endings only"; the commit side does not.
- A lone CR at the end of a line (old Mac endings) is called CRLF, and in
  `a\r\r\n`-style input a CR can reach copied text.
- Mixed-direction conversions (some lines LF → CRLF, others CRLF → LF) get
  the label and the marks but no direction in the diff header.

## [0.2.0] - 2026-10-01

### Added

- Uncommitted changes show as a dashed row above HEAD, with their files and
  diffs against HEAD ([ADR 0027](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0027-uncommitted-changes-row.md)).
- Linked `git worktree` checkouts nest under their repository in the
  drawer, and a branch checked out in another worktree carries a mark on
  its badge ([ADR 0028](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0028-worktrees.md)).
- `--app` opens gitreant in a window without an address bar, through a
  Chromium-based browser's app mode
  ([ADR 0026](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0026-app-mode-window.md)).
- The treant icon: the favicon (a multi-size `.ico`), the Windows
  executable's icon and the README logo.
- Builds for Windows on ARM, Raspberry Pi class Linux (aarch64) and Termux
  (aarch64 Android).
- Graph nodes open the commit menu and show their hash on hover.
- The commit details copy their metadata on click, and a setting chooses
  the timestamp format ([ADR 0025](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0025-timestamp-rendering.md)).

### Fixed

- Dragging a dashed link keeps the point the cursor grabbed.
- The details pane no longer shifts when a commit has no message body.
- Repository rows in the drawer are reachable as buttons.

## [0.1.0] - 2026-07-26

The first release.

[Unreleased]: https://github.com/ShortArrow/gitreant/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/ShortArrow/gitreant/compare/v0.2.3...v0.3.0
[0.2.3]: https://github.com/ShortArrow/gitreant/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/ShortArrow/gitreant/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/ShortArrow/gitreant/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/ShortArrow/gitreant/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ShortArrow/gitreant/releases/tag/v0.1.0
