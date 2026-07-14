# ADR 0018: squashマージの点線は gh の merged PR 情報で描く

## Status

Accepted (2026-07-14)

## Context

squashマージされたPRのブランチが残っていると、その変更がベース
ブランチに入ったことがグラフの祖先関係からは見えない。ローカル情報
だけの推定（patch-id・コミットメッセージ解析）は信頼できず一度
見送った（vscode-git-graph も同様の理由でヒューリスティック）。

## Decision

- 推定はせず、**GitHubが知っている事実**を使う:
  `gh pr list --state merged --limit 50 --json number,url,headRefName,mergeCommit`
  で「PRのヘッドブランチ ↔ ベースに載ったコミット（mergeCommit）」の
  対応を取得する（ADR 0013 の照会に相乗り、同じTTLキャッシュ・
  コマンドログ記録・gh無し環境での静かな縮退）。
- グラフに **mergeCommit と、まだ残っているローカルブランチのtip の
  両方が存在する場合のみ**、2ノード間を破線の擬似エッジで結ぶ
  （色はブランチtipのレーン色、描画はフロントの `squashEdges`）。
  ブランチ削除済み・mergeCommitが表示範囲外なら何も描かない。

## Consequences

- 「squashしたのにブランチがつながって見えない」ケースだけが正しく
  可視化される。通常のマージPRでも破線は出るが、実エッジと重なる
  だけで害はない。
- 直近50件より古いマージは対象外。gh・GitHubリモート必須。
