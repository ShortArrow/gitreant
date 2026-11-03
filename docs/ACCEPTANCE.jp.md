# 手動の受け入れ確認

リリースの前に、バージョンを上げる直前のコミットで、人がこの手順を通す。すべてのステップが「合格の基準」の列のとおりなら、リリースに進んでよい。1 つでも違えば、原因を直し、影響するステップをやり直す。

合格で言えるのは、通した OS とブラウザで、下のステップが動いたことまでである。それ以外の OS と、確かめる条件を書ける動作は、自動テストが受け持つ。

## 準備

リポジトリのルートで、この順に実行する。`pnpm screenshot` はフィクスチャのリポジトリを `frontend/screenshot/.tmp` に残し、`docs/images/` を書き換える。

```console
$ cd frontend && pnpm screenshot && cd ..
$ make build
```

以下の `gitreant` は `target/release/gitreant` を指す。ポート 4700 を使うのは、すでに動いているサーバに影響しないようにするためである。コミット、OS、ブラウザを[記録](#結果を記録する)のために控える。

## ページを開く

| 操作 | 合格の基準 |
|---|---|
| `gitreant doctor -p 4700` を実行する | git の行が `[ok]` で始まり、サーバの行がポート 4700 でサーバは動いていないと示す |
| `gitreant -p 4700 frontend/screenshot/.tmp/aurora` を実行する | `gitreant serving on http://127.0.0.1:4700/` と表示され、ブラウザが確認なしで `aurora` のグラフのページを開く |
| アドレスバーとブラウザの履歴を見る | アドレスは `http://127.0.0.1:4700/` で、`token=` を含む項目がない |
| ページを再読み込みする | フォームの再送信の確認なしで、グラフが表示される |
| `http://127.0.0.1:4700/` を新しいタブで開く | ページにサーバの秘密がないと表示され、`gitreant open` が示される |
| `gitreant open -p 4700` を実行する | `opened http://127.0.0.1:4700/` と表示され、グラフのタブが開く |
| `gitreant -p 4700 frontend/screenshot/.tmp/notes` を実行する | `added` と `already serving` が表示され、タブが開き、リポジトリの一覧に `notes` が加わる |
| `gitreant list --verbose` を実行する | ポート 4700 の行にこのビルドのバージョンがあり、`aurora` は `given at startup`、`notes` は `added by the CLI` と表示される |

## 履歴を読む

`aurora` のタブを使う。

| 操作 | 合格の基準 |
|---|---|
| 行全体を見渡す | 隣り合うレーンの色が同じでなく、数えた行に `+N -N` があり、`...` で終わる長い件名のほかに、重なりや切れがない |
| `feat(graph): topological lane layout` にポインタを置く | `Assign each commit a column` から始まる本文がポップアップで表示され、詳細ペインは変わらない |
| グラフのノードにポインタを置く | 第一親の鎖から外れた行、ノード、辺が薄くなり、ポインタを離すと戻る |
| グラフの背景を横にドラッグし、離す | ドラッグに合わせて厚みが傾き、離すと戻る |
| そのコミットをクリックする | 詳細ペインに `docs/graph.md`、`src/graph.rs`、`src/lanes.rs` が並ぶ |
| `Diff all` をクリックする | 各ファイルの差分が表示され、正しく読める |
| `↑`、`↓` の順に押し、選択が消えるまで `Esc` を押す | 選択が 1 行上へ動いて戻り、`Esc` で差分が閉じ、続いて選択が消える |
| `Lines over time` をクリックし、もう一度クリックする | 行の代わりにチャートが表示され、再度のクリックで行に戻る |
| `Calendar` をクリックし、色の付いた日をクリックする | 行の下にカレンダーが表示され、その日のコミットが行で選択される |
| サブモジュールのグラフを右クリックし、タブで開く項目を選ぶ | サブモジュールの履歴のタブが開く |

## デスクトップと連携する

ここでは、ブラウザの外のプログラムまで届くことを確かめる。

| 操作 | 合格の基準 |
|---|---|
| `Add repository`、`Choose folder…` の順にクリックし、`frontend/screenshot/.tmp/site` を選ぶ | OS のフォルダ選択ダイアログがブラウザの手前に開き、`site` が一覧に加わる |
| `aurora` で `Uncommitted changes` をクリックし、`ideas.txt` を右クリックして `Reveal in file manager` を選ぶ | ファイルマネージャが `ideas.txt` を示し、ほかに何も起動しない |
| `gitreant editor add acceptance <テキストエディタのプログラム> "{path}"` を実行し、ページを再読み込みして、`ideas.txt` をもう一度右クリックする | メニューに `Open with acceptance` があり、選ぶとそのエディタでファイルが開く |
| `gitreant editor remove acceptance` を実行する | `gitreant editor list` に出なくなる |

## サーバを止める

| 操作 | 合格の基準 |
|---|---|
| Settings で言語を日本語にして元に戻し、`Theme` を 2 回クリックする | そのたびに言語とテーマが変わり、どの表示も読める |
| `gitreant restart -p 4700` を実行する | `gitreant serving on http://127.0.0.1:4700/` と表示され、タブは開かない |
| タブを再読み込みする | ページにサーバの秘密がないと表示される |
| `gitreant open -p 4700` を実行する | タブが開き、一覧に `aurora`、`notes`、`site` がある |
| `gitreant --shutdown -p 4700` を実行する | `gitreant on port 4700 shut down` と表示され、`gitreant list` にポート 4700 が出なくなる |

## 結果を記録する

コミット、OS、ブラウザ、通した人を、バージョンを上げるコミットのメッセージに書く。このリリースで配る OS のうち、誰も試さなかったものも挙げる。
