#!/usr/bin/env bash
# Build the Windows installer (.exe) on macOS using electron-builder's official Wine container.
# macOS can't build an NSIS installer natively; this image has Wine + the Windows toolchain ready.
# Requires Docker Desktop installed AND running.
#
#   bash build-win-docker.sh      # → dist/SafetyLabAero-win-x64.exe (+ latest.yml)
#   bash publish-desktop.sh       # then upload to R2 (already handles the Windows files)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

if ! command -v docker >/dev/null 2>&1; then
  echo "✗ Docker not found. Install Docker Desktop (https://www.docker.com/products/docker-desktop), start it, then re-run." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "✗ Docker is installed but not running. Open Docker Desktop, wait until it shows 'running', then re-run." >&2
  exit 1
fi

# 1) Regenerate app/ from the web source on the HOST — the container doesn't mount ../safety-lab-deploy.
echo "→ Syncing app/ from the web bundle (host)…"
bash sync-app.sh

# 2) Build the Windows installer inside the Wine container. A NAMED volume holds the container's
#    Linux node_modules so it never clobbers your Mac's node_modules (your local mac build keeps working).
echo "→ Building Windows installer in the Wine container (first run pulls the ~2 GB image)…"
docker run --rm \
  -v "$HERE":/project \
  -v slabwin-node-modules:/project/node_modules \
  -v "$HOME/.cache/electron":/root/.cache/electron \
  -v "$HOME/.cache/electron-builder":/root/.cache/electron-builder \
  electronuserland/builder:wine \
  /bin/bash -lc "npm install --no-audit --no-fund && electron-builder --win --x64"

echo
echo "✓ Built (in dist/):"
ls -lh "$HERE/dist/SafetyLabAero-win-x64.exe" "$HERE/dist/latest.yml" 2>/dev/null || echo "  (check dist/ — expected SafetyLabAero-win-x64.exe + latest.yml)"
echo
echo "Next:  bash publish-desktop.sh                          # uploads the Windows files to R2"
echo "Then:  cd ../safety-lab-deploy && wrangler deploy        # publishes the site's Windows download button"
