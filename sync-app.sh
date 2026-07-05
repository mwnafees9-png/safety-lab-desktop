#!/usr/bin/env bash
# Rebuild app/ from the web source bundle + vendored libraries.
# Run this whenever the web app (../safety-lab-deploy/site) changes.
#
#   bash sync-app.sh                 # uses ../safety-lab-deploy/site
#   bash sync-app.sh /path/to/site   # custom source
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="${1:-$HERE/../safety-lab-deploy/site}"
APP="$HERE/app"
VENDOR_SRC="$HERE/vendor-libs"

if [ ! -d "$SRC" ]; then
  echo "ERROR: source bundle not found at: $SRC" >&2
  exit 1
fi
if [ ! -d "$VENDOR_SRC" ] || [ -z "$(ls -A "$VENDOR_SRC" 2>/dev/null || true)" ]; then
  echo "ERROR: vendor-libs/ is empty. Populate it with the 4 libraries first" >&2
  echo "       (d3.v7.min.js, chart.umd.min.js, vis-network.min.js, supabase.min.js)." >&2
  exit 1
fi

echo "Source bundle : $SRC"
echo "Rebuilding    : $APP"

rm -rf "$APP"
mkdir -p "$APP/vendor"

# Copy the web bundle (everything the SPA needs at runtime).
cp -R "$SRC"/. "$APP"/

# Drop vendored libraries in place.
cp -R "$VENDOR_SRC"/. "$APP/vendor"/

# Rewrite CDN <script> tags to the local vendored copies.
python3 "$HERE/patch-index.py" "$APP/index.html"

echo "Done. app/ is ready (offline-capable)."
