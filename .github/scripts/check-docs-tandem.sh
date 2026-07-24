#!/usr/bin/env bash
# Fail when one side of a bilingual doc pair (X.jp.md / X.md, both tracked)
# changed without the other. Pairs where only one language exists — e.g. a
# Japanese-canonical ADR whose English body is still a pre-link — are exempt.
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
fail=0
while IFS= read -r file; do
  case "$file" in
    *.jp.md) other="${file%.jp.md}.md" ;;
    *.md) other="${file%.md}.jp.md" ;;
    *) continue ;;
  esac
  [ -f "$other" ] || continue
  if ! grep -qxF "$other" <<<"$changed"; then
    echo "::error file=$file::$file changed but its counterpart $other did not — bilingual docs update together"
    fail=1
  fi
done <<<"$changed"

exit "$fail"
