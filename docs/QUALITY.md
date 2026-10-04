# Quality and Responsibility

[English](QUALITY.md) | [日本語](QUALITY.jp.md)

The single source for gitreant's quality gates and the scope of the service
it provides.

## Quality gates

| When | What must be green |
|---|---|
| Every push | `cargo test` (unit + integration) and the frontend's `tsc -b` / `vitest run` / `vite build`. A bug fix writes its reproducing test first (Red→Green). |
| Each feature milestone | The full E2E suite. Run it when a batch of UI work lands, or once several features have piled up without an E2E run. |
| Before a release / tag | The full E2E suite plus the `pnpm screenshot` assertions (a visual regression of the features the README advertises). |

E2E operational constraint: the suite runs serially and takes 10–17 minutes.
While it runs, do not overwrite `frontend/dist` or build the binary — the
running tests are using them.

## Responsibility scope

### Trust boundary

- The server binds to 127.0.0.1 only and has no authentication.
- Single-user, same-machine use is assumed. Remote exposure and multi-user
  use are out of scope; safety behind a reverse proxy or similar is not
  guaranteed.

### Data safety

- Writes to a repository happen only through explicit actions:
  fetch / checkout / merge / create branch / create & delete tag / viewing a
  stash.
- History rewriting (rebase, amend, reset), force push, branch deletion, and
  deleting working-tree files are not offered. Changing this policy requires
  an ADR.
- Background reads are implemented so they never fight a concurrent local git
  operation (e.g. `GIT_OPTIONAL_LOCKS=0`).
- The contents of an opened repository (`.gitmodules`, ref names, paths, etc.)
  are treated as trusted by the user. The validity of a submodule's declared
  target is the repository maintainer's responsibility; gitreant only renders
  declared paths (those that are git repositories) read-only, with no
  isolation beyond what plain git offers. Defending against untrusted
  repository content is out of scope.

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
