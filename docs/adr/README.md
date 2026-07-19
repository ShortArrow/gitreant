# Architecture Decision Records

Design decisions of gitreant. Each ADR is frozen at decision time; a
change supersedes it with a new ADR.

English editions have not been written yet: each will appear here as
`NNNN-slug.md` and its row below will link to it. Until then the
records exist only in Japanese (`NNNN-slug.jp.md`, indexed in
`README.jp.md`).

| ADR | Title | Status |
| --- | ----- | ------ |
| 0001 | gitreant architecture | Accepted |
| 0002 | Detach from the terminal by default | Accepted |
| 0003 | Route lane-crossing edges as a one-row curve plus a vertical run | Accepted |
| 0004 | Generate README screenshots from declarative fixtures | Accepted |
| 0005 | Fetch commit details on demand | Accepted |
| 0006 | Fetch file diffs one file at a time, on demand | Accepted |
| 0007 | Delegate remote fetch to the git CLI | Accepted |
| 0008 | Build the side-by-side diff by parsing unified text client-side | Accepted |
| 0009 | Record executed external commands in a ring buffer shown in the UI | Accepted |
| 0010 | Do not open a browser when forwarding to a running server | Accepted |
| 0011 | Delegate signature verification to the git/gpg CLI and cache verdicts | Accepted |
| 0012 | Record user actions client-side and merge them into the log | Accepted |
| 0013 | Fetch PR data lazily through the gh CLI with a TTL cache | Accepted |
| 0014 | Run branch operations from badge context menus via the git CLI | Accepted |
| 0015 | Store client settings in localStorage, starting with button styles | Accepted |
| 0016 | Adopt Octicons for the icon set | Accepted |
| 0017 | Follow GitHub Primer when a UI design decision is unclear | Accepted |
| 0018 | Draw squash-merge links from gh merged-PR data | Accepted |
| 0019 | Hand-rolled typed dictionaries for i18n, language switched in settings | Accepted |
| 0020 | Lane assignment: HEAD pins the straight leftmost line, forks go right, merges come from the right | Accepted |
| 0021 | Tag operations also delegate to the git CLI, from row and badge menus | Accepted |
| 0022 | Pane splitting targets repository comparison, two side-by-side panes first | Accepted |
| 0023 | Stage loading: instant list, parallel repositories, paged rows | Accepted |
