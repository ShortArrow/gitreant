# ADR 0014: ブランチ操作はバッジの右クリックメニューから git CLI に委譲する

## Status

Accepted (2026-07-14)

## Context

グラフ上のブランチバッジから、ブランチ名のコピー・チェックアウト・現在ブランチへのマージを行いたい。checkout / merge は作業ツリーを変更する操作であり、hooks・ユーザー設定・コンフリクト処理は git 本体の挙動に合わせるべき。

## Decision

- バッジの `contextmenu` にカスタムメニューを出す。左クリックの挙動は変えない（誤操作防止）。項目は Copy branch name / Checkout / Merge into <現在のブランチ>。
- 変更系の2操作はメニュー内のインライン確認（Yes/Cancel）を挟んでから `POST /api/checkout` / `POST /api/merge` を呼ぶ。サーバは `git switch <branch>`（remote-tracking は `switch --detach`）と `git merge --no-edit <ref>` に委譲する（ADR 0007 のパターン）。
- 実行コマンドはコマンドログ（ADR 0009）に記録し、完了時に SSE で全クライアントへ更新を通知する。git の失敗（コンフリクト等）は HTTP 200 + `ok:false` で返し、stderr をそのまま UI に表示する。コンフリクトの解決自体はユーザーのターミナルに委ねる。
- マージメッセージは `--no-edit` の既定文言。サーバにはエディタをホストする端末がない。

## Consequences

- ブランチの切替とマージが UI から1〜2クリックで行える。
- コンフリクト時はエラー表示のみで、リポジトリはコンフリクト状態のまま残る（git と同じ）。UI 上での解決支援は将来の別 ADR。
- ブランチ作成・削除・rename は未対応。必要になったら同じメニューに追加する。
