# Roadmap

[English](ROADMAP.md) | [日本語](ROADMAP.jp.md)

次の 2 版は主題を決めて進める。それ以降の項目は分野別に並べ、優先度順ではない。決定済みの設計は [adr/](adr/) を参照。

## 0.2.0 — 作業中の状態が見える（リリース準備中）

コミット済みの履歴だけでなく、手元で進行中の作業までを 1 画面で見渡せるようにする版。

- **未コミットの変更を HEAD の上に行として表示**（[ADR 0027](adr/0027-uncommitted-changes-row.jp.md)）
- **git worktree への対応**（[ADR 0028](adr/0028-worktrees.jp.md)）
- `--app` による専用ウィンドウ（[ADR 0026](adr/0026-app-mode-window.jp.md)）
- アイコンの採用（favicon、Windows の実行ファイル、README）
- Windows on ARM、Raspberry Pi、Termux 向けのビルド
- グラフのノードに右クリックメニューとハッシュ表示（0.3.0 の土台）
- コミット詳細のメタデータのコピーと日時形式の設定（[ADR 0025](adr/0025-timestamp-rendering.jp.md)）

リリース前に [QUALITY.jp.md](QUALITY.jp.md) のリリースゲート（E2E フル実行と `pnpm screenshot` のアサーション）を通す。

## 0.3.0 — グラフのノード機能を広げる

0.2.0 で入れたノードの操作（`RepoCard.tsx` の `nodeProps` と、行と共用の `CommitMenu`）を土台に、ノードからできることを増やす。

- **読み取りだけで済むもの**
  - ホバーしたノードの系譜（first-parent の連なり）をハイライトする
  - 2 つのノードを選び、その間の差分を表示する（既存の差分ペインを流用）
  - メニューから親コミット・子コミットへ移動する
  - キーボードでノード間を移動し、選択する
- **既存の操作方針（ADR 0014/0021）の範囲**
  - メニューから「このコミットを detached でチェックアウト」
- **リポジトリに書き込む新しい操作**（QUALITY.jp.md の改訂と ADR が先に要る）
  - cherry-pick、revert、このコミットまで reset

どれを 0.3.0 に入れるかは、着手時に UI の振る舞い（選択と解除の仕方、ペインとの関係）を決めてから絞る。

## フォージ対応（GitHub / GitLab / Codeberg …）

現状 GitHub 専用になっている機能を、リモート URL のホストからフォージを判定する抽象に載せ替える。

- **対象機能**: パーマリンク形式（`blob/<commit>/<path>#L..`）、PR/MR バッジとリンク、squash マージの破線リンク
- **方式**: ADR 0007/0013 の CLI 委譲パターンを踏襲
  - GitHub: `gh`（実装済み）
  - GitLab: `glab`（MR = Merge Request）
  - Codeberg / Forgejo / Gitea: `fj` または REST API
- **縮退規則**: CLI 不在・未認証・対象外ホストでは静かに無効（現行の gh と同じ）
- リモート URL 正規化（`github_web_url`）をフォージ別のプロバイダに一般化するところから始める

## 作業ツリー（ADR 0027 / 0028 の残課題）

- **未コミット行で staged と unstaged を分ける** — 現状は HEAD との比較で合算して見せている
- **未コミット行からの stage・commit・discard** — 書き込み操作なので QUALITY.jp.md の改訂と ADR が先
- **worktree の作成・削除** — 同上
- **入れ子の worktree をドロワーのフィルタで見つけられるようにする** — 現状はトップレベル行だけが対象
- **切断されたネットワークドライブ上の worktree で一覧が待たされない** — 存在確認をタイムアウト付きにするか、一覧から外して遅延させる

## グラフ / UI

- **Blame** — diff 行選択メニューに項目追加（土台は実装済み）。バックエンドは gix blame か git CLI 委譲
- **stash 全体の表示切替** — stash バッジと stash のコミットそのものを隠す。内部構造（index・未追跡ファイルのコミット）の表示切替は実装済み。全体を隠すにはコミット収集がサーバ側のためクエリパラメータの設計が要る（要否確認中）

## タグ / ブランチ操作（ADR 0021 の残課題）

- annotated tag（メッセージ入力・注釈の表示）
- タグ / ブランチのリモート push・削除（送信系操作の方針決定が先）
- ブランチ削除・rename をバッジメニューへ

## その他

- コンフリクト時の解決支援 UI（ADR 0014 の将来項目）
- **git 実行ヘルパーの整理** — `git -C <path>` を起動する関数が `branch.rs` の `run`、`status.rs` の `run`、`uncommitted.rs` の `output` の 3 つに分かれており、違いはロックの扱いとエラーの返し方だけ
