# ADR 0001: gitreant architecture

## Status

Accepted (2026-07-08)

## Context

Build a web app that displays the commit graphs of multiple local git
repositories together in a single SPA. The reference implementation is
[k1LoW/mo](https://github.com/k1LoW/mo). `mo` embeds a React SPA into
a single Go binary via `go:embed` and starts a local server with
`net/http` + REST + SSE. It accepts multiple files as arguments,
arranges them on one screen, and when launched a second time adds them
to the existing server via HTTP POST.

## Decision

Build the equivalent experience with Rust + TypeScript.

- **Distribution**: embed the Vite build output into a single Rust
  binary with `rust-embed`.
- **Display unit**: multiple repositories. Accepted via
  `gitreant [PATH...]`; with no arguments, search upward from the
  current directory for `.git` and add one repository.
- **Second-launch detection**: if a server is already running, a newly
  launched binary only adds the repository to the existing session via
  `POST /api/repos` and opens the browser.
- **git access**: `gix` (gitoxide, pure Rust). No C toolchain
  dependency, which makes cross-compilation and single-binary
  distribution easy.
- **Backend**: `axum` + `tokio`. Serves the REST API and SSE.
- **Graph rendering**: lane assignment (computing where lines fork and
  join) happens in the Rust domain layer and is returned as JSON. The
  frontend renders it in React as a hand-rolled SVG layout engine.
- **Frontend**: React + Vite + TypeScript.

## Dependency direction

```
main (CLI) ──▶ server (axum) ──▶ app (session) ──▶ domain (graph)
                                        └──────────▶ git (gix adapter)
```

Higher-level policy (domain) does not depend on lower-level detail
(gix, axum). The domain holds only the pure lane-assignment algorithm
for the graph and knows nothing about external I/O.

## Consequences

- The domain lane assignment is TDD-able as a pure function (no
  external dependencies).
- The gix API is still evolving, so the git adapter layer absorbs it
  and keeps the domain clean.
- Because distribution is a single binary, the frontend build must run
  before a release build (wired up via `build.rs` or the Makefile).
