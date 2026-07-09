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
- **server**: REST (`/api/repos`) and SSE (`/api/events`), SPA serving via
  `rust-embed`, single-instance detection (`/api/ping` + `POST /api/repos`).
- **frontend**: receives lane-precomputed JSON and draws the graph with
  hand-rolled SVG.

## API

| Method | Path           | Description                                           |
| ------ | -------------- | ----------------------------------------------------- |
| GET    | `/api/ping`    | Liveness marker (single-instance detection)           |
| GET    | `/api/repos`   | Graph JSON of the displayed repositories              |
| POST   | `/api/repos`   | Add `{ "path": "..." }` to the session                |
| DELETE | `/api/repos`   | Remove `{ "path": "<id>" }` from the session          |
| POST   | `/api/pick`    | Open a native folder picker on the server machine     |
| GET    | `/api/events`  | SSE; emits `update` when repositories are added/removed |

## Tests

```console
$ cargo test                    # Rust: domain / git / server
$ cd frontend && pnpm test:e2e  # Playwright E2E (generates fixtures, starts server)
```

- `domain`: unit tests for lane assignment (empty, linear, branch/merge,
  freed-lane reuse).
- `git`: characterization tests against generated real repositories.
- `server`: ping / add / remove / dedup / 404 fallback over a real socket.
- `e2e` (Playwright): drawer listing, tab open/close, graph rendering
  (nodes/lanes), and repository add/remove in a real browser. Fixture
  repository generation and server startup are handled by
  `frontend/e2e/global-setup.ts`.

## CI

`.github/workflows/ci.yml` runs:

- **rust**: `cargo build` + `cargo test` on Linux / macOS / Windows
- **web**: frontend `pnpm build` (includes type check) and `pnpm build-storybook`
- **e2e**: Playwright E2E on Ubuntu

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

## Architecture decisions

Design decisions and their rationale are recorded as ADRs under
[adr/](adr/).
