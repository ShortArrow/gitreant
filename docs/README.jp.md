# gitreant

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/ShortArrow/gitreant)
[![Crates.io Version](https://img.shields.io/crates/v/gitreant)](https://crates.io/crates/gitreant)
![WinGet Package Version](https://img.shields.io/winget/v/ShortArrow.gitreant)

[English](../README.md) | [日本語](README.jp.md)

<p align="center">
  <img src="../frontend/public/icon.svg" width="256" alt="gitreant のトレント: 二枚の葉の下、幹に顔">
</p>

Gitリポジトリの森を見渡し、整え、育てるための管理ツール。

Gitreant は「Git」と、森を守る樹人「Treant」を組み合わせた造語。Gitリポジトリの森を見渡し、枝を整え、健全に保つツールという意味を込めている。

発音: /ˈɡɪt.triːənt/（git-ree-ant）。日本語読みは「ギトレント」（または「ギットレント」）。

ローカル git リポジトリのコミットグラフを、単一の SPA 上にまとめて表示する Web アプリ。[k1LoW/mo](https://github.com/k1LoW/mo) の体験を参考に、Rust 単一バイナリに React 製 SPA を埋め込んで配布する。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/screenshot-dark.png">
  <img alt="ローカルリポジトリのコミットグラフを表示する gitreant" src="images/screenshot-light.png">
</picture>

```console
$ gitreant                 # カレントの .git を探して表示
$ gitreant ../foo ../bar   # 複数リポジトリをまとめて表示
```

別ディレクトリで `gitreant` を再実行すると、既に起動しているサーバへリポジトリが追加され、同じ画面に並んで表示される（mo と同様の単一インスタンス動作）。

起動すると既定でターミナルから切り離され（detach）、サーバはバックグラウンドで動き続けたままシェルに制御が戻る。停止は `gitreant --shutdown`、前面で動かしたい場合は `--foreground` を指定する。

## 機能

- 複数のローカルリポジトリのコミットグラフを 1 画面に表示（タブと、左右 2 つのペイン）
- コミットの詳細と差分: メッセージ全文、署名の状態、変更ファイル、インライン／左右分割の差分と行内の強調
- 作業中の状態が見える: HEAD の上に未コミットの変更、linked worktree、改行コードだけの変更の明示
- グラフから fetch・チェックアウト・マージ・ブランチの作成・タグの作成と削除（どれも git コマンドに委ねる）
- `gh` によるプルリクエストへのリンクと、`gpg` による署名の検証（どちらも任意）
- 単一の自己完結バイナリ、コマンドパレット、ダーク／ライトのテーマ、英語と日本語の UI

すべての機能の詳細は [FEATURES.jp.md](FEATURES.jp.md) にまとめてある。

## インストール / ビルド

要件: Rust (stable), Node.js + pnpm。

```console
$ make build     # frontend をビルドして release バイナリに埋め込む
$ ./target/release/gitreant
```

## オプション

```
gitreant [PATH...]
  -p, --port <PORT>   待受/接続ポート（既定 4000）
      --no-open       ブラウザを自動で開かない
      --app           タブではなく枠なしウィンドウで開く（Chromium系が
                      必要。無ければ通常のブラウザで開く。--no-open が優先）
      --foreground    detachせず現在のターミナルでサーバを実行
      --shutdown      稼働中の gitreant サーバを停止して終了
```

## コントリビュート

開発環境の構築、アーキテクチャ、テストについては [CONTRIBUTING.md](CONTRIBUTING.md) を参照。今後の予定は [ROADMAP.jp.md](ROADMAP.jp.md) に。

## ライセンス

以下のいずれかを選択して利用できる（デュアルライセンス）。

- MIT License（[LICENSE-MIT](../LICENSE-MIT)）
- Apache License 2.0（[LICENSE-APACHE](../LICENSE-APACHE)）

`SPDX-License-Identifier: MIT OR Apache-2.0`

明示的な表明がない限り、Apache-2.0 ライセンスの定義に従い本プロジェクトへの取り込みを意図して提出されたコントリビューションは、追加の条項なく上記のデュアルライセンスが適用される。
