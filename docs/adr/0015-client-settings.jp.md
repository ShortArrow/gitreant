# ADR 0015: クライアント設定は localStorage に保存し、まずボタン表示形式を提供する

## Status

Accepted (2026-07-14)

## Context

アクションボタン（Inline/Split/Flat/Tree/Diff all/Add）にアイコンを割り当てるにあたり、アイコンのみ・アイコン＋ラベル・ラベルのみをユーザーが選べるようにしたい。今後も表示設定が増える見込みがあり、設定 UI の置き場所が必要。

## Decision

- トップバーの ⚙ ボタンで設定パネルをトグルする。設定は**クライアント側の localStorage** に保存する（テーマ・ペイン幅・ diff 表示形式と同じ扱い）。サーバは関与しない。
- ボタン表示は `icon` / `icon-label`（既定）/ `label` の3値。どの形式でもラベルは `title` / `aria-label` として残り、ツールチップと支援技術には常に見える。
- 対象ボタンは共通の `LabeledButton` を通し、設定は React Context で配る。アイコンは依存を増やさず 14x14 の自前 SVG（`Icons.tsx`）。

## Consequences

- 設定はブラウザ（origin）ごと。複数マシン間の同期はしない。必要になればサーバ保存を別 ADR で検討する。
- 新しいボタンは `LabeledButton` を使えば自動的に設定へ追従する。
