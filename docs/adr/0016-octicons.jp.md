# ADR 0016: アイコンは Octicons（@primer/octicons-react）を採用する

## Status

Accepted (2026-07-14) — ADR 0015 の「アイコンは自前 SVG」の項を supersede する。

## Context

ADR 0015 では依存を増やさない自前 SVG でアイコンを始めたが、対象ボタンがトップバー・ドロワー・テーマ切替まで広がり、自前で品質と一貫性を保つコストが利益を上回った。gitreant の UI は GitHub の見た目に意図的に寄せている（Verified バッジ・行選択ドロップダウン・permalink 等）。

## Decision

- GitHub 公式の **Octicons**（`@primer/octicons-react`, MIT）を採用する。 git ドメインの語彙（diff・rows/columns・file-directory 等）が揃い、 16px 最適化で小さなボタンに馴染む。
- インポートは `Icons.tsx` に集約し、アプリ側はドメイン名（`FetchIcon`・`TreeIcon` 等）だけを使う。セットの差し替えはこのファイル1枚で済む。
- すべてのアクションボタンは `LabeledButton` を通り、ADR 0015 の icon / icon+label / label 設定に追従する。

## Consequences

- 依存が1つ増える（per-icon インポートでバンドル増は小さい）。
- Octicons に無い語彙が必要になったら、まず近い意味の既存アイコンを検討し、無ければ `Icons.tsx` 内の自前 SVG で補う。
