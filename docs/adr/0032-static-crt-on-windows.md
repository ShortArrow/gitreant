# ADR 0032: Link the C runtime statically on Windows

## Status

Accepted (2026-10-09)

## Context

Rust's MSVC targets link the C runtime (CRT) dynamically by default, so
`gitreant.exe` up to 0.2.2 depended on `VCRUNTIME140.dll` and the UCRT
(`api-ms-win-crt-*`). On a Windows without the Visual C++ Redistributable,
it fails with exit code 0xC0000135 (a DLL was not found) and prints
nothing, even for `gitreant --version`. This was reproduced on a clean
Windows 11.

gitreant ships as a zip that is unpacked and run as is (GitHub Release,
WinGet portable), so no installer brings the Redistributable along. The
WinGet submissions of 0.2.1 and 0.2.2 were both flagged
`Validation-Executable-Error`, though whether the validation environment
has the Redistributable is not published.

No crate brings C/C++ code into the Windows build (`windows-sys` is only
API type definitions, and the crates that use `cc` are not built for
Windows), so linking the CRT statically causes no conflicts.

## Decision

- **`.cargo/config.toml` sets `-C target-feature=+crt-static` for
  `x86_64-pc-windows-msvc` and `aarch64-pc-windows-msvc`.** The setting is
  per target, so it applies both to a native build and to the release
  workflow's `--target` builds.
- **A test checks that the executable does not load the Visual C++
  runtime** (`tests/windows_runtime.rs`). CI runs it on both x64 and arm64
  Windows.

## Consequences

- `gitreant.exe` starts with only the DLLs Windows ships with. The x64
  executable grew by about 125 KB.
- Setting the `RUSTFLAGS` environment variable makes Cargo ignore the
  `rustflags` in `.cargo/config.toml`, so the build is not static; the test
  then fails and says so.
- The crates.io package does not include `.cargo/config.toml`, so an
  executable built with `cargo install gitreant` stays dynamically linked.
  An environment that runs `cargo install` has the MSVC toolchain, and
  usually the runtime too. For the same reason, `cargo test` run from the
  crates.io package fails `tests/windows_runtime.rs`.
