#!/usr/bin/env bash
# Render the Studio look on several trial diagrams, with its mocked shadows and pills.
set -euo pipefail
W="$1"; C="$W/looks/candidates"; OUT="$C/studio"; SRC="$C/mock-src"; T="$(dirname "$0")"
mkdir -p "$OUT"
for d in high-level state bar swimlane process; do
  f="$SRC/$d-studio.fdraw"
  { echo "look \"../studio.look\""; sed -E 's/fill=ink stroke=none title.color=#ffffff/fill=#dde3ed stroke=none title.color=#2b3445/; s/fill=muted stroke=none title.color=#ffffff/fill=#e9edf3 stroke=none title.color=#4a5466/' "$W/examples/trial/$d.fdraw"; } > "$f"
  "$W/bin/fastdraw" check "$f" | grep -E " error " || true
  "$W/bin/fastdraw" render "$f" -o "$T/st.svg" >/dev/null
  node "$T/post.mjs" "$W" "$T/st.svg" "$OUT/$d.png" studio
done
rm -f "$OUT"/*.svg
