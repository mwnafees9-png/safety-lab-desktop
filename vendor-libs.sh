#!/usr/bin/env bash
# One-time: fetch the 4 runtime libraries the SPA used from CDNs and copy them into
# vendor-libs/ so the desktop build can run with NO internet (air-gap). Run this once on a
# machine WITH internet; the resulting bundle is then fully offline-capable.
#
#   bash vendor-libs.sh
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="$HERE/vendor-libs"
mkdir -p "$DEST"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
npm init -y >/dev/null 2>&1

echo "Fetching libraries via npm (needs internet)…"
npm install --no-audit --no-fund --loglevel=error \
  d3@7 chart.js@4 vis-network@9.1.9 @supabase/supabase-js@2

copy() {
  if [ -f "$1" ]; then cp "$1" "$2"; echo "  OK  $(basename "$2")  ($(wc -c < "$2") bytes)"; \
  else echo "  MISSING: $1" >&2; exit 1; fi
}

echo "Copying dist files -> vendor-libs/"
copy "$TMP/node_modules/d3/dist/d3.min.js"                          "$DEST/d3.v7.min.js"
copy "$TMP/node_modules/chart.js/dist/chart.umd.js"                 "$DEST/chart.umd.min.js"
if [ -f "$TMP/node_modules/vis-network/dist/vis-network.min.js" ]; then
  copy "$TMP/node_modules/vis-network/dist/vis-network.min.js"      "$DEST/vis-network.min.js"
else
  copy "$TMP/node_modules/vis-network/standalone/umd/vis-network.min.js" "$DEST/vis-network.min.js"
fi
copy "$TMP/node_modules/@supabase/supabase-js/dist/umd/supabase.js" "$DEST/supabase.min.js"

echo "Done. vendor-libs/ populated. Next: bash sync-app.sh"
