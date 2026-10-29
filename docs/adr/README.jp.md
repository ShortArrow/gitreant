# Architecture Decision Records

gitreant の設計判断の記録。各 ADR は決定時点で凍結され、変更する場合は新しい ADR で supersede する。日本語版（`NNNN-slug.jp.md`、本索引）が正で、英語版（`NNNN-slug.md`、[README.md](README.md) 索引）はその翻訳。

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
| [0024](0024-quality-and-responsibility.jp.md) | 品質ゲートを3段階に定め、提供責任を4本柱で明文化する | Accepted |
| [0025](0025-timestamp-rendering.jp.md) | 日時形式は単一のクライアント設定で全表示を統べ絶対時刻を残す | Accepted |
| [0026](0026-app-mode-window.jp.md) | 専用ウィンドウはブラウザのapp modeで開きネイティブGUIは採らない | Accepted |
| [0027](0027-uncommitted-changes-row.jp.md) | 未コミットの変更はHEADの上に合成行として表示する | Accepted |
| [0028](0028-worktrees.jp.md) | git worktreeはドロワーの入れ子表示とブランチバッジの印で扱う | Accepted |
| [0029](0029-line-ending-changes.jp.md) | 改行コードの変更は行末の印とファイルのラベルで示す | Accepted |
| [0030](0030-release-safeguards.jp.md) | リリースはタグを検査し、CHANGELOGを正とし、公開は承認を経る | Accepted |
| [0031](0031-wording-only-changes.jp.md) | 片方の言語だけの言い回しの修正はコミットの印で日英同時更新の対象から外す | Accepted |
| [0032](0032-static-crt-on-windows.jp.md) | Windows 版は C ランタイムを静的リンクする | Accepted |
| [0033](0033-diff-attribute.jp.md) | バイナリかどうかは git diff と同じく diff 属性で決める | Accepted |
| [0034](0034-debian-packages.jp.md) | 共有の APT リポジトリ向けに Debian パッケージを配る | Accepted |
| [0035](0035-graph-node-navigation.jp.md) | グラフのノードから移動・比較・チェックアウトする | Accepted |
| [0036](0036-stash-node.jp.md) | stash を、乗っている線と見分けて描く | Accepted |
| [0037](0037-deferred-signature-check.jp.md) | グラフを先に出し、署名は後から確かめる | Accepted |
| [0038](0038-loopback-request-guard.jp.md) | ループバックのサーバ宛てで、自分のページから来たリクエストだけに応える | Accepted |
| [0039](0039-server-records.jp.md) | 動いているサーバを記録し、CLI から見つけられるようにする | Accepted |
| [0040](0040-lane-colors-by-what-is-in-use.jp.md) | 列の色を、使用中の列を見て選ぶ | Accepted |
| [0041](0041-diff-stats-per-commit.jp.md) | 各コミットが加えた行数と削った行数を表示する | Accepted |
| [0042](0042-terrain-mode.jp.md) | 加えた行と削った行で起伏をつけて、履歴を地形として見せる | 0044 に置き換え |
| [0043](0043-cumulative-chart.jp.md) | 加えた行と削った行を、時間に沿って足し上げたグラフにする | Accepted |
| [0044](0044-graph-thickness.jp.md) | 行の表示のグラフに、各コミットが変えた行数の厚みをつける | Accepted |
| [0045](0045-tilt-thickness.jp.md) | グラフの背景をドラッグして、厚みを傾ける | Accepted |
| [0046](0046-line-count-bars.jp.md) | 行の行数を横棒で描く | Accepted |
| [0047](0047-net-candles.jp.md) | 行数の推移のグラフに、ロウソク足と期間ごとの行数を加える | Accepted |
| [0048](0048-chart-commits-under-cursor.jp.md) | 行数の推移のグラフで、カーソルの位置のコミットを一覧する | Accepted |
| [0049](0049-chart-timeframe.jp.md) | ロウソクと棒の時間足を選べるようにする | Accepted |
| [0050](0050-calendar.jp.md) | 行の下に履歴のカレンダーを置く | Accepted |
| [0051](0051-chart-range.jp.md) | グラフの範囲を狭め、四半期や年で区切れるようにする | Accepted |
| [0052](0052-line-counts-off.jp.md) | 行の行数を出さないこともできるようにする | Accepted |
| [0053](0053-binary-files-in-the-list.jp.md) | 変更ファイルの一覧でバイナリファイルを示す | Accepted |
| [0054](0054-filter-nested-rows.jp.md) | ドロワーの絞り込みで入れ子の行も探せるようにする | Accepted |
| [0055](0055-drawer-add-panel.jp.md) | リポジトリの追加をドロワーの見出しのボタンから行う | Accepted |
| [0056](0056-week-start.jp.md) | 週の始まりの曜日を選べるようにする | Accepted |
| [0057](0057-segmented-button-style.jp.md) | カレンダーの塗り方のボタンをボタンの表示の設定に従わせる | Accepted |
| [0058](0058-thickness-depth-order.jp.md) | 厚みを奥行きの順に描き、加えた側を手前にする | Accepted |
| [0059](0059-thickness-outline-setting.jp.md) | 厚みの輪郭を設定にし、既定では出さない | Accepted |
| [0060](0060-add-row.jp.md) | リポジトリの追加を一覧の末尾の行から行う | Accepted |
