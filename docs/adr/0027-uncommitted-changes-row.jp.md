# ADR 0027: 未コミットの変更はHEADの上に合成行として表示する

## Status

Accepted (2026-09-23)

## Context

作業ツリーの未コミット変更は、ドロワーの件数表示（dirty インジケータ）
でしか分からず、何を変えたか・差分はどうかをグラフから見る手段が
なかった（Issue #5）。GitKraken や vscode-git-graph は、作業ツリーを
「WIP」行として HEAD の上に置く。gitreant のグラフはレーン割当を
サーバ側で行う（ADR 0001 / 0020）ため、行をどこで合成するかが論点になる。

## Decision

- **合成はサーバのビュー構築時に行う。** `git status --porcelain` の
  件数が 1 以上で HEAD が存在するとき、id を `uncommitted`、親を HEAD
  とする合成コミットをレイアウト入力の先頭に挿入し、spine の起点にする。
  行は HEAD のレーンに乗り、HEAD へ直線で落ちる。HEAD が無い
  （unborn）リポジトリでは表示しない。
- **合成行はコミットではない。** `total` に数えず、ページング
  （ADR 0023）では上限に 1 を足して常に先頭に残す。行に作者・時刻・
  ハッシュは持たせず、ラベルと変更パス数だけを表示する。ノードは
  中抜きの破線リング、HEAD へのエッジは破線で、履歴と見分ける。
- **詳細と差分は既存 API に同じ id を渡す。** `/api/commit`・
  `/api/diff`・`/api/commit-diff` はサーバ側で id が `uncommitted` の
  ときだけ作業ツリー読み取りに分岐する。クライアントの選択・詳細・
  差分の流れは変えない。
- **読み取りは git CLI に委譲する**（ADR 0007 / 0014 のパターン）。
  一覧は `git status --porcelain -z --untracked-files=all --no-renames`、
  行数は `git diff HEAD --numstat`、追跡ファイルの差分は
  `git diff HEAD -- <path>`。改行変換や `.gitattributes` のフィルタを
  ユーザーの `git diff` と一致させるためで、gix で index と作業ツリーを
  突き合わせる実装は採らない。未追跡ファイルは比較対象が無いので
  ディスクから読み、空との unified 差分を自前で作る。いずれも
  `GIT_OPTIONAL_LOCKS=0` で index ロックを取らない。
- **比較対象は HEAD** とし、index と作業ツリーの変更を合算して見せる。
  staged / unstaged の区別は仕様として未規定（必要になれば
  `UncommittedPath` にフラグを足す）。
- 更新タイミングは他の表示と同じ（Reload ボタン・SSE）。ファイル監視は
  導入しない。

## Consequences

- ビュー読込のたびに `git status` が 1 回増える。ドロワーの dirty 件数は
  同じ関数（`uncommitted_paths`）で数え、合成行の件数と常に一致する。
  未追跡ディレクトリは中のファイル数で数え、リネームは削除＋追加の
  2 件になる。
- 差分ペインの新側パーマリンクは作業ツリーを指せないため無効。旧側
  （HEAD）は従来どおり。
- README スクリーンショットのシナリオは `dirty` ステップを含むので、
  次回の `pnpm screenshot` で画像に合成行が現れる（`commitCount` は
  `dirty` ステップを行として数えるよう更新済み）。
