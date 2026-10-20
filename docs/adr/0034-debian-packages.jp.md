# ADR 0034: 共有の APT リポジトリ向けに Debian パッケージを配る

## Status

Accepted (2026-10-20)

## Context

Linux のユーザーは gitreant をリリースの tar.gz か `cargo install` で入れ、手で入れ替えるまでその版を使い続ける。`https://pkg.shortarrow.jp/apt` は ShortArrow のツールを配る APT リポジトリである（[ShortArrow/pkg ADR 0001](https://github.com/ShortArrow/pkg/blob/main/docs/adr/0001-package-registry.md)）。リポジトリ自身はパッケージをビルドしない。各プロジェクトが `.deb` をビルドし、インストールできることを確かめ、`SHA256SUMS` と一緒に自分の GitHub Release に添付する。リポジトリは各パッケージをその `SHA256SUMS` で照合し、置かれた場所のまま索引に載せる。パッケージの中身、名前、`Depends` はプロジェクトが決める。

リポジトリは公開した版ごとに、`debian:bookworm`（glibc 2.36）と `ubuntu:24.04` にインストールして確かめる。0.2.3 までの gitreant は `ubuntu-latest`（24.04、glibc 2.39）でビルドしている。0.2.3 の実行ファイルを `readelf -V` で見ると、x86_64 版は `GLIBC_2.39` を弱い参照でだけ、`GLIBC_2.34` を必須として要求する。一方 aarch64 版は `GLIBC_2.39` を必須として要求する。動的ローダーは、必須として要求された glibc のバージョンが無い実行ファイルを起動しない。そのため arm64 の tar.gz は、Raspberry Pi OS の bookworm も含め、bookworm では起動しない。

## Decision

- **パッケージ。** 名前は `gitreant`、バージョンはリリースの版に Debian リビジョン `1` を付けたもの（`0.3.0-1`）で、`amd64` と `arm64` を作る。`/usr/bin/gitreant` と、`/usr/share/doc/gitreant/` 以下のライセンスを入れる。ビルドは `packaging/apt/build-deb.sh` が行う。
  - `Depends`：実行ファイルが名指しするライブラリ（`libc6`、`libgcc-s1`、`libwayland-client0`）、`gitreant doctor` が必須とする `git`、リポジトリの `shortarrow-archive-keyring`。最後の 1 つは、gitreant が入っている間、ソースを検証する鍵を残しておくためのもの。
  - `libc6` の下限は、実行ファイルが必須として要求する glibc のバージョンのうち最も高いもの。手で書かず、ビルド時に `readelf` で読み取る（`packaging/apt/glibc-floor.sh`）。
  - `Recommends: xdg-utils`（ブラウザを開く）。`Suggests: gh, gnupg`（`gitreant doctor` が任意とするツール）。
  - プレリリースのタグでは、接尾辞を `~` の後ろに付けた版でパッケージを作る（`v0.3.0-rc.1` なら `0.3.0~rc.1-1`。`packaging/apt/deb-version.sh` が決める）。`-` を使うと Debian の順序で正式版より後ろに並ぶ。`Cargo.toml` の版だけを使うと、rc と正式版が中身の違う同じ版になり、rc を入れたマシンを apt が正式版に上げない。`Cargo.toml` と違う版を名指すタグにはパッケージを作らない。ファイル名では `~` を `.` に置き換える（`gitreant_0.3.0.rc.1-1_amd64.deb`）。GitHub がリリースのアセット名をそう変えるので、`SHA256SUMS` にはリリースが実際に配る名前を載せる必要がある。
- **Linux 版のリリース用実行ファイルは `ubuntu-22.04` と `ubuntu-22.04-arm`（glibc 2.35）でビルドする。** これでどちらも bookworm より新しい glibc を要求しない。
- **リリースのワークフロー**は、リリース用の実行ファイルからパッケージをビルドする。それぞれを使い捨ての署名付きリポジトリから `debian:bookworm`、`ubuntu:22.04`、`ubuntu:24.04` に `apt` でインストールし、`gitreant --version` と `gitreant doctor` を実行する（`packaging/apt/install-test.sh`）。パッケージは、全アセットを載せた `SHA256SUMS` と一緒に GitHub Release に添付する。CI もプルリクエストごとに、同じイメージ上のデバッグビルドで同じことを行う。
- **インストールテストは、リポジトリを読むことしかできないジョブで実行する。** パッケージは artifact としてリリースを作るジョブに渡る。リリースに書き込めるそのジョブでは、テストも、ほかのリポジトリのコードも実行しない。テストを ShortArrow/pkg の action に移しても、この形は変えない。

## Consequences

- リポジトリが gitreant を載せれば、安定版のリリースは `apt upgrade` で Debian と Ubuntu に届く。載るまでの間や、リポジトリの反映が遅れたときも、パッケージは GitHub Release にある。
- Release のページからダウンロードした `.deb` は、単独ではインストールできない。`shortarrow-archive-keyring` はリポジトリにしか無いため。
- arm64 の tar.gz は、bookworm を含む glibc 2.35 以降で起動する。
- GitHub はいずれ Ubuntu 22.04 のイメージを廃止する。新しいイメージでビルドすると、誰も選ばないまま `libc6` の下限が上がりうる。そのときは bookworm でのインストールテストが失敗するので、ビルドを bookworm のコンテナに移す。
- GitHub Release には毎回 `SHA256SUMS` が付く。
