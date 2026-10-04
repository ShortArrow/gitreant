# ADR 0030: リリースはタグを検査し、CHANGELOG を正とし、公開は承認を経る

## Status

Accepted (2026-10-04)

## Context

`release.yml` はタグの push だけで最後まで進み、次の穴があった。

- タグが `Cargo.toml` のバージョンや main と食い違っても止まらない。食い違うと GitHub Release は公開され、そのあと crates.io へのアップロードが失敗する。
- プレリリースのタグでも crates.io へ公開しようとするため、パイプライン全体を試す手段がない。止めるには、タグを打つコミットのメッセージに `[skip publish]` を書くしかなかった。
- crates.io の存在確認は、404 以外の応答（5xx や通信失敗）でも公開に進む。
- リリースノートは自動生成で、毎回手で書き直していた。変更の記録はリポジトリに残っていなかった。
- actions をタグで参照しており、タグを付け替えられると中身が変わる。checkout がトークンを作業ツリーに残し、ジョブにタイムアウトがない。

同じ作者の ssh-copy-id のリリースフローは、これらを塞いでいる。

## Decision

- **タグを最初に検査する。** タグを打ったコミットが main に含まれていなければ止める。正式版のタグ（`vX.Y.Z`）は、`Cargo.toml` のバージョンと一致し、`CHANGELOG.md` に節があるときだけ通す。検査は `.github/scripts/check-release-tag.sh` に置き、CI でその振る舞いの例を実行する。
- **プレリリースのタグ（`-` を含む）はリハーサルにする。** バージョンと CHANGELOG の検査を飛ばし、ビルドと GitHub Release（プレリリース扱い）までを通す。crates.io へは公開しない。
- **crates.io への公開は `release` environment を通す。** environment はオーナーの承認を待ち、`v*` のタグだけを受け入れる。crates.io の Trusted Publishing もこの environment からのトークンだけを受け入れる。公開を見送るときは承認を拒否する（`[skip publish]` は廃止）。
- **crates.io の確認は、分からなければ止める。** 200 なら公開済みとして何もせず、404 なら公開し、それ以外なら失敗にする。
- **`CHANGELOG.md`（Keep a Changelog 形式）を変更の正とする。** 正式版の GitHub Release のノートは、その版の節をそのまま使う（`.github/scripts/release-notes.sh`）。リリースノートに転記されるので、リンクは絶対 URL で書く。プレリリースのノートは自動生成のままとする。
- **actions はコミットの SHA で固定し、行末のコメントに元のリリースを書く。** checkout は `persist-credentials: false`、すべてのジョブに `timeout-minutes` を付け、`gh release create` は `--verify-tag` で呼ぶ。Rust は外部の action を使わずに `rustup` で入れる。CI のワークフローにも同じ規則を当てる。
- **脆弱性の報告先を `.github/SECURITY.md` に置く。** GitHub の非公開の脆弱性報告で受け、修正は最新版にだけ入れる。

## Consequences

- タグの打ち間違いは、何も公開されないうちに `Check the tag` のジョブで止まる。
- 新しいリリースの前に、`v0.2.2-rc.1` のようなタグでパイプラインを試せる。リハーサルの GitHub Release とタグは、試した後に手で消す。
- 正式版を出すには、CHANGELOG の節を書いてから版を上げることになる。CI はいまの `Cargo.toml` の版の節があることを毎回確かめる。
- crates.io への公開は承認を待つので、タグを打った後に GitHub の画面で一度承認する手間が増える。
- `release` environment の作成と承認者の設定、crates.io の Trusted Publishing に environment 名を登録することは、リポジトリの外で一度だけ行う。
- SHA で固定した actions は自動では上がらない。更新は手で行うか、Dependabot の version updates を入れて任せる。
