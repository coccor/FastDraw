#!/usr/bin/env bash
# Render each candidate look on the test diagrams. Usage: render-mocks.sh <worktree>
set -euo pipefail
W="$1"; C="$W/looks/candidates"; OUT="$C/mock"; SRC="$C/mock-src"
mkdir -p "$OUT" "$SRC"
for look in "$C"/*.look; do
  name=$(basename "$look" .look)
  for d in high-level state bar; do
    f="$SRC/$d-$name.fdraw"
    { echo "look \"../$name.look\""; sed 's/title.color=#ffffff/title.color=ground/g' "$W/examples/trial/$d.fdraw"; } > "$f"
    "$W/bin/fastdraw" check "$f" | grep -E "error" || true
    "$W/bin/fastdraw" render "$f" -o "$OUT/$d-$name.png" | tail -1
  done
done
