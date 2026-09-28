# ADR 0021: タグ操作もgit CLI委譲で行い、コミット行とバッジのメニューに載せる

## Status

Accepted (2026-07-15)

## Context

タグはブランチと区別して表示されるようになった（kind付きref）。次はタグの作成・削除を UI から行いたい。方式はブランチ操作（ADR 0014）と同じでよい。

## Decision

- **作成**: コミット行の右クリックで名前入力付きメニューを出し、 `POST /api/tag` → `git tag <name> <commit>`（lightweight）。 annotated tag はメッセージ入力 UI が必要になるため対象外（必要になれば拡張）。
- **削除**: タグバッジの右クリックメニュー（名前コピー / 削除）から確認付きで `DELETE /api/tag` → `git tag -d <name>`。ローカル削除のみでリモートへの push/削除は行わない（fetch 以外の送信操作は未導入の方針）。
- 実行コマンドはコマンドログに記録し、完了は SSE で全クライアントへ反映。失敗は stderr をそのまま UI に表示。

## Consequences

- タグの付け替え（強制上書き）は削除→作成の2操作。`-f` は出さない。
- stash と "other" 種別の ref には操作メニューを出さない。
