#!/usr/bin/env bash
# Desktop release. REBUILT 6 Sep 2026. Each step gates the next:
#   pull-web.sh (web clean + web wall + stripped build + smoke) → desktop wall (tests/*.test.js,
#   which also verifies the pulled bundle) → electron-builder → (optional) publish to updates.safetylabaero.com/desktop/.
#
#   ./release.sh            # build only (dist/)
#   ./release.sh --publish  # build + publish installers
#   ./release.sh --win      # Windows build instead of macOS
#
# Code signing: honest state — no Apple / Windows certificate yet. Builds are ad-hoc signed
# (afterPack.js) and updates are MANUAL in the app (main.js AUTO_UPDATE_SIGNED=false).
# When certificates exist: set CSC_LINK/CSC_KEY_PASSWORD (+ APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/
# APPLE_TEAM_ID for notarization), flip AUTO_UPDATE_SIGNED, and this script needs no change.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"
PUBLISH=0; WIN=0
for a in "$@"; do [ "$a" = "--publish" ] && PUBLISH=1; [ "$a" = "--win" ] && WIN=1; done
[ "${SKIP_WALL:-0}" = "1" ] && { echo "SKIP_WALL is set — refusing to release an unproven build."; exit 1; }

echo "── pull web build ───────────────────────────────────"
bash "$HERE/pull-web.sh"

echo "── desktop wall (verifies the shell AND the pulled bundle) ──"
FAILS=0
for t in tests/*.test.js; do
  [ -e "$t" ] || continue
  if ! node "$t"; then FAILS=$((FAILS + 1)); fi
done
[ "$FAILS" = "0" ] || { echo "NOT RELEASING — $FAILS desktop suite(s) failed."; exit 1; }
echo "DESKTOP WALL GREEN"

echo "── package ──────────────────────────────────────────"
if [ "$WIN" = "1" ]; then npx electron-builder --win --x64; else CSC_IDENTITY_AUTO_DISCOVERY="${CSC_IDENTITY_AUTO_DISCOVERY:-false}" npx electron-builder --mac; fi

if [ "$PUBLISH" = "1" ]; then
  echo "── publish ──────────────────────────────────────────"
  bash "$HERE/publish-desktop.sh"
fi
echo "Release build complete: $(node -p "require('./package.json').version")"
