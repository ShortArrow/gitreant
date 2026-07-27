#!/usr/bin/env bash
# Fail when one side of a bilingual doc pair (X.jp.md / X.md, both tracked)
# was MODIFIED without the other changing too. Additions are exempt: the
# convention is Japanese-first with English editions landing later, so a new
# translation (or a brand-new pair) must not require touching its
# counterpart. Pairs where only one language exists stay exempt as well.
set -euo pipefail

base="${1:?base ref}"
head="${2:?head ref}"

# First push of a branch (all-zero before) or an unreachable base: compare
# against the head's parent so the check still sees the last change.
if [ "$base" = "0000000000000000000000000000000000000000" ] \
  || ! git cat-file -e "$base" 2>/dev/null; then
  base="${head}^"
fi

changed="$(git diff --name-only "$base" "$head")"
modified="$(git diff --name-only --diff-filter=M "$base" "$head")"
fail=0
while IFS= read -r file; do
  case "$file" in
    *.jp.md) other="${file%.jp.md}.md" ;;
    *.md) other="${file%.md}.jp.md" ;;
    *) continue ;;
  esac
  [ -f "$other" ] || continue
  if ! grep -qxF "$other" <<<"$changed"; then
    echo "::error file=$file::$file was modified but its counterpart $other did not change — bilingual docs update together"
    fail=1
  fi
done <<<"$modified"

exit "$fail"
