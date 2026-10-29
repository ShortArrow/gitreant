# Features

[English](FEATURES.md) | [日本語](FEATURES.jp.md)

What gitreant does, by area. For starting it and the command-line options,
see the [README](../README.md); design decisions live in [adr/](adr/).

## Repositories side by side

- **Several repositories on one page.** The drawer on the left lists them;
  add, remove, filter by name or path, and sort. An "Add repository" row
  ends the list and opens into a field: type a path and press Enter, or
  choose a folder through the native folder picker.
- **Joins the running server.** Running `gitreant` from another directory
  adds that repository to the server already running, on the same page.
- **Tabs and two panes.** Each open repository is a tab. A tab's or a
  drawer row's context menu opens it in the right pane, so two
  repositories can be compared side by side. A middle click closes a tab.
- **Status in the drawer.** Each repository shows, in small, how many
  uncommitted changes, unpushed commits and branches without an upstream it
  has.
- **Submodules and worktrees nest.** A repository with submodules lists
  them under itself. Linked `git worktree` checkouts nest under their
  repository too, with the branch each has checked out. Clicking either
  opens it as a view of its own. The filter finds them too, a worktree
  also by its branch, and opens their repository to the ones it finds.
- **Live updates and read progress.** Adding or removing a repository
  reaches every open browser through Server-Sent Events, and the reload
  button re-reads from disk. A large repository shows how many commits have
  been read, in the drawer and in the pane, and its graph rows appear as
  they load.

## The commit graph

- **Lanes and colours are computed on the server.** The checked-out branch
  runs as a straight line on the left, branches fork to the right and
  merges come back from the right. A branch keeps its colour end to end;
  a stash takes a colour of its own. Each takes the lowest colour no lane
  in use holds, so lanes side by side differ.
- **HEAD and merges.** The HEAD commit is a hollow ring; merge commit
  messages are dimmed.
- **Nodes.** Hovering a node shows its hash and fades the rows, nodes and
  edges off its first-parent chain; clicking selects the commit. Its context menu is the commit row's: copy the full id, create a
  tag or a branch, go to a parent or child, and, when the origin is on
  github.com or gitlab.com, copy or open the commit's web page. Clicking a hash copies the full id.
- **Badges.** Branches, tags and the stash render as distinct badges. Remote
  branches, and tags pushed to a remote, carry the remote's name as a
  separate segment. Hovering a branch badge fades the rows, nodes and edges
  its tip cannot reach, among the loaded commits.
- **Stashes.** A stash folds to one node, a ring around a dot. A setting reveals its index and
  untracked-files commits, linked by dashed lines.
- **Submodule graphs.** For a repository with submodules, each submodule's
  graph sits to the left, with dashed links between the commits that moved
  its pointer. A setting turns this off. Each submodule's graph collapses
  to a narrow strip with its name, giving the rows their width back; the
  choice is kept per repository. Hovering a submodule's node names
  its commit, and its context menu copies the id or, from the submodule's
  own origin, the commit's web page. Right-clicking a submodule's graph
  or strip elsewhere opens the submodule in a tab, here or in the right
  pane.
- **Author avatars.** Rows show the author's GitHub avatar; a setting hides
  them.
- **Lines added and deleted.** Each row shows `+N −M`, the lines its commit
  added and deleted against its first parent. The counts fill in after the
  graph shows. A setting draws them as bars at the start of each row
  instead, deleted left of an axis and added right of it, on the
  thickness's logarithmic scale; the numbers stay in the tooltip. The
  setting can also leave them out of the rows.
- **Thickness.** The graph gives each counted commit a see-through
  thickness, green up and to the left by the lines it added and red down
  and to the right by the lines it deleted, on a logarithmic scale; the
  edges between commits carry it as fins. Dragging the graph's background
  turns the direction it extrudes in and, up or down, its depth, down to
  none; letting go turns it back. The fins are fainter than the commits'
  pillars. The green stands in front of the nodes and the red behind the
  edges, the lanes to the right in front; a setting outlines each lane's
  thickness to show that order. A graph setting turns it off.
- **Lines over time.** A button in the pane's header shows, in place of
  the rows, the lines added (up) and deleted (down) along HEAD's first
  parents summed over the commit time, with their net change between
  them, from the oldest loaded commit. A legend names each line; hovering
  names the nearest commit and its sums. Candles of the net change and
  bars of the lines each period added and deleted sit on the same axes; a
  timeframe beside the legend cuts them by commit, day, week, month,
  quarter or year, or by whichever calendar period suits the span, and by
  commit the commits drawn on the same spot add up. A range beside it
  narrows the chart to the last five years, year, six, three or one
  months, summed from zero at the range's start. Pressing a name in the
  legend hides or shows its series. Clicking the chart lists the
  commits under the cursor beside it; right-clicking one offers "Show in
  rows".
- **Calendar.** Another button in the header shows a calendar of the
  loaded commits as a strip under the rows, a column per week from
  Monday, or from Sunday by a setting the chart's weeks follow too. Each
  day is shaded more strongly the more lines its commits changed, green
  when they added and red when they deleted; merges are left out; buttons
  above the weeks shade by the lines added or deleted alone instead.
  Hovering a day names its commits and lines; clicking it selects its
  newest commit in the rows, and clicking again each older one in turn.
  Scrolling to its oldest end reads older history.

