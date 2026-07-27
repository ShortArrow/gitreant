# Contributing to gitreant

## Development setup

Requirements: Rust (stable), Node.js + pnpm.

```console
$ cargo run -- .            # backend (:4000)
$ cd frontend && pnpm dev   # frontend (Vite, proxies /api to :4000)
```

## Architecture

Single binary. Backend in Rust (`axum`), frontend in TypeScript (React + Vite).

```
main (CLI) ──▶ server (axum) ──▶ app (session) ──▶ domain (graph layout)
                                       └──────────▶ git (gix adapter)
```

- **domain**: pure function that assigns lanes (columns) and colors to a
  commit list. No external I/O.
- **git**: adapter that reads repositories with `gix` (gitoxide, pure Rust)
  and converts them into a topologically ordered commit list.
- **app**: manages the set of displayed repositories and composes layout
  results with metadata into JSON views.
- **server**: REST + SSE endpoints, SPA serving via `rust-embed`, and
  single-instance detection over loopback.
- **frontend**: receives lane-precomputed JSON and draws the graph with
  hand-rolled SVG.

## API

The `/api/*` routes are defined in one place — the `router()` function in
`src/server/api.rs`. Read it there rather than a table here, which only
duplicates the code and drifts out of date. Conventions across the routes:
a repository is addressed by its `id` (its canonical path), request and
response bodies are JSON, and `/api/events` is a Server-Sent Events stream.

## Tests

```console
$ cargo test                    # Rust: domain / git / server
$ cd frontend && pnpm test:unit # Vitest: pure frontend functions
$ cd frontend && pnpm test:e2e  # Playwright E2E (generates fixtures, starts server)
```

- `domain`: unit tests for lane assignment (empty, linear, branch/merge,
  freed-lane reuse).
- `git`: characterization tests against generated real repositories
  (graph reading and single-commit details with file changes).
- `server`: ping / add / remove / dedup / shutdown / 404 fallback over a real
  socket.
- `detach`: runs the real binary to verify detach-by-default, `--shutdown`,
  `restart` (same repositories come back up), and single-instance forwarding.
- `unit` (Vitest): pure frontend functions — unified-diff parsing, file-tree
  building, edge paths, theme resolution, width clamping.
- `e2e` (Playwright): drawer listing, tab open/close, graph rendering
  (nodes/lanes), commit details and diffs, SSE live updates, fetch, and
  repository add/remove in a real browser. Fixture repository generation and
  server startup are handled by `frontend/e2e/global-setup.ts`.

When each layer must be green — and what gitreant does and does not take
responsibility for — is defined in [QUALITY.md](QUALITY.md)
(decided by [ADR 0024](adr/0024-quality-and-responsibility.jp.md)).

## CI

`.github/workflows/ci.yml` runs:

- **rust**: `cargo build` + `cargo test` on Linux / macOS / Windows
- **web**: frontend `pnpm build` (includes type check) and `pnpm build-storybook`
- **e2e**: Playwright E2E on Ubuntu
- **docs-tandem**: bilingual documents update together — when both `X.jp.md`
  and `X.md` exist, a change to one side must change the other in the same
  push (`.github/scripts/check-docs-tandem.sh`). Structural consistency of
  the ADR indexes (same ADR set, matching slugs, honest links) is a regular
  `cargo test` (`tests/docs.rs`); Japanese is canonical and English bodies
  may be pre-linked before they exist.

The Linux build installs `libwayland-dev` because `rfd` links against the
system libwayland.

## Storybook

```console
$ cd frontend
$ pnpm storybook          # dev server (:6006)
$ pnpm build-storybook    # static build
```

`Drawer` (list / collapsed / empty) and `RepoCard` (merge history / linear /
read error) can be checked in isolation with mock data.

## README screenshots

```console
$ cd frontend
$ pnpm screenshot    # regenerates docs/images/screenshot-{dark,light}.png
```

The screenshots are taken from fixture repositories described declaratively in
`frontend/screenshot/scenario.ts` — edit its branch/commit/merge steps to
change the graph topology shown in the README, then regenerate.

## Releasing

Push a `vX.Y.Z` tag; `.github/workflows/release.yml` does the rest:

1. `cargo test --locked` on Linux / Windows / macOS gates the release.
2. Native binaries (Windows x64, Linux x64, macOS x64/arm64) are built
   with the frontend embedded, attested (SLSA provenance) and attached
   to a GitHub Release with generated notes.
3. The crate is published to crates.io via OIDC Trusted Publishing.
   The published package ships the prebuilt `frontend/dist` (see the
   `include` list in Cargo.toml), so `cargo install gitreant` needs no
   Node.js. Put `[skip publish]` in the tagged commit message to skip
   this job.

One-time setup: register this repository + `release.yml` as a Trusted
Publisher for the `gitreant` crate on crates.io (Settings → Trusted
Publishing). No registry token is stored anywhere.

## Architecture decisions

Design decisions and their rationale are recorded as ADRs under
[adr/](adr/).
