#!/usr/bin/env bash
# Usage: release-notes.sh VERSION [CHANGELOG]
#
# Print the body of VERSION's section in CHANGELOG.md (Keep a Changelog
# format): everything after its "## [VERSION]" heading up to the next "## ["
# heading or the link references, trimmed of surrounding blank lines. Fails
# when the section is missing or empty.
set -euo pipefail

version="${1:?version}"
changelog="${2:-CHANGELOG.md}"

body="$(awk -v heading="## [$version]" '
  index($0, heading) == 1 { inside = 1; next }
  inside && (/^## \[/ || /^\[[^]]+\]: /) { exit }
  inside { print }
' "$changelog" | sed '/./,$!d')"

if [ -z "$body" ]; then
  echo "::error::$changelog has no notes for $version" >&2
  exit 1
fi

printf '%s\n' "$body"
