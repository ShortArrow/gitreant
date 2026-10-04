#!/usr/bin/env bash
# Behaviour examples for check-docs-tandem.sh, run against a throwaway
# repository holding one bilingual pair.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failures=0

git -C "$work" init -q
git -C "$work" config user.name test
git -C "$work" config user.email test@example.invalid
git -C "$work" config commit.gpgsign false
git -C "$work" config core.autocrlf false
printf 'はじめの文。\n' >"$work/doc.jp.md"
printf 'The first sentence.\n' >"$work/doc.md"
git -C "$work" add . && git -C "$work" commit -q -m "add the pair"
base="$(git -C "$work" rev-parse HEAD)"

# commit_on_base <message> <file> <content>: a fresh commit on top of base.
commit_on_base() {
  git -C "$work" checkout -q --detach "$base"
  printf '%s\n' "$3" >"$work/$2"
  git -C "$work" commit -q -am "$1"
}

# expect <description> <expected exit code>: check base..HEAD.
expect() {
  local actual=0
  (cd "$work" && bash "$here/check-docs-tandem.sh" "$base" HEAD) >/dev/null 2>&1 || actual=$?
  if [ "$actual" -ne "$2" ]; then
    echo "FAIL: $1 (exit $actual, expected $2)"
    failures=$((failures + 1))
  else
    echo "ok: $1"
  fi
}

commit_on_base "docs: change the meaning" doc.jp.md 'ちがう文。'
expect "a change to one side alone fails" 1

commit_on_base "docs: rebreak" doc.jp.md 'はじめの
文。'
expect "a change that only re-breaks lines passes" 0

commit_on_base "docs: smooth the Japanese wording [wording-only]" doc.jp.md '最初の文。'
expect "a change marked [wording-only] passes" 0

commit_on_base "docs: smooth the English wording [wording-only]" doc.md 'The opening sentence.'
expect "the mark works for the English side too" 0

commit_on_base "docs: fix a Japanese typo [jp-only]" doc.jp.md '最初の文。'
expect "a Japanese change marked [jp-only] passes" 0

commit_on_base "docs: fix an English typo [en-only]" doc.md 'The opening sentence.'
expect "an English change marked [en-only] passes" 0

commit_on_base "docs: mislabelled [jp-only]" doc.md 'The opening sentence.'
expect "[jp-only] does not exempt the English side" 1

commit_on_base "docs: mislabelled [en-only]" doc.jp.md '最初の文。'
expect "[en-only] does not exempt the Japanese side" 1

commit_on_base "docs: smooth the wording [wording-only]" doc.jp.md '最初の文。'
printf '最初の一文。\n' >"$work/doc.jp.md"
git -C "$work" commit -q -am "docs: fix a Japanese typo [jp-only]"
expect "different applicable marks on the same file pass" 0

commit_on_base "docs: smooth the wording [wording-only]" doc.jp.md '最初の文。'
printf 'ちがう文。\n' >"$work/doc.jp.md"
git -C "$work" commit -q -am "docs: change the meaning"
expect "an unmarked commit to the same file in the range still fails" 1

if [ "$failures" -ne 0 ]; then
  echo "$failures example(s) failed"
  exit 1
fi
