# ADR 0032: Windows 版は C ランタイムを静的リンクする

## Status

Accepted (2026-10-09)

## Context

Rust の MSVC ターゲットは、既定で C ランタイム（CRT）を動的リンクする。そのため 0.2.2 までの `gitreant.exe` は、`VCRUNTIME140.dll` と UCRT（`api-ms-win-crt-*`）に依存していた。Visual C++ 再頒布可能パッケージが入っていない Windows では、`gitreant --version` も含めて、何も出力せずに終了コード 0xC0000135（DLL が見つからない）で失敗する。これはクリーンな Windows 11 で再現できた。

gitreant は zip を展開してそのまま実行する配布（GitHub Release、WinGet の portable）なので、インストーラが再頒布可能パッケージを入れてくれることはない。WinGet への 0.2.1 と 0.2.2 の提出には、どちらも `Validation-Executable-Error` が付いた。ただし、検証環境に再頒布可能パッケージがあるかどうかは公開されていない。

Windows 版のビルドに C/C++ のコードを持ち込むクレートは無い（`windows-sys` は API の型定義だけで、`cc` を使うクレートは Windows ではビルドされない）ので、CRT を静的リンクしても衝突しない。

## Decision

- **`.cargo/config.toml` で、`x86_64-pc-windows-msvc` と `aarch64-pc-windows-msvc` に `-C target-feature=+crt-static` を指定する。** ターゲット別の設定なので、手元のネイティブビルドにも、リリースのワークフローの `--target` 付きビルドにも効く。
- **exe が Visual C++ のランタイムを読み込まないことをテストで確かめる**（`tests/windows_runtime.rs`）。CI は Windows の x64 と arm64 の両方でこのテストを実行する。

## Consequences

- `gitreant.exe` は、OS に標準で入っている DLL だけで起動する。x64 の exe は約 125 KB 大きくなった。
- `RUSTFLAGS` 環境変数を設定すると `.cargo/config.toml` の `rustflags` は無視されるので、静的リンクにならない。そのときはテストが失敗して気づける。
- crates.io のパッケージには `.cargo/config.toml` を含めないので、`cargo install gitreant` でビルドした exe は従来どおり動的リンクになる。`cargo install` を使う環境には MSVC のツールチェーンがあり、ランタイムもたいてい入っている。同じ理由で、crates.io のパッケージから `cargo test` を実行すると `tests/windows_runtime.rs` は失敗する。
