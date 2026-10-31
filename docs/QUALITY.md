# Quality and Responsibility

[English](QUALITY.md) | [日本語](QUALITY.jp.md)

The single source for gitreant's security premise, its quality gates and
the scope of the service it provides.

## Security

Security is the premise of every requirement, functional or not. A feature
is designed to open no new path from outside input to running a program,
reading or writing a file, or rendering markup, before its cost or its use
is weighed.

### Trust boundary

- The server binds to 127.0.0.1 only. It answers only requests addressed to
  a loopback name, and changes state only for its own page or a client that
  is not a page ([ADR 0038](adr/0038-loopback-request-guard.md)).
- Every request under `/api/` carries a secret the server draws from the
  operating system's random source at each start; only `/api/ping`, which
  says a gitreant answers, needs none. The CLI trusts a running server only
  once it proves it holds the secret
  ([ADR 0063](adr/0063-request-token.md),
  [ADR 0064](adr/0064-prove-the-secret.md)).
- One person uses the server, on the machine it runs on. Other accounts on
  that machine, and containers or sandboxes that share its loopback, are
  assumed to reach the server's port and to take a port it has left; they
  are not assumed to read the user's files or memory. They get nothing
  without the secret, and the CLI sends a server nothing until it proves
  it holds the secret ([ADR 0071](adr/0071-other-accounts-in-scope.md)).
- Remote exposure is out of scope; safety behind a reverse proxy or
  similar is not guaranteed.
- The contents of an opened repository (`.gitmodules`, ref names, paths,
  its git configuration, etc.) are treated as trusted by the user. The
  validity of a submodule's declared target is the repository maintainer's
  responsibility; gitreant only renders declared paths (those that are git
  repositories) read-only, with no isolation beyond what plain git offers.
  Defending against untrusted repository content is out of scope.

### Rules every feature keeps

- A request picks a program to run only by its place in a list the user
  configured. What a request carries reaches a command only as an
  argument, never through a shell.
- A new endpoint goes under `/api/`, inside the secret check.
- A request starts no external process beyond the work it asks for. What
  is the same for every request, such as a tool's version, is found once
  per process.
- A security claim is checked against the code path, and where it can be,
  by a test that fails without the defence.

## Quality gates

| When | What must be green |
|---|---|
| Every push | `cargo test` (unit + integration) and the frontend's `tsc -b` / `vitest run` / `vite build`. A bug fix writes its reproducing test first (Red→Green). |
| Each feature milestone | The full E2E suite. Run it when a batch of UI work lands, or once several features have piled up without an E2E run. |
| Before a release / tag | The full E2E suite plus the `pnpm screenshot` assertions (a visual regression of the features the README advertises). |

E2E operational constraint: the suite runs serially. While it runs, do not
overwrite `frontend/dist` or build the binary — the running tests are using
them.

## Responsibility scope

### Data safety

- Writes to a repository happen only through explicit actions:
  fetch / checkout / merge / create branch / create & delete tag / viewing a
  stash.
- History rewriting (rebase, amend, reset), force push, branch deletion, and
  deleting working-tree files are not offered. Changing this policy requires
  an ADR.
- Background reads are implemented so they never fight a concurrent local git
  operation (e.g. `GIT_OPTIONAL_LOCKS=0`).

### External dependencies and degraded behavior

| Tool | Role | When missing |
|---|---|---|
| git | Required | Effectively unusable; `gitreant doctor` reports it |
| gh | Optional | PR links, squash-merge dashed links, and avatar search quietly disappear |
| gpg | Optional | Signatures show as "Signed" only, never verified |

`gitreant doctor` is the single window for diagnostics.

### Network egress

The only outbound traffic is these four paths. No telemetry or usage data is
sent.

- `git fetch` — to the remotes the user configured
- `git ls-remote` — to the same remotes
- the `gh` CLI — the GitHub API, under the user's own authentication
- avatar image fetches — avatars.githubusercontent.com / github.com
  (from the browser; can be turned off in settings)

## Warranty

Provided as-is, without warranty, per the MIT / Apache-2.0 dual license.
