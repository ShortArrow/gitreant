#!/usr/bin/env bash
# Build demo repositories for README screenshots.
#
# Creates (under the target directory, default ./demo):
#   aurora/        the star of the shot: branches, a merge, an unmerged tip,
#                  a pushed + a local-only tag (split badges), a stash with
#                  untracked files, a submodule with two pointer updates
#                  (correlation region + dashed links), GitHub-avatar authors,
#                  and dirty/unpushed/local-branch drawer indicators
#   aurora-origin/ bare "GitHub" stand-in so pushed refs and tags resolve
#                  offline (ls-remote works against a local path)
#   engine/        the submodule's upstream
#   toolkit/       a small, clean second repository for the drawer
#
# Usage: scripts/demo_repos.sh [target-dir]
#        gitreant <target>/aurora <target>/toolkit --port 4123
set -euo pipefail

root="${1:-demo}"
rm -rf "$root"
mkdir -p "$root"
root="$(cd "$root" && pwd)"

# Deterministic history: one fixed base time, offsets in hours.
T0=1780300800 # ≈ 2026-06-01
at() { echo "@$((T0 + $1 * 3600)) +0900"; }

# commit <dir> <hours> <author> <email> <message...>
commit() {
  local dir="$1" hours="$2" name="$3" email="$4"
  shift 4
  GIT_AUTHOR_NAME="$name" GIT_AUTHOR_EMAIL="$email" \
  GIT_COMMITTER_NAME="$name" GIT_COMMITTER_EMAIL="$email" \
  GIT_AUTHOR_DATE="$(at "$hours")" GIT_COMMITTER_DATE="$(at "$hours")" \
  git -C "$dir" commit -q --allow-empty -m "$@"
}

# The octocat noreply address resolves to a real avatar with no API call.
OCTO_N="The Octocat"
OCTO_E="583231+octocat@users.noreply.github.com"
NOVA_N="Nova Sakamoto"
NOVA_E="nova@example.com"

init() {
  mkdir -p "$1"
  git -C "$1" init -q -b main
  git -C "$1" config commit.gpgsign false
  git -C "$1" config user.name "$NOVA_N"
  git -C "$1" config user.email "$NOVA_E"
}

# ---- engine: the submodule's upstream ---------------------------------------
# Only its first commit exists when aurora vendors it; the second lands later
# so the bump really moves the pointer (two correlation links).
engine="$root/engine"
init "$engine"
echo "pub fn boot() {}" > "$engine/lib.rs"
git -C "$engine" add .
commit "$engine" 0 "$OCTO_N" "$OCTO_E" "feat: renderer core with a fixed timestep"

# ---- aurora: the main repository --------------------------------------------
aurora="$root/aurora"
init "$aurora"
cat > "$aurora/README.md" <<'MD'
# aurora

A tiny rendering playground.
MD
git -C "$aurora" add .
commit "$aurora" 1 "$OCTO_N" "$OCTO_E" "feat: project skeleton and window bootstrap"
echo "fn main() {}" > "$aurora/main.rs"
git -C "$aurora" add .
commit "$aurora" 8 "$NOVA_N" "$NOVA_E" "feat: wire the renderer into the main loop"

# v1.0.0 lands early and gets pushed (split badge with the remote chip).
git -C "$aurora" tag v1.0.0

# The submodule arrives, then gets bumped once: two pointer updates for the
# correlation region's dashed links.
git -C "$aurora" -c protocol.file.allow=always submodule add -q ../engine libs/engine
commit "$aurora" 20 "$OCTO_N" "$OCTO_E" "feat: vendor the engine as a submodule"

# The upstream engine moves on...
echo "pub fn draw() {}" >> "$engine/lib.rs"
git -C "$engine" add .
commit "$engine" 30 "$NOVA_N" "$NOVA_E" "perf: batch draw calls per material"

