# Architecture Decision Records

gitreant の設計判断の記録。各 ADR は決定時点で凍結され、変更する場合は
新しい ADR で supersede する。

| ADR | タイトル | Status |
| --- | -------- | ------ |
| [0001](0001-architecture.jp.md) | gitreant アーキテクチャ | Accepted |
| [0002](0002-detach-by-default.jp.md) | 既定でターミナルからdetachして起動する | Accepted |
| [0003](0003-edge-routing.jp.md) | レーンをまたぐエッジは1行分の曲線＋垂直線で経路する | Accepted |
| [0004](0004-readme-screenshots.jp.md) | READMEスクリーンショットは宣言的フィクスチャから自動生成する | Accepted |
| [0005](0005-commit-detail-on-demand.jp.md) | コミット詳細はオンデマンドで取得する | Accepted |
| [0006](0006-file-diff-on-demand.jp.md) | ファイルdiffは1ファイルずつオンデマンドで取得する | Accepted |
| [0007](0007-fetch-via-git-cli.jp.md) | リモートfetchはgit CLIに委譲する | Accepted |
| [0008](0008-split-diff-client-side.jp.md) | 左右分割diffはunifiedテキストのクライアント側パースで実現する | Accepted |
| [0009](0009-command-log.jp.md) | 実行した外部コマンドをリングバッファに記録しUIに表示する | Accepted |
| [0010](0010-no-browser-on-forward.jp.md) | 稼働中サーバへの転送時はブラウザを開かない | Accepted |
| [0011](0011-signature-verification.jp.md) | 署名検証はgit/gpg CLIに委譲し結果をキャッシュする | Accepted |
| [0012](0012-user-action-log.jp.md) | ユーザー操作はクライアント側で記録しマージ表示する | Accepted |
| [0013](0013-pr-links-via-gh.jp.md) | PR情報はgh CLIに委譲しTTLキャッシュ付き遅延取得にする | Accepted |
| [0014](0014-branch-operations.jp.md) | ブランチ操作はバッジの右クリックメニューからgit CLIに委譲する | Accepted |
| [0015](0015-client-settings.jp.md) | クライアント設定はlocalStorageに保存しボタン表示形式を提供 | Accepted |
| [0016](0016-octicons.jp.md) | アイコンはOcticonsを採用する | Accepted |
| [0017](0017-primer-design-direction.jp.md) | UIデザインの判断に迷ったらGitHub Primerに従う | Accepted |
| [0018](0018-squash-merge-links.jp.md) | squashマージの点線はghのmerged PR情報で描く | Accepted |
| [0019](0019-i18n.jp.md) | i18nは型付き自前辞書で行い言語は設定から切替 | Accepted |
| [0020](0020-lane-principles.jp.md) | レーン割当はHEAD左端直線・分岐は右へ・マージは右から | Accepted |
| [0021](0021-tag-operations.jp.md) | タグ操作もgit CLI委譲でコミット行とバッジのメニューに載せる | Accepted |
| [0022](0022-pane-split.jp.md) | ペイン分割はリポジトリ比較用途に絞り2ペイン横並びから始める | Accepted |
| [0023](0023-progressive-loading.jp.md) | 読み込みは一覧先行・リポジトリ並列・行ページングで段階化する | Accepted |