## Commit details and diffs

- **The detail pane.** Clicking a commit shows its full message, author,
  date, signature state, parents and changed files. The author links to
  their GitHub profile; the email and the parent ids copy on click.
- **Changed files.** Files show as a flat list or a directory tree, with
  added and removed line counts; a binary file is labelled "Binary"
  instead. A file's context menu copies its relative or absolute path,
  or opens it with the OS default handler.
- **The diff pane.** Clicking a file opens its diff, inline or side by
  side, with the changed part of each line highlighted. "Diff all" opens
  every file's diff at once, and pressed again closes it. Where unchanged
  lines are hidden, buttons show twenty more above or below a hunk, and
  "Whole file" shows the file in full with its changes marked.
- **Comparing two commits.** With a commit selected, another commit's
  context menu compares the two: the diff pane shows every file that
  differs, from the older (ancestor) commit to the newer, headed
  `base..target`, and the detail pane lists both commits and the files
  with their line counts. See [ADR 0035](adr/0035-graph-node-navigation.md).
- **Line-ending changes.** A file whose only change is its line endings
  (LF against CRLF) is labelled "Line endings only"; its diff marks the
  changed line ends and the header names the direction (`LF → CRLF` and so
  on). See [ADR 0029](adr/0029-line-ending-changes.md).
- **Selecting lines.** Click a line number in a diff to select it
  (shift-click for a range), then copy the lines, a GitHub permalink, the
  permalink as a Markdown or a Typst link named by the file and its lines,
  or the file's relative or absolute path. A button beside each file's
  name in the diff copies its path.
- **Pane widths.** The drawer and the detail pane resize by dragging, and
  keep their widths next time.

## Work in progress

- **Uncommitted changes.** A dirty working tree shows as a dashed row above
  HEAD; opening it lists the changed files and their diffs against HEAD.
  See [ADR 0027](adr/0027-uncommitted-changes-row.md).
- **Branches checked out elsewhere.** A branch checked out in another
  worktree carries a mark on its badge, and its menu disables the checkout
  git would refuse. See [ADR 0028](adr/0028-worktrees.md).

## Changing repositories

gitreant writes to a repository only through the explicit operations below,
each delegated to the git command. What it never does is listed in
[QUALITY.md](QUALITY.md).

- **Fetch.** A button runs `git fetch` for every shown repository; a
  repository whose fetch fails shows the error.
- **Branches.** A branch badge's context menu copies the name, checks the
  branch out, or merges it into the current branch (after a confirmation).
  A commit's context menu creates a branch at it, or checks the commit out
  with a detached HEAD (after a confirmation).
- **Tags.** A commit's context menu creates a tag; a tag badge's context
  menu deletes it.
- **A record of what ran.** The log pane at the bottom lists the git
  commands executed and the actions taken in the UI, with times.

## GitHub and signatures

- **Pull requests.** With the `gh` CLI installed and authenticated, branch
  badges link to their open pull request. A squash-merged branch that still
  exists gets a dashed link to the commit its pull request landed as (a
  setting turns it off).
- **Signatures.** Signed commits carry a badge: Verified or Unverified when
  a local gpg can check the signature, plain Signed otherwise. The graph
  shows before the check ends; until then a pulsing placeholder stands in
  for the badge. After adding
  a key to gpg, re-verify from the settings dialog or with
  `gitreant refresh`.

`gh` and `gpg` are optional; without them the features that need them
quietly disappear. `gitreant doctor` reports which are available.

## Keyboard and settings

- **Command palette.** Ctrl+K (Cmd+K on macOS) opens it: switch
  repositories, fetch, reload, toggle the theme and display settings, check
  out a branch, and more, from the keyboard.
- **Moving the selection.** In the focused pane, `↑` / `↓` select the row
  above or below, `←` / `→` the nearest commit in the next lane over and
  `Home` / `End` the first or last row;
  `Enter` opens every file's diff, and `Esc` clears the selection or
  closes the diff. A setting adds `k` / `j` / `h` / `l` and `gg` / `G`.
- **Settings dialog.** The UI language (auto, English, Japanese), the
  timestamp format (ISO, locale, relative), the day a week starts on
  (Monday, Sunday), how action buttons render (icon, icon with label,
  label), and the graph's optional layers (squash links, stash internals,
  author avatars, submodule graphs), and `hjkl` for moving the selection.
- **Theme.** Dark or light.
- **Environment info.** The Info dialog gathers the CLI and page versions,
  the server and the browser, ready to copy in one go.

## Running and distribution

- **A single binary.** The page is embedded in one executable with no
  runtime dependencies.
- **Detaches from the terminal.** It runs in the background by default;
  `gitreant --shutdown` stops it, and `--foreground` keeps it attached.
  `gitreant list` shows the running servers, and `--shutdown`, `restart`
  and `refresh` find the only one without `--port`. With `--verbose` it
  also shows how each repository came: at startup, from the CLI or from the
  browser.
- **A dedicated window.** `--app` opens it as a window without an address
  bar (needs a Chromium-based browser).
