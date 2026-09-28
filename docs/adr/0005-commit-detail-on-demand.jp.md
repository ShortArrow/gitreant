# ADR 0005: コミット詳細はオンデマンドで取得する

## Status

Accepted (2026-07-10)

## Context

コミット行をクリックしたとき、フルメッセージ（description）と変更内容を表示したい。変更内容の取得には親コミットとのtree diffと、ファイルごとの blob diff（行数カウント）が必要で、リポジトリの全コミットについて事前計算すると `/api/repos` が重くなる（表示に使わないdiffがほとんど）。

## Decision

- コミット詳細は **`POST /api/commit` でオンデマンド取得**する。 `/api/repos` のグラフ用データ（summary/author/time）は従来のまま。
- リクエストは `{ "repo": "<repo id>", "id": "<commit id>" }` の JSON ボディ。 repo id は正規化パス（Windowsではバックスラッシュを含む）なので、 URLエンコードの罠を避けて既存の `DELETE /api/repos` と同じ JSONボディ方式に揃える。GETのキャッシュ性は失うが、ローカルツールでは問題にならない。
- diff は **第1親との比較**（rootは空tree、マージコミットも第1親のみ）。 `git show` / 他のグラフツールと同じ既定。
- レスポンスはファイル単位の変更（status A/M/D/R + 追加/削除行数）まで。パッチ本文（hunk）は返さない。ファイル内diff表示が必要になったら別エンドポイントで追加する。
- 実装は `git::read_commit`（gixのtree diff + blob diffの行数カウント）に閉じ、`app` 層の `CommitDetailView` でシリアライズ境界を保つ。

## Consequences

- 詳細はクリック時に1コミット分だけ読むため、リポジトリ規模にかかわらず一覧表示のコストは変わらない。
- 選択のたびにHTTPリクエストが発生するが、ローカルでのtree diffは十分速い。必要ならフロントエンドでのキャッシュを後付けできる。
- マージコミットの「第2親との差分」（マージで取り込まれた内容そのもの）は見えない。必要になったら parent index をリクエストに足す。
