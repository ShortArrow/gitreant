# ADR 0002: 既定でターミナルからdetachして起動する

## Status

Accepted (2026-07-09)

## Context

参考実装の [k1LoW/mo](https://github.com/k1LoW/mo) は、CLI 実行後にサーバをバックグラウンドへ切り離し、すぐシェルへ制御を返す（v0.11.0 以降の既定動作）。 gitreant は従来サーバがフォアグラウンドでブロックし、ターミナルを占有していた。「グラフを見たい」という利用シーンではターミナルを塞がないほうが自然であり、 mo と同じ体験に揃えたい。

## Decision

- **既定動作**: 起動中サーバが無ければ、自分自身の実行ファイルを `--foreground --no-open` と canonicalize 済みパス引数付きで detached プロセスとして spawn する。親は `/api/ping` の応答をポーリングで待ってからブラウザを開き、URL と pid を表示して終了する。
- **detach 手段**: Windows は `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP`、 Unix は `process_group(0)`（新プロセスグループ）。子の標準入出力は null。
- **前面実行**: `--foreground` でサーバを現在のターミナルで実行する（デバッグや、プロセスハンドルで kill したいテストハーネス向け）。
- **停止手段**: `POST /api/shutdown` エンドポイントを追加し、CLI の `--shutdown` から呼ぶ。SSE のような長寿命接続は graceful shutdown を無期限に引き延ばすため、シャットダウン要求から 1 秒の猶予で強制停止する。
- mo が使う restore ファイルは採用しない。gitreant のセッション状態はリポジトリパスの列だけで再現でき、引数として子プロセスへそのまま渡せる。

## Consequences

- 呼び出し側がサーバプロセスを直接管理したい場合（Playwright の global-setup など）は `--foreground` を明示する必要がある。
- detach した子の stderr は捨てられるため、起動失敗時に親は「ping 未到達」「子の早期終了」として検知し、`--foreground` での再実行を案内する。
- 二重起動検知（`/api/ping` → `POST /api/repos` 転送）は detach の前段で行われるため、既存の単一インスタンス動作は変わらない。