# ...and aurora catches up: the second pointer update.
git -C "$aurora/libs/engine" config commit.gpgsign false
git -C "$aurora/libs/engine" -c protocol.file.allow=always fetch -q origin
git -C "$aurora/libs/engine" merge -q --ff-only origin/main
git -C "$aurora" add libs/engine
commit "$aurora" 34 "$NOVA_N" "$NOVA_E" "chore: bump engine for the batched draw calls"

# A feature branch that merges back: two lanes and a merge node.
git -C "$aurora" switch -q -c feature/telemetry
echo "count frames" > "$aurora/telemetry.rs"
git -C "$aurora" add .
commit "$aurora" 40 "$OCTO_N" "$OCTO_E" "feat(telemetry): frame counter overlay"
commit "$aurora" 44 "$OCTO_N" "$OCTO_E" "feat(telemetry): p95 frame-time readout"
git -C "$aurora" switch -q main
commit "$aurora" 46 "$NOVA_N" "$NOVA_E" "docs: document the render settings"
GIT_AUTHOR_NAME="$NOVA_N" GIT_AUTHOR_EMAIL="$NOVA_E" \
GIT_COMMITTER_NAME="$NOVA_N" GIT_COMMITTER_EMAIL="$NOVA_E" \
GIT_AUTHOR_DATE="$(at 50)" GIT_COMMITTER_DATE="$(at 50)" \
  git -C "$aurora" merge -q --no-ff feature/telemetry -m "Merge branch 'feature/telemetry'"

# The bare "GitHub": main and v1.0.0 are pushed, so ls-remote (offline, local
# path) marks the tag with its remote chip and origin/main gets a badge.
git -C "$aurora" -c protocol.file.allow=always clone -q --bare "$aurora" "$root/aurora-origin"
git -C "$aurora" remote add origin "$root/aurora-origin"
git -C "$aurora" -c protocol.file.allow=always fetch -q origin
git -C "$aurora" branch -q -u origin/main main

# Work that exists only locally, on top of the pushed state:
commit "$aurora" 60 "$OCTO_N" "$OCTO_E" "fix: clamp the camera pitch at the poles"
git -C "$aurora" tag v1.1.0-rc  # local-only tag: plain badge next to the split one

# An unmerged branch tip on its own lane (and a local-only branch indicator).
git -C "$aurora" switch -q -c feature/ui-polish
echo "rounded corners" > "$aurora/ui.rs"
git -C "$aurora" add .
commit "$aurora" 64 "$NOVA_N" "$NOVA_E" "feat(ui): soften the panel corners"
git -C "$aurora" switch -q main

# A stash with an untracked file (folds to one node; toggle reveals it).
echo "wip shadows" >> "$aurora/main.rs"
echo "scratch" > "$aurora/notes.txt"
GIT_AUTHOR_DATE="$(at 66)" GIT_COMMITTER_DATE="$(at 66)" \
  git -C "$aurora" stash push -q -u -m "shadow mapping experiment"

# Leave the tree lively for the drawer indicators: dirty + unpushed commits.
echo "// tuning pass" >> "$aurora/main.rs"
echo "todo: bloom" > "$aurora/ideas.txt"

# ---- toolkit: a small, clean neighbour for the drawer -----------------------
toolkit="$root/toolkit"
init "$toolkit"
echo "#!/bin/sh" > "$toolkit/run.sh"
git -C "$toolkit" add .
commit "$toolkit" 2 "$NOVA_N" "$NOVA_E" "feat: bootstrap the asset pipeline"
git -C "$toolkit" switch -q -c fix/paths
commit "$toolkit" 10 "$OCTO_N" "$OCTO_E" "fix: normalise asset paths on Windows"
git -C "$toolkit" switch -q main
commit "$toolkit" 12 "$NOVA_N" "$NOVA_E" "chore: pin the toolchain"
git -C "$toolkit" tag v0.2.0

echo "demo repositories ready under $root"
echo "  gitreant $root/aurora $root/toolkit --port 4123 --no-open"
