# gitreant

[English](../README.md) | [日本語](README.jp.md)

Gitリポジトリの森を見渡し、整え、育てるための管理ツール。

Gitreant は「Git」と、森を守る樹人「Treant」を組み合わせた造語です。Gitリポジトリの森を見渡し、枝を整え、健全に保つツールという意味を込めています。

発音: /ˈɡɪt.triːənt/（git-ree-ant）。日本語読みは「ギトレント」（または「ギットレント」）。

ローカル git リポジトリのコミットグラフを、単一の SPA 上にまとめて表示する
Web アプリ。[k1LoW/mo](https://github.com/k1LoW/mo) の体験を参考に、Rust 単一
バイナリに React 製 SPA を埋め込んで配布する。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/screenshot-dark.png">
  <img alt="ローカルリポジトリのコミットグラフを表示する gitreant" src="images/screenshot-light.png">
</picture>

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

- レーンと色をサーバ側で計算するコミットグラフ描画。マージコミットの
  メッセージは薄色表示、ハッシュのクリックでフルIDをコピー。グラフの
  ノードにホバーするとハッシュを表示し、クリックでそのコミットを選択
- ブランチバッジの右クリックで名前のコピー・チェックアウト・現在
  ブランチへのマージ（サーバ側 `git switch` / `git merge`）。コミット行か
  グラフノードの右クリックでタグ作成、タグバッジから削除。タグ・stash・ブランチは
  バッジで見分けられ、squashマージの点線は設定で表示切替可能
- コミットをクリックするとフルメッセージ・署名状態（署名鍵ID付き、
  クリックでコピー）・変更ファイル（フラット/ツリー表示、行数増減付き）
  を表示。ファイル（または「Diff all」）をクリックすると diff を
  インライン/左右分割で表示、行内の変更箇所もハイライト。作者名から
  GitHubプロフィールへリンクし、メールアドレスと親コミットIDは
  クリックでコピー。ファイルの右クリックで相対パス/絶対パスをコピー
- diff の行番号ガターで行を選択（Shift+クリックで範囲）し、行の
  コピーや GitHub パーマリンクのコピーが可能
- 未コミットの変更は HEAD の上に破線の行として表示。開くと変更
  ファイルの一覧と HEAD との差分を見られる（サーバ側 `git status` /
  `git diff`）
- Fetchボタンで表示中の全リポジトリを `git fetch`（git コマンドが必要）。
  実行したコマンドとUI操作は下部ペインのログで確認できる
- 署名付きコミットにはグラフ上にバッジを表示。ローカルの gpg で検証
  できれば Verified / Unverified、できなければ Signed
- `gh` CLI がインストール・認証済みなら、ブランチバッジのGitHubマーク
  から open な Pull Request のページへリンク。squashマージ済みで残って
  いるブランチには、PRが載ったコミットへの破線リンクを描画
- 複数リポジトリを 1 つの SPA に表示: ドロワーで一覧・追加・削除、タブで切替
- `git worktree` の linked worktree はドロワーで元リポジトリの下に
  入れ子表示（チェックアウト中のブランチ付き）し、独立したビューとして
  開ける。他の worktree でチェックアウト中のブランチはバッジに印が付き、
  git が拒否するチェックアウトはメニューに出さない
- リポジトリ追加/削除時に Server-Sent Events でライブ更新、
  リロードボタンで新しいコミットを反映
- ネイティブのフォルダ選択ダイアログによるリポジトリ追加
- 既定でターミナルから切り離して起動、`--shutdown` で停止
- コマンドパレット（Ctrl+K / Cmd+K）でリポジトリ切替・fetch・reload・
  テーマ切替などをキーボードから実行
- dark/light テーマ切替と設定ダイアログ（UI言語の自動/英語/日本語
  切替、日時形式の ISO/ロケール/相対表示切替、アクションボタンの
  アイコン/アイコン＋ラベル/ラベル表示切替）
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
      --app           タブではなく枠なしウィンドウで開く（Chromium系が
                      必要。無ければ通常のブラウザで開く。--no-open が優先）
      --foreground    detachせず現在のターミナルでサーバを実行
      --shutdown      稼働中の gitreant サーバを停止して終了
```

## コントリビュート

開発環境の構築、アーキテクチャ、テストについては
[CONTRIBUTING.md](CONTRIBUTING.md) を参照。今後の予定は
[ROADMAP.jp.md](ROADMAP.jp.md) に。

## ライセンス

以下のいずれかを選択して利用できる（デュアルライセンス）。

- MIT License（[LICENSE-MIT](../LICENSE-MIT)）
- Apache License 2.0（[LICENSE-APACHE](../LICENSE-APACHE)）

`SPDX-License-Identifier: MIT OR Apache-2.0`

明示的な表明がない限り、Apache-2.0 ライセンスの定義に従い本プロジェクトへの
取り込みを意図して提出されたコントリビューションは、追加の条項なく上記の
デュアルライセンスが適用される。
