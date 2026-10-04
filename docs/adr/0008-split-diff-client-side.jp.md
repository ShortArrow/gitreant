# ADR 0008: 左右分割diffはunifiedテキストのクライアント側パースで実現する

## Status

Accepted (2026-07-10)

## Context

diffペインにインライン（unified）表示しかなく、左右分割（side-by-side）表示への切替が欲しい。ADR 0006 は「side-by-side はテキスト形式の外なので構造化レスポンスへの拡張が要る」と予想していたが、unified形式のhunk ヘッダは両側の行番号を含むため、実際には**表示に必要な情報はすべてテキスト内にある**。

## Decision

- `/api/diff` / `/api/commit-diff` のレスポンスは**unifiedテキストのまま**変えない。左右分割はフロントエンドの純関数 `parseUnified` (frontend/src/diffModel.ts) がテキストをパースして組み立てる。hunk内の削除行の連続と追加行の連続を行単位でペアにし、余りは反対側を空セルにする。行番号はhunkヘッダから両側で数える。
- 表示モード（Inline | Split）はdiffペインのトグルで切替え、localStorage に永続化する。
- 一括表示（コミットの全ファイルdiff）は `POST /api/commit-diff {repo, id}` を新設し、`FileDiff` の配列を返す。ファイル単位の `/api/diff` はクリック単位の軽い取得のためそのまま残す。

## Consequences

- APIが1形式で済み、インライン/分割どちらの表示もサーバ変更なしで進化できる。ADR 0006 の「構造化レスポンスが要る」という帰結予想は本ADRで更新される（decisionは変わらない）。
- 文字単位のワードdiffハイライトはunifiedテキストからは導けないため、必要になればそのときに構造化拡張を検討する。
- 一括表示は全ファイルのblob diffを1リクエストで計算するので、巨大コミットでは相応の時間がかかる（明示的な操作でのみ発火）。
