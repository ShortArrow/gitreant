# gitreant

[English](README.md) | [日本語](docs/README.jp.md)

A web app that shows commit graphs of local git repositories side by side in a
single-page app. Inspired by [k1LoW/mo](https://github.com/k1LoW/mo), it ships
as a single Rust binary with an embedded React SPA.

```console
$ gitreant                 # discover .git from the current directory
$ gitreant ../foo ../bar   # show multiple repositories at once
```

Running `gitreant` again from another directory adds that repository to the
already-running server, so everything appears on the same page
(single-instance behavior, like mo).

The launcher detaches by default: the server keeps running in the background
and control returns to your shell. Stop it with `gitreant --shutdown`, or use
`--foreground` to keep the server attached to the terminal.

## Features

- Commit graph rendering with lanes and colors computed server-side
- Multiple repositories in one SPA: a drawer to list/add/remove, tabs to switch
- Live updates via Server-Sent Events when repositories are added or removed
- Native folder picker for adding repositories
- Detaches from the terminal by default; `--shutdown` stops the server
- Dark/light theme toggle
- Single self-contained binary — no runtime dependencies

## Install / Build

Requirements: Rust (stable), Node.js + pnpm.

```console
$ make build     # build the frontend and embed it into a release binary
$ ./target/release/gitreant
```

## Options

```
gitreant [PATH...]
  -p, --port <PORT>   port to listen on / connect to (default 4000)
      --no-open       do not open the browser automatically
      --foreground    run the server in the current terminal instead of detaching
      --shutdown      stop the running gitreant server and exit
```

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for development setup,
architecture, and testing.

## License

Licensed under either of the following, at your option:

- MIT License ([LICENSE-MIT](LICENSE-MIT))
- Apache License 2.0 ([LICENSE-APACHE](LICENSE-APACHE))

`SPDX-License-Identifier: MIT OR Apache-2.0`

Unless you explicitly state otherwise, any contribution intentionally
submitted for inclusion in this work by you, as defined in the Apache-2.0
license, shall be dual licensed as above, without any additional terms or
conditions.
