#!/usr/bin/env bash
# Build the Windows installer (.exe) on macOS using electron-builder's official Wine container.
# macOS can't build an NSIS installer natively; this image has Wine + the Windows toolchain ready.
# This is the Windows sibling of release.sh and gates the build the same way it does.
#
#   bash build-win-docker.sh      # → dist/SafetyLabAero-win-x64.exe (+ latest.yml)
#   bash publish-desktop.sh       # then upload to R2 (handles the Windows files + signs both feeds)
#
# ORDER MATTERS: publish-desktop.sh uploads AND SIGNS whatever latest.yml is in dist/. Build the
# Windows installer BEFORE the single publish, or the stale Windows feed goes out signed as current.
#
# Requires Docker Desktop installed AND running.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

[ "${SKIP_WALL:-0}" = "1" ] && { echo "SKIP_WALL is set — refusing to build an unproven installer."; exit 1; }

if ! command -v docker >/dev/null 2>&1; then
  echo "✗ Docker not found. Install Docker Desktop (https://www.docker.com/products/docker-desktop), start it, then re-run." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "✗ Docker is installed but not running. Open Docker Desktop, wait until it shows 'running', then re-run." >&2
  exit 1
fi

# 1) Regenerate app/ from the web source on the HOST — the container doesn't mount ../safety-lab-deploy.
#    (6 Sep 2026: this used to call sync-app.sh, which the shell rebuild DELETED — it copied readable
#    source, prompts and all, into the installer. pull-web.sh is the replacement: web tree clean +
#    web wall + build.sh + smoke gate + STRIPPED dist → app/ + BUILD_INFO.json.)
echo "── pull web build (host) ────────────────────────────"
bash "$HERE/pull-web.sh"

# 2) Desktop wall on the HOST — verifies the shell rules AND the bundle that was just pulled.
echo "── desktop wall (host) ──────────────────────────────"
FAILS=0
for t in tests/*.test.js; do
  [ -e "$t" ] || continue
  if ! node "$t"; then FAILS=$((FAILS + 1)); fi
done
[ "$FAILS" = "0" ] || { echo "NOT BUILDING — $FAILS desktop suite(s) failed."; exit 1; }
echo "DESKTOP WALL GREEN"

# 3) Build the Windows installer inside the Wine container. A NAMED volume holds the container's
#    Linux node_modules so it never clobbers your Mac's node_modules (your local mac build keeps working).
echo "── package for Windows (Wine container) ─────────────"
echo "   (first run pulls the ~2 GB image)"
docker run --rm \
  -v "$HERE":/project \
  -v slabwin-node-modules:/project/node_modules \
  -v "$HOME/.cache/electron":/root/.cache/electron \
  -v "$HOME/.cache/electron-builder":/root/.cache/electron-builder \
  electronuserland/builder:wine \
  /bin/bash -lc "npm install --no-audit --no-fund && npx electron-builder --win --x64"

VERSION="$(node -p "require('$HERE/package.json').version")"
echo
echo "✓ Windows build complete: v$VERSION"
ls -lh "$HERE/dist/SafetyLabAero-win-x64.exe" "$HERE/dist/latest.yml" 2>/dev/null || echo "  (check dist/ — expected SafetyLabAero-win-x64.exe + latest.yml)"
if [ -f "$HERE/dist/latest.yml" ]; then
  FEED="$(grep -m1 '^version:' "$HERE/dist/latest.yml" | awk '{print $2}')"
  [ "$FEED" = "$VERSION" ] || echo "  ⚠ dist/latest.yml says $FEED but package.json says $VERSION — do NOT publish until they match."
fi
echo
echo "Next:  bash publish-desktop.sh     # uploads mac + windows, signs both update feeds"
