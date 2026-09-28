# ADR 0011: 署名検証は git/gpg CLI に委譲し、結果をコミットIDでキャッシュする

## Status

Accepted (2026-07-13)

## Context

コミットグラフには署名の**存在**だけをバッジ表示していたが（gix の gpgsig ヘッダ検出）、GitHub の Verified バッジのように署名が**正当か**も見たい。署名の正当性はユーザーの keyring（gpg / allowed signers）に依存するため、gitreant 自身で暗号検証を実装するのは責務過剰かつ環境再現が困難。

## Decision

- 検証は `git -c log.showsignature=false log --no-walk=unsorted --format=%H %G? <ids...>` の1回の実行に委譲する（ADR 0007 と同じ CLI 委譲パターン）。`gpg` が PATH に無ければ何も実行しない。
- `%G?` の解釈: `G`/`U` → **Verified**、`B`/`X`/`Y`/`R` → **Unverified**、 `E`/`N`/その他 → 判定なし（**Signed** のまま）。未検証を Unverified と表示しない — 鍵が無いことと署名が不正なことは区別する。
- 対象は署名付き（gix 検出）かつ未判定のコミットのみ。コミットは不変なので判定は `Session` 内の `HashMap<commit-id, status>` に永続キャッシュする（keyring 変更の反映はサーバ再起動）。検証の失敗も「判定なし」としてキャッシュし、壊れた gpg 環境で読み取りのたびに再実行・再ログしない。
- 実行したコマンドは `Session::views` が `ExecutedCommand` として返し、サーバがコマンドログ（ADR 0009）へ記録する。層の依存方向は server → app → git のまま。

## Consequences

- gpg と署名者の公開鍵がある環境では GitHub と同じ Verified / Unverified が出る。無い環境では従来どおり Signed 表示に留まる。
- 検証は署名付きコミットの初見時に1プロセス起動するだけで、リポジトリ読み取りのホットパス（gix）には影響しない。
- GitHub API（gh）による検証は適用範囲が狭くレート制限もあるため採用しない。必要になれば別 ADR で追加する。
