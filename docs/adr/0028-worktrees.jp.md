# ADR 0028: git worktree はドロワーの入れ子表示とブランチバッジの印で扱う

## Status

Accepted (2026-09-23)

## Context

`git worktree` で作った linked worktree は、refs とオブジェクトをメインと共有しつつ HEAD・index・作業ツリーを別に持つ。gitreant はリポジトリをパスで識別するので linked worktree を追加すれば個別のビューとしては開けたが、それがどのリポジトリの worktree なのか、どのブランチが別の worktree でチェックアウト済みなのかは見えなかった（Issue #3）。後者は `git switch` が「already checked out」で拒否する操作であり、UI から実行して失敗を見せる形になっていた。

## Decision

- **worktree の関係は gix で読む。** common git dir の `worktrees/` を列挙し（`Repository::worktrees()`）、linked から開いた場合は `main_repo()` でメインも得る。自分自身を除いた「他の worktree」を、名前（ディレクトリ名）・パス・チェックアウト中ブランチ・main フラグで持つ。サブプロセスを使わないので、即答する一覧（ADR 0023）にもビューにも載せる。
- **linked worktree は独立したリポジトリとして開く。** セッションの識別はパスのままで、worktree 用の特別な id は作らない。ビューは共有 refs と自分の HEAD をそのまま描く。
- **ドロワーはサブモジュール（ADR 0022 期の accordion）と同じ入れ子にする。** 行はディレクトリ名とブランチ名を示し、クリックで追加してペインに開く。linked worktree を直接追加した場合はメインが入れ子になる。追加済みの linked worktree は、そのメインも一覧にある間だけトップレベル行を持たず、入れ子行の右クリックから「表示から削除」する。入れ子規則は純関数 `topLevelRepos` に置き、ユニットテストで固定する。
- **ブランチバッジに印を付け、チェックアウトを塞ぐ。** 他の worktree がチェックアウト中のローカルブランチには worktree アイコンのセグメントを付け、ツールチップでパスを示す。バッジメニューの Checkout は無効化して理由を示す（git が拒否する操作を UI から出さない）。マージは従来どおり可能。
- **worktree の作成・削除・移動は提供しない。** リポジトリへの書き込み操作の追加は QUALITY.jp.md の改訂を要する（ADR 0024）ため、閲覧と誘導に限る。

## Consequences

- 一覧・ビューの読み取りごとに `.git/worktrees/*` を走査し、linked worktree ごとに gix でリポジトリを開いて HEAD を読む。件数は通常数個で、コストは無視できる。
- bare リポジトリは main として列挙されない（作業ツリーが無い）。 linked worktree は列挙される。
- チェックアウト先ディレクトリが消えた linked worktree（`git worktree prune` の対象）は列挙しない。開けないものを見せない。
- 同じブランチを複数 worktree で見ると、それぞれのビューで相手側に印が付く。印はあくまで「他所でチェックアウト中」の意味で、HEAD バッジとは別。
- 入れ子行にも追加済みなら dirty / unpushed のインジケータを出す。ただしドロワーの名前フィルタはトップレベル行だけを対象にするので、入れ子になった worktree は絞り込みで見つからない（既知の制約）。
- worktree の存在確認はファイルシステムに触れるため、切断されたネットワークドライブ上の worktree があると一覧の応答がそのタイムアウト分だけ待たされる。
