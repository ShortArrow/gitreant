# ADR 0017: UI デザインの判断に迷ったら GitHub Primer に従う

## Status

Accepted (2026-07-14)

## Context

gitreant の UI は GitHub の見た目・振る舞いに意図的に寄せてきた（Verified/Unverified バッジ、diff 行選択のドロップダウン、permalink、 Octicons の採用 = ADR 0016）。個々の UI 判断のたびに方向性を議論するのは無駄が多く、判断基準を固定したい。

## Decision

- UI の見た目・語彙・振る舞いに迷ったら **GitHub Primer**（https://primer.style/ — GitHub のデザインシステム）の流儀に従う。アイコンは Octicons（決定済み）、色・余白・コンポーネントの振る舞いも Primer のパターンを第一候補とする。
- ただし Primer の実装（@primer/react 等）を**依存として採用するとは限らない**。参照するのは設計言語であり、実装は既存の自前 CSS を保つ。コンポーネントライブラリの導入は必要になった時に別 ADR で判断する。
- git クライアントとして GitHub より適切な先行例がある場合（例: グラフ描画は vscode-git-graph、ブランチ操作は lazygit）はそちらを優先してよい。その判断は ADR かコミットメッセージに残す。

## Consequences

- 「どう見せるか」の議論が「Primer ではどうなっているか」の確認に短縮される。GitHub ユーザーには学習コストのない UI になる。
- GitHub 以外のホスティング利用者にも Primer の見た目自体は中立で、不利益はない。
