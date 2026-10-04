#!/usr/bin/env bash
# Behaviour examples for check-release-tag.sh and release-notes.sh, run
# against throwaway Cargo.toml / CHANGELOG.md fixtures.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failures=0

cat >"$work/Cargo.toml" <<'EOF'
[package]
name = "gitreant"
version = "0.3.0"

[dependencies]
serde = { version = "1" }
EOF

cat >"$work/CHANGELOG.md" <<'EOF'
# Changelog

## [Unreleased]

### Added

- Something not yet released.

## [0.3.0] - 2026-10-10

### Fixed

- A fix.

## [0.2.1] - 2026-10-01

### Fixed

- An older fix.

[Unreleased]: https://example.invalid/compare/v0.3.0...HEAD
[0.3.0]: https://example.invalid/compare/v0.2.1...v0.3.0
EOF

# expect <description> <expected exit code> <command...>
expect() {
  local description="$1" expected="$2"
  shift 2
  local actual=0
  "$@" >"$work/out" 2>"$work/err" || actual=$?
  if [ "$actual" -ne "$expected" ]; then
    echo "FAIL: $description (exit $actual, expected $expected)"
    sed 's/^/  stderr: /' "$work/err"
    failures=$((failures + 1))
  else
    echo "ok: $description"
  fi
}

# expect_output <description> <expected stdout> <command...>
expect_output() {
  local description="$1" expected="$2"
  shift 2
  local actual
  actual="$("$@" 2>"$work/err")" || true
  if [ "$actual" != "$expected" ]; then
    echo "FAIL: $description"
    diff <(printf '%s\n' "$expected") <(printf '%s\n' "$actual") | sed 's/^/  /'
    failures=$((failures + 1))
  else
    echo "ok: $description"
  fi
}

check="$here/check-release-tag.sh"
notes="$here/release-notes.sh"

expect "a release tag matching Cargo.toml and the changelog passes" 0 \
  bash "$check" v0.3.0 "$work/Cargo.toml" "$work/CHANGELOG.md"
expect "a release tag that differs from Cargo.toml fails" 1 \
  bash "$check" v0.3.1 "$work/Cargo.toml" "$work/CHANGELOG.md"
expect "a tag without the leading v fails" 1 \
  bash "$check" 0.3.0 "$work/Cargo.toml" "$work/CHANGELOG.md"
expect "a prerelease tag skips the version check" 0 \
  bash "$check" v0.4.0-rc.1 "$work/Cargo.toml" "$work/CHANGELOG.md"

sed 's/^## \[0.3.0\].*$/## [0.2.9] - 2026-10-10/' "$work/CHANGELOG.md" >"$work/CHANGELOG-missing.md"
expect "a release tag without its changelog section fails" 1 \
  bash "$check" v0.3.0 "$work/Cargo.toml" "$work/CHANGELOG-missing.md"

expect_output "the notes are the version's section without its heading" \
  "### Fixed

- A fix." \
  bash "$notes" 0.3.0 "$work/CHANGELOG.md"
expect_output "the last section stops before the link references" \
  "### Fixed

- An older fix." \
  bash "$notes" 0.2.1 "$work/CHANGELOG.md"
expect "notes for a version without a section fail" 1 \
  bash "$notes" 9.9.9 "$work/CHANGELOG.md"

printf '# Changelog\n\n## [1.0.0] - 2026-10-10\n\n## [0.9.0] - 2026-10-01\n\n- x\n' >"$work/CHANGELOG-empty.md"
expect "an empty section fails" 1 \
  bash "$notes" 1.0.0 "$work/CHANGELOG-empty.md"

if [ "$failures" -ne 0 ]; then
  echo "$failures example(s) failed"
  exit 1
fi
