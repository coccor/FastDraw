#!/usr/bin/env bash
# Render the magazine looks on five trial diagrams. Usage: render-mag.sh <worktree>
set -euo pipefail
W="$1"; C="$W/looks/candidates"; SRC="$C/mock-src"; T="$(dirname "$0")"
for L in gazette quarterly schematic-mag; do
  OUT="$C/mag/$L"; mkdir -p "$OUT"
  concept=none; [ "$L" = schematic-mag ] && concept=echo
  for d in high-level state bar swimlane process; do
    f="$SRC/$d-$L.fdraw"
    { echo "look \"../$L.look\""; sed -E 's/fill=ink stroke=none title.color=#ffffff/fill=accent\/0.14 stroke=none title.color=accent/; s/fill=muted stroke=none title.color=#ffffff/fill=ink\/0.06 stroke=none title.color=muted/' "$W/examples/trial/$d.fdraw"; } > "$f"
    # the magazine title stack: a one-line dek under the state diagram's title
    [ "$d" = state ] && sed -i 's/^\(text "Life of a support ticket" at 60,56 style=h1\)$/\1\ntext "Most tickets close in four steps; one in five comes back after it is resolved." at 60,88 style=dek/' "$f"
    "$W/bin/fastdraw" check "$f" | grep -E " error " || true
    "$W/bin/fastdraw" render "$f" -o "$T/mag.svg" >/dev/null
    node "$T/post.mjs" "$W" "$T/mag.svg" "$OUT/$d.png" "$concept" >/dev/null
  done
done
echo rendered
