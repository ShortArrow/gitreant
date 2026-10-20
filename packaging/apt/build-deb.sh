#!/bin/sh
# Builds the gitreant Debian package from a release executable (ADR 0034):
# /usr/bin/gitreant and the licences under /usr/share/doc/gitreant.
#
# Usage: build-deb.sh <executable> <version> <amd64|arm64> <out dir>
# Writes <out dir>/gitreant_<version>-1_<arch>.deb, with a "~" in the version
# spelled "." as GitHub serves release assets, and prints its path.
# Needs dpkg-deb and readelf.
set -eu

exe="${1:?usage: build-deb.sh <executable> <version> <amd64|arm64> <out dir>}"
version="${2:?version}"
arch="${3:?arch}"
out="${4:?out dir}"
repo="$(cd "$(dirname "$0")/../.." && pwd)"

case "$version" in
  *-*)
    echo "build-deb: $version is a pre-release, which gets no package (ADR 0034)" >&2
    exit 1
    ;;
esac
case "$arch" in
  amd64 | arm64) ;;
  *)
    echo "build-deb: unknown architecture $arch" >&2
    exit 1
    ;;
esac
[ -f "$exe" ] || {
  echo "build-deb: $exe is not a file" >&2
  exit 1
}
glibc="$(readelf -V -W "$exe" | sh "$repo/packaging/apt/glibc-floor.sh")"

root="$(mktemp -d)"
trap 'rm -rf "$root"' EXIT

chmod 0755 "$root"
mkdir -p "$root/usr/bin" "$root/usr/share/doc/gitreant" "$root/DEBIAN"
install -m 0755 "$exe" "$root/usr/bin/gitreant"
install -m 0644 "$repo/LICENSE-MIT" "$repo/LICENSE-APACHE" "$root/usr/share/doc/gitreant/"
cat >"$root/usr/share/doc/gitreant/copyright" <<'EOF'
Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/
Upstream-Name: gitreant
Source: https://github.com/ShortArrow/gitreant

Files: *
Copyright: ShortArrow
License: MIT or Apache-2.0
 The full texts are in /usr/share/doc/gitreant/LICENSE-MIT and
 /usr/share/doc/gitreant/LICENSE-APACHE.
EOF
chmod 0644 "$root/usr/share/doc/gitreant/copyright"

installed_size="$(du -sk "$root/usr" | cut -f1)"
cat >"$root/DEBIAN/control" <<EOF
Package: gitreant
Version: ${version}-1
Architecture: ${arch}
Maintainer: ShortArrow <bamboogeneral@shortarrow.jp>
Installed-Size: ${installed_size}
Depends: libc6 (>= ${glibc}), libgcc-s1, libwayland-client0, git, shortarrow-archive-keyring
Recommends: xdg-utils
Suggests: gh, gnupg
Section: vcs
Priority: optional
Homepage: https://github.com/ShortArrow/gitreant
Description: commit graphs of local git repositories in the browser
 gitreant serves the commit graphs of local repositories as a single-page
 web app and opens it in the browser: several repositories side by side,
 with their submodules, worktrees, diffs and signatures.
EOF

mkdir -p "$out"
deb="$out/gitreant_$(echo "$version" | tr "~" .)-1_${arch}.deb"
dpkg-deb --root-owner-group -Zxz --build "$root" "$deb" >/dev/null
echo "$deb"
