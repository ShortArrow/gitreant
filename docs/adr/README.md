# Architecture Decision Records

gitreant の設計判断の記録。各 ADR は決定時点で凍結され、変更する場合は
新しい ADR で supersede する。

| ADR | タイトル | Status |
| --- | -------- | ------ |
| [0001](0001-architecture.md) | gitreant アーキテクチャ | Accepted |
| [0002](0002-detach-by-default.md) | 既定でターミナルからdetachして起動する | Accepted |
| [0003](0003-edge-routing.md) | レーンをまたぐエッジは1行分の曲線＋垂直線で経路する | Accepted |
| [0004](0004-readme-screenshots.md) | READMEスクリーンショットは宣言的フィクスチャから自動生成する | Accepted |
| [0005](0005-commit-detail-on-demand.md) | コミット詳細はオンデマンドで取得する | Accepted |
| [0006](0006-file-diff-on-demand.md) | ファイルdiffは1ファイルずつオンデマンドで取得する | Accepted |
| [0007](0007-fetch-via-git-cli.md) | リモートfetchはgit CLIに委譲する | Accepted |
| [0008](0008-split-diff-client-side.md) | 左右分割diffはunifiedテキストのクライアント側パースで実現する | Accepted |
| [0009](0009-command-log.md) | 実行した外部コマンドをリングバッファに記録しUIに表示する | Accepted |
| [0010](0010-no-browser-on-forward.md) | 稼働中サーバへの転送時はブラウザを開かない | Accepted |
