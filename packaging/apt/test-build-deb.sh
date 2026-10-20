#!/usr/bin/env bash
# Behaviour examples for build-deb.sh (ADR 0034), run against a stand-in
# executable. Needs dpkg-deb and readelf.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failures=0

# A real ELF executable stands in for gitreant, since the libc6 floor is
# read from its symbol versions.
cp "$(type -P true)" "$work/gitreant"
chmod 0644 "$work/gitreant"

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

# check <description> <command...>: passes when the command succeeds
check() {
  local description="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "ok: $description"
  else
    echo "FAIL: $description"
    failures=$((failures + 1))
  fi
}

expect "a release version builds a package" 0 \
  bash "$here/build-deb.sh" "$work/gitreant" 0.3.0 amd64 "$work/out-amd64"
deb="$work/out-amd64/gitreant_0.3.0-1_amd64.deb"
check "the package is named gitreant_<version>-1_<arch>.deb" test -f "$deb"
check "build-deb.sh prints the package's path" grep -qxF "$deb" "$work/out"

field() { dpkg-deb --field "$deb" "$1"; }
check "Package is gitreant" test "$(field Package)" = gitreant
check "Version carries Debian revision 1" test "$(field Version)" = 0.3.0-1
check "Architecture is the one asked for" test "$(field Architecture)" = amd64
depends="$(field Depends)"
floor="$(readelf -V -W "$work/gitreant" | sh "$here/glibc-floor.sh")"
for dep in "libc6 (>= $floor)" libgcc-s1 libwayland-client0 git shortarrow-archive-keyring; do
  check "Depends names $dep" grep -qF "$dep" <<<"$depends"
done
check "Recommends xdg-utils, which opens the browser" \
  grep -qF xdg-utils <<<"$(field Recommends)"
check "Installed-Size is set" test -n "$(field Installed-Size)"

contents="$(dpkg-deb --contents "$deb")"
check "the executable is /usr/bin/gitreant with mode 0755, owned by root" \
  grep -qE '^-rwxr-xr-x root/root .* \./usr/bin/gitreant$' <<<"$contents"
for doc in copyright LICENSE-MIT LICENSE-APACHE; do
  check "the package carries /usr/share/doc/gitreant/$doc" \
    grep -qE " \./usr/share/doc/gitreant/$doc\$" <<<"$contents"
done

# Version needs as readelf -V prints them: gitreant 0.2.3's x86_64 build,
# which needs GLIBC_2.39 only weakly, and its aarch64 build, which needs it
# outright.
cat >"$work/x86_64.txt" <<'EOF'
Version needs section '.gnu.version_r' contains 4 entries:
  000000: Version: 1  File: libgcc_s.so.1  Cnt: 3
  0x0040:   Name: GCC_3.0  Flags: none  Version: 4
  0x0010: Version: 1  File: libm.so.6  Cnt: 1
  0x0070:   Name: GLIBC_2.29  Flags: none  Version: 7
  0x0020: Version: 1  File: libc.so.6  Cnt: 20
  0x0080:   Name: GLIBC_2.2.5  Flags: none  Version: 3
  0x0170:   Name: GLIBC_2.30  Flags: WEAK  Version: 14
  0x0180:   Name: GLIBC_2.32  Flags: none  Version: 20
  0x0190:   Name: GLIBC_2.33  Flags: none  Version: 13
  0x01a0:   Name: GLIBC_2.34  Flags: none  Version: 2
  0x01b0:   Name: GLIBC_2.39  Flags: WEAK  Version: 16
  0x0030: Version: 1  File: ld-linux-x86-64.so.2  Cnt: 1
  0x01c0:   Name: GLIBC_2.3  Flags: none  Version: 6
EOF
cat >"$work/aarch64.txt" <<'EOF'
Version needs section '.gnu.version_r' contains 3 entries:
  0x0010:   Name: GLIBC_2.29  Flags: none  Version: 13
  0x00a0:   Name: GLIBC_2.34  Flags: none  Version: 6
  0x00b0:   Name: GLIBC_2.17  Flags: none  Version: 5
  0x00c0:   Name: GLIBC_2.39  Flags: none  Version: 3
EOF
check "the floor ignores a weakly needed glibc version" \
  test "$(sh "$here/glibc-floor.sh" <"$work/x86_64.txt")" = 2.34
check "the floor is the highest glibc version needed outright" \
  test "$(sh "$here/glibc-floor.sh" <"$work/aarch64.txt")" = 2.39
expect "no glibc version at all is refused" 1 \
  sh "$here/glibc-floor.sh" </dev/null

expect "arm64 builds too" 0 \
  bash "$here/build-deb.sh" "$work/gitreant" 0.3.0 arm64 "$work/out-arm64"
check "the arm64 package says so" \
  test "$(dpkg-deb --field "$work/out-arm64/gitreant_0.3.0-1_arm64.deb" Architecture)" = arm64

expect "a pre-release spelled with ~ builds a package" 0 \
  bash "$here/build-deb.sh" "$work/gitreant" 0.3.0~rc.1 amd64 "$work/out-tilde"
check "the ~ pre-release sorts before the release" \
  dpkg --compare-versions "$(dpkg-deb --field "$work/out-tilde/gitreant_0.3.0~rc.1-1_amd64.deb" Version)" lt 0.3.0-1

check "a release tag gives Cargo.toml's version" \
  test "$(sh "$here/deb-version.sh" 0.3.0 v0.3.0)" = 0.3.0
check "a prerelease tag gives a version that sorts before the release" \
  test "$(sh "$here/deb-version.sh" 0.3.0 v0.3.0-rc.1)" = '0.3.0~rc.1'
expect "a prerelease tag for another version is refused" 1 \
  sh "$here/deb-version.sh" 0.3.0 v0.4.0-rc.1

expect "a pre-release version is refused" 1 \
  bash "$here/build-deb.sh" "$work/gitreant" 0.3.0-rc.1 amd64 "$work/out-rc"
check "a refused pre-release leaves no package" test ! -e "$work/out-rc"
expect "an unknown architecture is refused" 1 \
  bash "$here/build-deb.sh" "$work/gitreant" 0.3.0 i386 "$work/out-i386"
expect "a missing executable is refused" 1 \
  bash "$here/build-deb.sh" "$work/missing" 0.3.0 amd64 "$work/out-missing"

if [ "$failures" -ne 0 ]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo "all checks passed"
