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
- A middle click closes a tab.
- Each row shows the lines its commit added and deleted against its first
  parent, counted after the graph shows
  ([ADR 0041](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0041-diff-stats-per-commit.md)).
- The graph gives each counted commit a see-through thickness, green for
  the lines it added and red for the lines it deleted, joined along its
  edges by fainter fins; a graph setting turns it off
  ([ADR 0044](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0044-graph-thickness.md)).
- Dragging the graph's background tilts the thickness: sideways turns
  the direction it extrudes in, up and down change its depth, and letting
  go turns it back
  ([ADR 0045](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0045-tilt-thickness.md)).
- A button in the pane's header charts the lines added and deleted along
  HEAD's first parents, summed over time, in place of the rows
  ([ADR 0043](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0043-cumulative-chart.md)).
- The chart adds candles of the net change and bars of each period's
  lines, a day, a week or a month each, and its legend turns each series
  on and off
  ([ADR 0047](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0047-net-candles.md)).
- Clicking the chart lists the commits under the cursor beside it, and a
  listed commit's menu goes back to its row
  ([ADR 0048](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0048-chart-commits-under-cursor.md)).
- A timeframe beside the chart's legend cuts its candles and bars by
  commit, day, week or month
  ([ADR 0049](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0049-chart-timeframe.md)).
- A calendar of the history under the rows shades each day by the lines
  its commits added and deleted, and a click selects the day's commits in
  the rows
  ([ADR 0050](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0050-calendar.md)).
- A range narrows the chart of lines over time to its last years or
  months, and its timeframe also cuts by quarter or year
  ([ADR 0051](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0051-chart-range.md)).
- A setting draws each row's line counts as bars, deleted left of an axis
  and added right of it
  ([ADR 0046](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0046-line-count-bars.md)),
  or leaves them out of the rows
  ([ADR 0052](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0052-line-counts-off.md)).
- The changed-files list labels a binary file "Binary" in place of its
  `+0 −0`, which read the same as a text file with no line added or
  deleted
  ([ADR 0053](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0053-binary-files-in-the-list.md)).
- The drawer's filter finds the submodules and worktrees nested under a
  repository, a worktree also by its branch, and opens the repository to
  them
  ([ADR 0054](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0054-filter-nested-rows.md)).
- A setting starts the weeks on Sunday instead of Monday, in the calendar
  and in the chart's weekly candles and bars alike
  ([ADR 0056](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0056-week-start.md)).
- The diff's line menu also copies the permalink as a Markdown or a Typst
  link named by the file and its lines, and the file's relative or
  absolute path; a button beside each file's name in the diff copies its
  path.
- The diff shows the unchanged lines around its hunks on demand: twenty
  more above or below a hunk at a time, or the whole file with its changes
  marked
  ([ADR 0061](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0061-diff-context.md)).
- A changed file opens with one of the editors kept in the settings, a
  list saved to `config.toml` in the XDG configuration directory; on
  Windows the file's menu also asks the system which application to use
  ([ADR 0062](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0062-open-with-editors.md)).

### Changed

- The graph's thickness is drawn by depth: the added side in front of the
  nodes and the deleted side behind the edges, each lane as one shape with
  the lanes to the right in front
  ([ADR 0058](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0058-thickness-depth-order.md));
  a setting, off by default, outlines each lane's shape
  ([ADR 0059](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0059-thickness-outline-setting.md)).
- The calendar's buttons for shading by both, added or deleted lines carry
  diff icons and follow the button style setting like the other buttons
  ([ADR 0057](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0057-segmented-button-style.md)).
- A repository is added from an "Add repository" row at the end of the
  list, which opens into a path field (Enter adds it) and "Choose
  folder…"; the path field, Browse and Add buttons no longer sit above the
  filter
  ([ADR 0055](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0055-drawer-add-panel.md),
  [ADR 0060](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0060-add-row.md)).
- The settings' one-of-a-few choices (buttons, language, date format) are
  segmented buttons instead of radio buttons.
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

### Fixed

- Line counts and signature verdicts no longer go missing when they are
  announced before the page listens for them, or when an older read of the
  view answers after a newer one.
- A branch that grows from a line other than the checked-out one forks to
  the right of that line instead of the left
  ([ADR 0020](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0020-lane-principles.md)).
- The graph's thickness tilts smoothly in a long history: only the rows
  near the scroll are drawn thick
  ([ADR 0044](https://github.com/ShortArrow/gitreant/blob/main/docs/adr/0044-graph-thickness.md)).
- A count of one reads in the singular in English: "1 commit" over a
  repository and in the drawer, and likewise for unpushed commits,
  uncommitted changes and local-only branches.

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
