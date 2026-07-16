# Roadmap

[English](ROADMAP.md) | [日本語](ROADMAP.jp.md)

優先度順ではなく分野別。決定済みの設計は [adr/](adr/) を参照。

## フォージ対応（GitHub / GitLab / Codeberg …）

現状 GitHub 専用になっている機能を、リモート URL のホストから
フォージを判定する抽象に載せ替える。

- **対象機能**: パーマリンク形式（`blob/<commit>/<path>#L..`）、
  PR/MR バッジとリンク、squash マージの破線リンク
- **方式**: ADR 0007/0013 の CLI 委譲パターンを踏襲
  - GitHub: `gh`（実装済み）
  - GitLab: `glab`（MR = Merge Request）
  - Codeberg / Forgejo / Gitea: `fj` または REST API
- **縮退規則**: CLI 不在・未認証・対象外ホストでは静かに無効
  （現行の gh と同じ）
- リモート URL 正規化（`github_web_url`）をフォージ別のプロバイダに
  一般化するところから始める

## グラフ / UI

- **Blame** — diff 行選択メニューに項目追加（土台は実装済み）。
  バックエンドは gix blame か git CLI 委譲
- **stash の表示切替** — stash バッジと WIP コミットの表示 ON/OFF
  （コミット収集がサーバ側のためクエリパラメータ設計が必要。要否確認中）
- **コマンドパレット拡張** — ブランチ checkout などリポジトリ文脈の
  コマンドを追加

## タグ / ブランチ操作（ADR 0021 の残課題）

- annotated tag（メッセージ入力・注釈の表示）
- タグ / ブランチのリモート push・削除（送信系操作の方針決定が先）
- ブランチ削除・rename をバッジメニューへ

## その他

- コンフリクト時の解決支援 UI（ADR 0014 の将来項目）
- ~~リリースバイナリの配布~~ — 対応済み: タグ駆動の GitHub Releases ＋
  ビルド済みフロントエンド同梱での crates.io 公開
  （CONTRIBUTING.md の「Releasing」参照）。当面 v0.1.x 系
