# ADR 0034: Ship Debian packages for the shared APT registry

## Status

Accepted (2026-10-20)

## Context

A Linux user installs gitreant from a release tarball or with
`cargo install`, and keeps that version until they replace it by hand.
`https://pkg.shortarrow.jp/apt` is the APT repository for ShortArrow's
tools ([ShortArrow/pkg ADR 0001](https://github.com/ShortArrow/pkg/blob/main/docs/adr/0001-package-registry.md)).
It builds no package itself. Each project builds its `.deb` files, tests
that they install, and attaches them to its GitHub Release with a
`SHA256SUMS` asset; the registry checks each package against that file and
indexes it where it is. What a package contains, its name and its
`Depends` are the project's to decide.

The registry checks every published version by installing it in
`debian:bookworm` (glibc 2.36) and `ubuntu:24.04`. gitreant up to 0.2.3 is
built on `ubuntu-latest` (24.04, glibc 2.39). `readelf -V` on the 0.2.3
executables shows that the x86_64 one needs `GLIBC_2.39` only weakly and
`GLIBC_2.34` outright, while the aarch64 one needs `GLIBC_2.39` outright.
The dynamic loader refuses to start an executable that needs a missing
glibc version outright, so the arm64 tarball does not start on bookworm,
Raspberry Pi OS bookworm included.

## Decision

- **The package.** `gitreant`, versioned as the release with Debian
  revision `1` (`0.3.0-1`), for `amd64` and `arm64`. It installs
  `/usr/bin/gitreant` and the licences under `/usr/share/doc/gitreant/`.
  `packaging/apt/build-deb.sh` builds it.
  - `Depends`: the libraries the executable names (`libc6`, `libgcc-s1`,
    `libwayland-client0`), `git`, which `gitreant doctor` reports as
    required, and the registry's `shortarrow-archive-keyring`, so the key
    that verifies the source stays installed while gitreant is.
  - The `libc6` floor is the highest glibc version the executable needs
    outright, read with `readelf` at build time
    (`packaging/apt/glibc-floor.sh`), not written by hand.
  - `Recommends: xdg-utils`, which opens the browser; `Suggests: gh,
    gnupg`, the tools `gitreant doctor` reports as optional.
  - A version containing `-` gets no package: it would sort after the final
    release in Debian's ordering. The release workflow takes the version
    from `Cargo.toml`, which never has one, so a prerelease tag builds and
    tests the package at the version `main` carries.
- **The Linux release executables are built on `ubuntu-22.04` and
  `ubuntu-22.04-arm`** (glibc 2.35), so neither needs a glibc newer than
  bookworm's.
- **The release workflow** builds the packages from the release
  executables, installs each with `apt` from a throwaway signed repository
  in `debian:bookworm`, `ubuntu:22.04` and `ubuntu:24.04`, and runs
  `gitreant --version` and `gitreant doctor` there
  (`packaging/apt/install-test.sh`). It attaches them to the GitHub Release
  with a `SHA256SUMS` listing every asset. CI does the same on every pull
  request with a debug build on the same images.

## Consequences

- Once the registry lists gitreant, `apt upgrade` delivers each stable
  release to Debian and Ubuntu machines. Until then, and whenever the
  registry lags, the packages are on the GitHub Release.
- A `.deb` downloaded from the Release page does not install on its own:
  `shortarrow-archive-keyring` exists only in the registry.
- The arm64 tarball starts on glibc 2.35 and later, bookworm included.
- GitHub will retire the Ubuntu 22.04 images. A build on a newer image can
  raise the `libc6` floor without anyone choosing it; the bookworm install
  test then fails, and the build has to move into a bookworm container.
- Every GitHub Release carries a `SHA256SUMS`.
