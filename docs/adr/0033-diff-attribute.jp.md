# ADR 0033: バイナリかどうかは git diff と同じく diff 属性で決める

## Status

Accepted (2026-10-14)

## Context

git は、`.gitattributes` の `diff` 属性でファイルの差分の扱いを決める。`-diff` と、それを含む `binary` マクロはバイナリ、`diff` はテキスト、`diff=<driver>` は `diff.<driver>.binary` の設定に従う。属性が何も言わないときにだけ、先頭 8000 バイトに NUL があるかで判断する（[ADR 0006](0006-file-diff-on-demand.jp.md)）。

`git diff <commit> <commit>` が属性を読むのは、`$GIT_DIR/info/attributes`、作業ツリーの `.gitattributes`、グローバルとシステムの属性ファイル（`core.attributesFile` など）である。比べるコミットの中の `.gitattributes` も、index も読まない。そのため、作業ツリーから消したディレクトリの `.gitattributes` は、index に残っていても効かない。bare リポジトリでは、`info/attributes` とグローバル・システムのファイルだけになる。

0.2.0 のコミットの行数は gix の差分パイプライン（`diff_resource_cache_for_tree_diff`）を通していたので、`diff` 属性に従っていた。ただし属性は HEAD の index から読むので、作業ツリーで書き換えた `.gitattributes` は効かなかった。また、差分の本文は NUL の有無だけで判断していた。このパイプラインは ADR 0029 の行数の数え方と合わないので、0.2.1 で使うのをやめた。それ以降の 0.2.1〜0.2.3 は、コミットの行数も差分も、未追跡ファイルも、NUL の有無だけで判断していた。そのため、git がバイナリとして扱うファイル（numstat で `- -`）でも行数を数え、テキストの差分を表示していた。未コミットの変更のうち追跡しているファイルは git CLI を通すので、ずっと git と同じ扱いだった。

## Decision

- **差分がバイナリかどうかは、まず `diff` 属性で決め、属性が何も言わないときだけ NUL の有無で決める。** `-diff` と `binary` はバイナリ、`diff` はテキスト、`diff=<driver>` は `diff.<driver>.binary` に従い、その設定が無ければ NUL の有無で決める。
- **属性は `git diff <commit> <commit>` と同じ場所から読む。** index と、比べるコミットの中の `.gitattributes` は読まない。gix には空の index を渡す。
- **判断は `src/git/diff_attributes.rs` の 1 か所にまとめる。** コミットの行数と差分、未追跡ファイルの行数と差分は、どれもここを通す。

## Consequences

- 行数と差分の表示は、下に挙げる場合を除いて `git diff` と一致する。作業ツリーで `.gitattributes` を書き換えると、過去のコミットの表示も変わる。これも git と同じ振る舞いである。
- index を読み込まないので、大きなリポジトリでもリクエストごとの負担が増えない。
- `diff.<driver>.textconv` は実行しない。textconv を設定したドライバのファイルも、`diff.<driver>.binary` と NUL の有無で判断する。
- 未追跡ファイルのうち 4 MiB を超えるものは読まないので、`diff` 属性があってもバイナリとして扱う。
- リネームしたファイルは、新しいパスの属性だけで判断する。git は、元のパスと新しいパスのどちらかがバイナリならバイナリとして扱う。
- ファイル一覧はバイナリを `+0 −0` と表示する。git の `- -` のような区別は、まだ無い。
- 属性を読めないときは、NUL の有無だけで判断する。
