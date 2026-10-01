# Features

[English](FEATURES.md) | [日本語](FEATURES.jp.md)

What gitreant does, by area. For starting it and the command-line options,
see the [README](../README.md); design decisions live in [adr/](adr/).

## Repositories side by side

- **Several repositories on one page.** The drawer on the left lists them;
  add, remove, filter by name or path, and sort. Add one by typing its path
  or through the native folder picker.
- **Joins the running server.** Running `gitreant` from another directory
  adds that repository to the server already running, on the same page.
- **Tabs and two panes.** Each open repository is a tab. A tab's or a
  drawer row's context menu opens it in the right pane, so two
  repositories can be compared side by side.
- **Status in the drawer.** Each repository shows, in small, how many
  uncommitted changes, unpushed commits and branches without an upstream it
  has.
- **Submodules and worktrees nest.** A repository with submodules lists
  them under itself. Linked `git worktree` checkouts nest under their
  repository too, with the branch each has checked out. Clicking either
  opens it as a view of its own.
- **Live updates and read progress.** Adding or removing a repository
  reaches every open browser through Server-Sent Events, and the reload
  button re-reads from disk. A large repository shows how many commits have
  been read, in the drawer and in the pane, and its graph rows appear as
  they load.

## The commit graph

- **Lanes and colours are computed on the server.** The checked-out branch
  runs as a straight line on the left, branches fork to the right and
  merges come back from the right. A branch keeps its colour end to end.
- **HEAD and merges.** The HEAD commit is a hollow ring; merge commit
  messages are dimmed.
- **Nodes.** Hovering a node shows its hash and clicking selects the
  commit. Its context menu is the commit row's (create a tag or a branch).
  Clicking a hash copies the full id.
- **Badges.** Branches, tags and the stash render as distinct badges. Remote
  branches, and tags pushed to a remote, carry the remote's name as a
  separate segment.
- **Stashes.** A stash folds to one node. A setting reveals its index and
  untracked-files commits, linked by dashed lines.
- **Submodule graphs.** For a repository with submodules, each submodule's
  graph sits to the left, with dashed links between the commits that moved
  its pointer. A setting turns this off.
- **Author avatars.** Rows show the author's GitHub avatar; a setting hides
  them.

## Commit details and diffs

- **The detail pane.** Clicking a commit shows its full message, author,
  date, signature state, parents and changed files. The author links to
  their GitHub profile; the email and the parent ids copy on click.
- **Changed files.** Files show as a flat list or a directory tree, with
  added and removed line counts. A file's context menu copies its relative
  or absolute path, or opens it with the OS default handler.
- **The diff pane.** Clicking a file (or "Diff all") opens its diff, inline
  or side by side, with the changed part of each line highlighted.
- **Line-ending changes.** A file whose only change is its line endings
  (LF against CRLF) is labelled "Line endings only"; its diff marks the
  changed line ends and the header names the direction (`LF → CRLF` and so
  on). See [ADR 0029](adr/0029-line-ending-changes.md).
- **Selecting lines.** Click a line number in a diff to select it
  (shift-click for a range), then copy the lines or a GitHub permalink.
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
  A commit's context menu creates a branch at it.
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
  a local gpg can check the signature, plain Signed otherwise. After adding
  a key to gpg, re-verify from the settings dialog or with
  `gitreant refresh`.

`gh` and `gpg` are optional; without them the features that need them
quietly disappear. `gitreant doctor` reports which are available.

## Keyboard and settings

- **Command palette.** Ctrl+K (Cmd+K on macOS) opens it: switch
  repositories, fetch, reload, toggle the theme and display settings, check
  out a branch, and more, from the keyboard.
- **Settings dialog.** The UI language (auto, English, Japanese), the
  timestamp format (ISO, locale, relative), how action buttons render (icon,
  icon with label, label), and the graph's optional layers (squash links,
  stash internals, author avatars, submodule graphs).
- **Theme.** Dark or light.
- **Environment info.** The Info dialog gathers the CLI and page versions,
  the server and the browser, ready to copy in one go.

## Running and distribution

- **A single binary.** The page is embedded in one executable with no
  runtime dependencies.
- **Detaches from the terminal.** It runs in the background by default;
  `gitreant --shutdown` stops it, and `--foreground` keeps it attached.
- **A dedicated window.** `--app` opens it as a window without an address
  bar (needs a Chromium-based browser).
