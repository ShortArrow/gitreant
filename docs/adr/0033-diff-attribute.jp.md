# ADR 0033: バイナリかどうかは git diff と同じく diff 属性で決める

## Status

Accepted (2026-10-14)

## Context

git は、`.gitattributes` の `diff` 属性でファイルの差分の扱いを決める。`-diff` と、それを含む `binary` マクロはバイナリ、`diff` はテキスト、`diff=<driver>` は `diff.<driver>.binary` の設定に従う。属性が無いときにだけ、先頭 8000 バイトに NUL があるかで判断する（[ADR 0006](0006-file-diff-on-demand.jp.md)）。

0.2.3 までの gitreant は、コミットの差分と未追跡ファイルを NUL の有無だけで判断していた。そのため、git がバイナリとして扱うファイル（numstat で `- -`）でも行数を数え、テキストの差分を表示していた。未コミットの変更のうち追跡しているファイルは git CLI を通すので、すでに git と同じ扱いだった。

`git diff <commit> <commit>` は、比べるコミットの中の `.gitattributes` ではなく、作業ツリーの `.gitattributes` を読む。作業ツリーに無いディレクトリについては index を読む。gix の差分パイプライン（`diff_resource_cache_for_tree_diff`）は HEAD の index から属性を読むので、作業ツリーで書き換えた `.gitattributes` が効かない。また、このパイプラインは ADR 0029 の行数の数え方と合わないので、0.2.1 で使うのをやめている。

## Decision

- **差分がバイナリかどうかは、まず `diff` 属性で決め、属性が何も言わないときだけ NUL の有無で決める。** `-diff` と `binary` はバイナリ、`diff` はテキスト、`diff=<driver>` は `diff.<driver>.binary` に従い、その設定が無ければ NUL の有無で決める。
- **属性は `git diff` と同じ場所から読む。** 作業ツリーの `.gitattributes`、作業ツリーに無ければ index、それに `$GIT_DIR/info/attributes` と `core.attributesFile` を使う。比べるコミットの中の `.gitattributes` は読まない。bare リポジトリでは index だけを読む。
- **判断は `src/git/diff_attributes.rs` の 1 か所にまとめる。** コミットの行数と差分、未追跡ファイルの行数と差分は、どれもここを通す。

## Consequences

- 行数と差分の表示が、ファイル単位で `git diff` と一致する。作業ツリーで `.gitattributes` を書き換えると、過去のコミットの表示も変わる。これも git と同じ振る舞いである。
- `diff.<driver>.textconv` は実行しない。textconv を設定したドライバのファイルも、`diff.<driver>.binary` と NUL の有無で判断する。
- ファイル一覧はバイナリを `+0 −0` と表示する。git の `- -` のような区別は、まだ無い。
- 属性を読めないとき（index が壊れているなど）は、NUL の有無だけで判断する。
