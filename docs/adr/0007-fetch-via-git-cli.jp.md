# ADR 0007: リモートfetchはgit CLIに委譲する

## Status

Accepted (2026-07-10)

## Context

vscode-git-graph のように、UIからリモートの新しいコミットを取り込む fetchボタンが欲しい。gitreant のgit読み取りは純Rustの gix で完結しており、バイナリ単体で動くことが利点だった。しかし fetch には認証が絡む: HTTPSのcredential helper、SSHエージェント、ホストごとの設定などを gix で再実装するのは複雑で、認証情報を扱うコードを自前で持つリスクも大きい。

## Decision

- **`POST /api/fetch` はインストール済みの `git` CLI に委譲する**（`git -C <repo> fetch --all --prune --quiet`）。ユーザーのgit設定・ credential helper・SSHエージェントがそのまま使われ、gitreant は認証情報に一切触れない。
- 表示中の全リポジトリを順にfetchし、失敗はリポジトリ単位で `{errors: [{repo, message}]}` として返す（1つの失敗が他を止めない）。
- fetch後は SSE の update を発火し、フロントは再読込する。
- **閲覧機能はgix のまま**。gitコマンドが無い環境では fetch だけが「git がない」というエラーになり、他の機能は影響を受けない。

## Consequences

- fetchボタンの利用時のみ、実行環境に git CLI が必要になる。
- リモートアクセスの挙動（プロキシ、insteadOf、認証）はユーザーの git 設定と完全に一致する。
- pull/push など作業ツリーを変える操作は引き続きスコープ外。
