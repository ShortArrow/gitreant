# Architecture Decision Records

Design decisions of gitreant. Each ADR is frozen at decision time; a
change supersedes it with a new ADR.

English editions have not been written yet. The rows below already
link to their future `NNNN-slug.md` names, so each link comes alive as
its English edition lands. Until then the records exist only in
Japanese (`NNNN-slug.jp.md`, indexed in `README.jp.md`).

| ADR | Title | Status |
| --- | ----- | ------ |
| [0001](0001-architecture.md) | gitreant architecture | Accepted |
| [0002](0002-detach-by-default.md) | Detach from the terminal by default | Accepted |
| [0003](0003-edge-routing.md) | Route lane-crossing edges as a one-row curve plus a vertical run | Accepted |
| [0004](0004-readme-screenshots.md) | Generate README screenshots from declarative fixtures | Accepted |
| [0005](0005-commit-detail-on-demand.md) | Fetch commit details on demand | Accepted |
| [0006](0006-file-diff-on-demand.md) | Fetch file diffs one file at a time, on demand | Accepted |
| [0007](0007-fetch-via-git-cli.md) | Delegate remote fetch to the git CLI | Accepted |
| [0008](0008-split-diff-client-side.md) | Build the side-by-side diff by parsing unified text client-side | Accepted |
| [0009](0009-command-log.md) | Record executed external commands in a ring buffer shown in the UI | Accepted |
| [0010](0010-no-browser-on-forward.md) | Do not open a browser when forwarding to a running server | Accepted |
| [0011](0011-signature-verification.md) | Delegate signature verification to the git/gpg CLI and cache verdicts | Accepted |
| [0012](0012-user-action-log.md) | Record user actions client-side and merge them into the log | Accepted |
| [0013](0013-pr-links-via-gh.md) | Fetch PR data lazily through the gh CLI with a TTL cache | Accepted |
| [0014](0014-branch-operations.md) | Run branch operations from badge context menus via the git CLI | Accepted |
| [0015](0015-client-settings.md) | Store client settings in localStorage, starting with button styles | Accepted |
| [0016](0016-octicons.md) | Adopt Octicons for the icon set | Accepted |
| [0017](0017-primer-design-direction.md) | Follow GitHub Primer when a UI design decision is unclear | Accepted |
| [0018](0018-squash-merge-links.md) | Draw squash-merge links from gh merged-PR data | Accepted |
| [0019](0019-i18n.md) | Hand-rolled typed dictionaries for i18n, language switched in settings | Accepted |
| [0020](0020-lane-principles.md) | Lane assignment: HEAD pins the straight leftmost line, forks go right, merges come from the right | Accepted |
| [0021](0021-tag-operations.md) | Tag operations also delegate to the git CLI, from row and badge menus | Accepted |
| [0022](0022-pane-split.md) | Pane splitting targets repository comparison, two side-by-side panes first | Accepted |
| [0023](0023-progressive-loading.md) | Stage loading: instant list, parallel repositories, paged rows | Accepted |
