# ADR 0084: Say when the server finds no git

## Status

Accepted (2026-11-17)

## Context

gitreant reads graphs with gix, in process, but checks signatures
([ADR 0037](0037-deferred-signature-check.md)) and counts lines
([ADR 0041](0041-diff-stats-per-commit.md)) by running the `git` it finds on
its PATH. A server whose PATH holds no usable `git` still shows every graph.

On 2026-11-17 a server of gitreant 0.4.0, started on Windows 11 by a
scheduled task, had `%ProgramFiles%\Git\cmd` on its PATH unexpanded.
Windows does not expand a PATH entry when it looks for a program, so the
server found no `git`. Its command log showed every signature check and
every count failing with "program not found". The page showed each signed
commit as "Signed" and the line-count chart as "29 commits still being
counted", and neither changed. The same commands in an SSH shell on that
machine, whose PATH was expanded, reported the signatures as good.

## Decision

- **A server learns once whether `git` answers,** by running
  `git --version` from its PATH. It then learns whether gpg answers, as
  before.
- **Without `git`, a read leaves no signature to check and no commit to
  count.** It runs neither, rather than fail at every batch.
- **The view says so.** It carries `git_missing: true`. The page shows that
  the server finds no git, so it checks no signature and counts no lines.
  A signed commit's badge says the server cannot check it for that reason,
  and the line-count chart and the calendar say the lines are not counted
  instead of "still being counted".
- **gitreant does not expand `%…%` in its PATH.** The server runs what its
  PATH names, as every program Windows starts does. A PATH that names
  `git` unexpanded is fixed where the server is started.
- **No gpg is unchanged.** Signatures are then shown as present only, as
  QUALITY states.

## Consequences

- A server started with a PATH that finds no `git` is told apart from one
  still counting, on the page and in its Info dialog.
- Starting `git` later does not change a running server's state: it learns
  it once. A restart does.
- `gitreant doctor` checks the PATH of the shell it runs in, which can find
  `git` where the server does not.
- Tests cover the state each pair of found tools gives, a read without
  `git` leaving nothing pending and saying why, the badge's wording, and
  the page's notice and chart message for a view that says `git` is missing.
