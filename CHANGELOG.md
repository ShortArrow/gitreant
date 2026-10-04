# Changelog

All notable changes to this project are documented in this file. Each
release's section becomes its GitHub Release notes.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/ShortArrow/gitreant/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/ShortArrow/gitreant/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/ShortArrow/gitreant/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ShortArrow/gitreant/releases/tag/v0.1.0
