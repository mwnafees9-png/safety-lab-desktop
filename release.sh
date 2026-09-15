#!/usr/bin/env bash
# Desktop release. REBUILT 6 Sep 2026. Each step gates the next:
#   pull-web.sh (web clean + web wall + stripped build + smoke) → desktop wall (tests/*.test.js,
#   which also verifies the pulled bundle) → electron-builder → (optional) publish to updates.safetylabaero.com/desktop/.
#
#   ./release.sh            # build only (dist/)
#   ./release.sh --publish  # build + publish installers
#   ./release.sh --win      # Windows build instead of macOS
#
# Code signing: no Apple certificate yet; Mac builds are ad-hoc signed (afterPack.js). Whether THIS
# build is signed is stamped into app/BUILD_INFO.json as codeSigned.mac (from CSC_LINK) and the app
# reads it at runtime to decide its update policy (shell_rules.autoUpdatePolicy): Windows auto-updates
# regardless (manifest signature + sha512 chain); Mac auto-updates only when signed, because
# electron-updater refuses to update an unsigned Mac app. When the certificate exists: set
# CSC_LINK/CSC_KEY_PASSWORD (+ APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID for notarization)
# and this script needs no other change.
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

echo "── stamp code-signing state into BUILD_INFO ─────────"
MAC_SIGNED=false; [ -n "${CSC_LINK:-}" ] && MAC_SIGNED=true
node -e '
const fs=require("fs"),p="app/BUILD_INFO.json";const b=JSON.parse(fs.readFileSync(p,"utf8"));
b.codeSigned={mac:process.argv[1]==="true",win:!!process.env.WIN_CSC_LINK};
fs.writeFileSync(p,JSON.stringify(b,null,2));console.log("codeSigned",JSON.stringify(b.codeSigned));
' "$MAC_SIGNED"

echo "── package ──────────────────────────────────────────"
if [ "$WIN" = "1" ]; then npx electron-builder --win --x64; else CSC_IDENTITY_AUTO_DISCOVERY="${CSC_IDENTITY_AUTO_DISCOVERY:-false}" npx electron-builder --mac; fi

if [ "$PUBLISH" = "1" ]; then
  echo "── publish ──────────────────────────────────────────"
  bash "$HERE/publish-desktop.sh"
fi
echo "Release build complete: $(node -p "require('./package.json').version")"
