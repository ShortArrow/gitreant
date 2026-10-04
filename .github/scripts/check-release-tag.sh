#!/usr/bin/env bash
# Usage: check-release-tag.sh TAG [CARGO_TOML] [CHANGELOG]
#
# Fail unless a release tag (vX.Y.Z) names the version in Cargo.toml and
# CHANGELOG.md has a section for it. A prerelease tag (one containing "-")
# rehearses the pipeline at whatever version the tagged commit carries, so
# it passes without either check.
set -euo pipefail

tag="${1:?tag}"
cargo_toml="${2:-Cargo.toml}"
changelog="${3:-CHANGELOG.md}"

case "$tag" in
  *-*)
    echo "prerelease $tag: version and changelog checks skipped"
    exit 0
    ;;
esac

version="$(sed -n 's/^version = "\(.*\)"$/\1/p' "$cargo_toml" | head -n 1)"
if [ "$tag" != "v$version" ]; then
  echo "::error::tag $tag does not match Cargo.toml version $version" >&2
  exit 1
fi

if ! grep -q "^## \[$version\]" "$changelog"; then
  echo "::error::$changelog has no section for $version" >&2
  exit 1
fi

echo "$tag matches Cargo.toml and has a changelog section"
