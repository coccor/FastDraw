#!/usr/bin/env bash
# Round 2: render each concept look, then post-process its signature. Usage: render-r2.sh <worktree>
set -euo pipefail
W="$1"; C="$W/looks/candidates"; OUT="$C/mock2"; SRC="$C/mock-src"; T="$(dirname "$0")"
mkdir -p "$OUT"
for concept in source bolt stack; do
  for d in high-level state bar; do
    f="$SRC/$d-r2-$concept.fdraw"
    { echo "look \"../r2-$concept.look\""; sed 's/title.color=#ffffff/title.color=ground/g' "$W/examples/trial/$d.fdraw"; } > "$f"
    if [ "$concept" = source ]; then
      # every box wears its own id as a handle
      sed -i -E '/ tag=/! s/^([a-z_0-9]+):( +)(node|focal|cloud|external|optional|step|terminal|terminal-focal|decision) (.*)$/\1:\2\3 \4 tag="\1"/' "$f"
    fi
    "$W/bin/fastdraw" render "$f" -o "$T/r2.svg" >/dev/null
    node "$T/post.mjs" "$W" "$T/r2.svg" "$OUT/$d-$concept.png" "$concept"
  done
done
