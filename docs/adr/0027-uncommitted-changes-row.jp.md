# ADR 0027: 未コミットの変更はHEADの上に合成行として表示する

## Status

Accepted (2026-09-23)

## Context

作業ツリーの未コミット変更は、ドロワーの件数表示（dirty インジケータ）でしか分からず、何を変えたか・差分はどうかをグラフから見る手段がなかった（Issue #5）。GitKraken や vscode-git-graph は、作業ツリーを「WIP」行として HEAD の上に置く。gitreant のグラフはレーン割当をサーバ側で行う（ADR 0001 / 0020）ため、行をどこで合成するかが論点になる。

## Decision

- **合成はサーバのビュー構築時に行う。** `git status --porcelain` の件数が 1 以上で HEAD が存在するとき、id を `uncommitted`、親を HEAD とする合成コミットをレイアウト入力の先頭に挿入し、spine の起点にする。行は HEAD のレーンに乗り、HEAD へ直線で落ちる。HEAD が無い（unborn）リポジトリでは表示しない。
- **合成行はコミットではない。** `total` に数えず、ページング（ADR 0023）では上限に 1 を足して常に先頭に残す。行に作者・時刻・ハッシュは持たせず、ラベルと変更パス数だけを表示する。ノードは中抜きの破線リング、HEAD へのエッジは破線で、履歴と見分ける。
- **詳細と差分は既存 API に同じ id を渡す。** `/api/commit`・`/api/diff`・`/api/commit-diff` はサーバ側で id が `uncommitted` のときだけ作業ツリー読み取りに分岐する。クライアントの選択・詳細・差分の流れは変えない。
- **読み取りは git CLI に委譲する**（ADR 0007 / 0014 のパターン）。一覧は `git status --porcelain -z --no-renames`（未追跡ファイルの粒度はユーザーの `status.showUntrackedFiles` に従う）、行数は `git diff HEAD --numstat`、追跡ファイルの差分は `git diff HEAD -- <path>`。改行変換や `.gitattributes` のフィルタをユーザーの `git diff` と一致させるためで、gix で index と作業ツリーを突き合わせる実装は採らない。未追跡ファイルは比較対象が無いのでディスクから読み、空との unified 差分を自前で作る。いずれも `GIT_OPTIONAL_LOCKS=0` で index ロックを取らない。
- **比較対象は HEAD** とし、index と作業ツリーの変更を合算して見せる。staged / unstaged の区別は仕様として未規定（必要になれば `UncommittedPath` にフラグを足す）。
- 更新タイミングは他の表示と同じ（Reload ボタン・SSE）。ファイル監視は導入しない。

## Consequences

- `git status` はビュー読込で 1 回、ドロワーの `/api/status` で 1 回走る（ページの読み足しも読込に含む）。ドロワーの dirty 件数は同じ関数（`uncommitted_paths`）で数え、合成行の件数と常に一致する。
- 未追跡ファイルの列挙はユーザーの `status.showUntrackedFiles` 設定に従う（既定では未追跡ディレクトリは 1 項目、埋め込みリポジトリも同様で、差分は空）。リネームは削除＋追加の 2 件になる。
- 未追跡ファイルは 4 MiB を上限に読み、超えるものはバイナリ扱い。シンボリックリンクは git と同じくリンク先のパス文字列を内容とする。Diff all では読めない未追跡ファイル（他プロセスがロック中など）を飛ばし、単体の差分要求だけがエラーを返す。
- 追跡ファイルの差分は `--literal-pathspecs` で取り、`a[1].txt` のような名前が glob として他のファイルを巻き込まない。
- 合成行の `time` は 0 で、読み込みごとに値が変わることはない。
- 合成行を選択中に Reload すると詳細と差分を読み直し、作業ツリーが clean になって行が消えたときは選択も解除する。
- 差分ペインの新側パーマリンクは作業ツリーを指せないため無効。旧側（HEAD）は従来どおり。
- README スクリーンショットのシナリオは `dirty` ステップを含むので、次回の `pnpm screenshot` で画像に合成行が現れる（`commitCount` は `dirty` ステップを行として数えるよう更新済み）。
