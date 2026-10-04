# Contributing to gitreant

## Development setup

Requirements: Rust (stable), Node.js + pnpm.

```console
$ cargo run -- .            # backend (:4000)
$ cd frontend && pnpm dev   # frontend (Vite, proxies /api to :4000)
```

The pnpm version this project runs is declared once, in
`frontend/package.json` — `packageManager` for CI, and `devEngines` for the
version managers that read it. Whatever provisions your pnpm (mise, Corepack,
a manual install), take the version from there; CI reads the same field
rather than carrying its own copy.

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
responsibility for — is defined in [QUALITY.md](QUALITY.md).

## CI

`.github/workflows/ci.yml` runs:

- **rust**: `cargo build` + `cargo test` on Linux / macOS / Windows
- **web**: frontend `pnpm build` (includes type check) and `pnpm build-storybook`
- **e2e**: Playwright E2E on Ubuntu
- **docs-tandem**: bilingual documents update together — when both `X.jp.md`
  and `X.md` exist, a change to one side must change the other in the same
  push (`.github/scripts/check-docs-tandem.sh`); a change that only re-breaks
  lines is exempt, since Japanese paragraphs are kept on one line (a break
  inside one renders as a stray space). Structural consistency of
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

## App icon

```console
$ cd frontend
$ pnpm icon    # regenerates public/{favicon.ico,favicon.svg,icon.svg,icon-512.png}
```

The master is the Inkscape file `frontend/icon/gitreant.svg`. It carries
three drawings of the treant, one top-level layer each, drawn for the size
they are meant for: "512px main" (128px and up), "64px faceup" (24-64px)
and "16px outline" (16-20px). `pnpm icon` strips the editor metadata, gives
the main and faceup frames a white outline one pixel wide at the target
size (the 16px glyph draws its own), and renders `icon-512.png` and
`favicon.ico` when Inkscape is installed, otherwise the committed ones
stay. `favicon.ico` holds one frame per size from 16 to 256px, each from
the drawing made for it, so browsers pick the frame they need; `favicon.svg`
(faceup) covers other sizes and `icon.svg` (main) is the README logo. Vite
copies `public/` into `dist`, so the binary serves the icons at the site
root, and on Windows `build.rs` embeds the same `favicon.ico` as the
executable's icon resource through `winresource`.

## Releasing

How a release is guarded is [ADR 0030](adr/0030-release-safeguards.md).

1. Pass the release gate in [QUALITY.md](QUALITY.md): the full E2E suite
   and the `pnpm screenshot` assertions.
2. Move the `[Unreleased]` entries of [CHANGELOG.md](../CHANGELOG.md) under
   a `## [X.Y.Z] - YYYY-MM-DD` heading and add its compare link. The
   section becomes the GitHub Release notes as written, so links in it are
   absolute URLs.
3. Bump the version to `X.Y.Z` on `main`, in one commit with the changelog
   section: `version` in `Cargo.toml` and in `frontend/package.json`, and
   the `gitreant` entry in `Cargo.lock` (`cargo update -p gitreant
   --offline`). Every cargo step in the release runs with `--locked`, so a
   stale `Cargo.lock` fails the release before anything is built. CI fails
   while the version in `Cargo.toml` has no changelog section.
4. Optionally rehearse with a prerelease tag (`vX.Y.Z-rc.N`): it runs the
   tests and builds and creates a prerelease GitHub Release with generated
   notes, but never publishes to crates.io. Delete the rehearsal's release
   and tag afterwards (`gh release delete vX.Y.Z-rc.N --cleanup-tag`).
5. Push a signed `vX.Y.Z` tag on `main`. `.github/workflows/release.yml`
   then:
   1. checks that the tag is on `main`, matches `Cargo.toml` and has a
      changelog section;
   2. runs `cargo test --locked` on every platform it ships for;
   3. builds the native binaries with the frontend embedded, attests them
      (SLSA provenance) and attaches them to a GitHub Release whose notes
      are the changelog section;
   4. waits for approval in the `release` environment, then publishes the
      crate to crates.io via OIDC Trusted Publishing. The published package
      ships the prebuilt `frontend/dist` (see the `include` list in
      Cargo.toml), so `cargo install gitreant` needs no Node.js. Reject the
      approval to hold a release back from crates.io.

One-time setup, outside the repository:

- Create the `release` environment (Settings → Environments) with yourself
  as a required reviewer and a deployment rule admitting only `v*` tags.
- Register this repository, `release.yml` and the `release` environment as
  a Trusted Publisher for the `gitreant` crate on crates.io (Settings →
  Trusted Publishing). No registry token is stored anywhere.

The workflows pin actions to commit SHAs with the release in a trailing
comment; when updating one, take the SHA of the release's tag
(`gh api repos/OWNER/ACTION/commits/vX.Y.Z --jq .sha`) and update the
comment with it.

## Architecture decisions

Design decisions and their rationale are recorded as ADRs under
[adr/](adr/).
