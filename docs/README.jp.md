# gitreant

[English](../README.md) | [日本語](README.jp.md)

ローカル git リポジトリのコミットグラフを、単一の SPA 上にまとめて表示する
Web アプリ。[k1LoW/mo](https://github.com/k1LoW/mo) の体験を参考に、Rust 単一
バイナリに React 製 SPA を埋め込んで配布する。

```console
$ gitreant                 # カレントの .git を探して表示
$ gitreant ../foo ../bar   # 複数リポジトリをまとめて表示
```

別ディレクトリで `gitreant` を再実行すると、既に起動しているサーバへ
リポジトリが追加され、同じ画面に並んで表示される（mo と同様の単一インスタンス動作）。

起動すると既定でターミナルから切り離され（detach）、サーバはバックグラウンドで
動き続けたままシェルに制御が戻る。停止は `gitreant --shutdown`、前面で
動かしたい場合は `--foreground` を指定する。

## 機能

- レーンと色をサーバ側で計算するコミットグラフ描画
- 複数リポジトリを 1 つの SPA に表示: ドロワーで一覧・追加・削除、タブで切替
- リポジトリ追加/削除時に Server-Sent Events でライブ更新
- ネイティブのフォルダ選択ダイアログによるリポジトリ追加
- 既定でターミナルから切り離して起動、`--shutdown` で停止
- dark/light テーマ切替
- 単一の自己完結バイナリ — ランタイム依存なし

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
      --foreground    detachせず現在のターミナルでサーバを実行
      --shutdown      稼働中の gitreant サーバを停止して終了
```

## コントリビュート

開発環境の構築、アーキテクチャ、テストについては
[CONTRIBUTING.md](CONTRIBUTING.md) を参照。

## ライセンス

以下のいずれかを選択して利用できる（デュアルライセンス）。

- MIT License（[LICENSE-MIT](../LICENSE-MIT)）
- Apache License 2.0（[LICENSE-APACHE](../LICENSE-APACHE)）

`SPDX-License-Identifier: MIT OR Apache-2.0`

明示的な表明がない限り、Apache-2.0 ライセンスの定義に従い本プロジェクトへの
取り込みを意図して提出されたコントリビューションは、追加の条項なく上記の
デュアルライセンスが適用される。
