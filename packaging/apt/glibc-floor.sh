#!/bin/sh
# Prints the lowest glibc an executable loads on: the highest GLIBC_x.y
# version it needs without the WEAK flag (ADR 0034). The dynamic loader
# refuses to start an executable that needs a missing version outright,
# and skips one needed only weakly.
#
# Usage: readelf -V -W <executable> | glibc-floor.sh
# Exits 1 when the input names no glibc version.
set -eu

floor="$(
  sed -n 's/.*Name: GLIBC_\([0-9][0-9.]*\)  *Flags: none.*/\1/p' |
    sort -t. -k1,1n -k2,2n -k3,3n |
    tail -n 1
)"
[ -n "$floor" ] || {
  echo "glibc-floor: no glibc version needed" >&2
  exit 1
}
echo "$floor"
