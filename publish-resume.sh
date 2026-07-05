#!/usr/bin/env bash
# Resume-aware R2 publisher for flaky connections.
#
# Differences from publish-desktop.sh:
#   * SKIPS any file whose byte size already matches the object at
#     https://updates.safetylabaero.com/desktop/<name>  (no wasted re-uploads)
#   * a failed file does NOT abort the run — it moves on and comes back,
#     looping up to MAX_ROUNDS times until everything payload is up
#   * the update manifests (latest-mac.yml / latest.yml) upload ONLY after
#     every payload they reference is confirmed in the bucket
#
# Run:  bash publish-resume.sh
set -uo pipefail

unset CLOUDFLARE_API_TOKEN CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL 2>/dev/null || true

HERE="$(cd "$(dirname "$0")" && pwd)"
DIST="$HERE/dist"
BUCKET="safetylab-downloads"
PREFIX="desktop"
BASE="https://updates.safetylabaero.com/$PREFIX"
VERSION="$(node -p "require('$HERE/package.json').version")"
MAX_ROUNDS=6

echo "Resumable publish — Safety Lab Aero desktop v$VERSION → r2://$BUCKET/$PREFIX/"

remote_size () {  # <basename> → content-length or empty
  curl -sI --max-time 20 "$BASE/$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$1")?cb=$(date +%s)" \
    | tr -d '\r' | awk 'tolower($1)=="content-length:"{print $2}'
}

up_to_date () {  # <local file> → 0 if remote size matches local
  local f="$1" want got
  want=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f")
  got=$(remote_size "$(basename "$f")")
  [ -n "$got" ] && [ "$got" = "$want" ]
}

put_once () {  # <local file> <content-type> → wrangler exit code
  wrangler r2 object put "$BUCKET/$PREFIX/$(basename "$1")" --file="$1" --content-type="$2" --remote
}

# --- payloads (order: small first so quick wins land early) ---------------
PAYLOADS=(
  "$DIST/SafetyLabAero-mac-arm64.dmg.blockmap|application/octet-stream"
  "$DIST/SafetyLabAero-mac-x64.dmg.blockmap|application/octet-stream"
  "$DIST/Safety Lab Aero-$VERSION-arm64-mac.zip.blockmap|application/octet-stream"
  "$DIST/Safety Lab Aero-$VERSION-mac.zip.blockmap|application/octet-stream"
  "$DIST/SafetyLabAero-mac-arm64.dmg|application/x-apple-diskimage"
  "$DIST/SafetyLabAero-mac-x64.dmg|application/x-apple-diskimage"
  "$DIST/Safety Lab Aero-$VERSION-arm64-mac.zip|application/zip"
  "$DIST/Safety Lab Aero-$VERSION-mac.zip|application/zip"
  "$DIST/SafetyLabAero-win-x64.exe|application/octet-stream"
  "$DIST/SafetyLabAero-win-x64.exe.blockmap|application/octet-stream"
  "$DIST/Safety Lab Aero-$VERSION-win.zip|application/zip"
)

round=0
while : ; do
  round=$((round + 1))
  pending=0
  echo ""
  echo "── Round $round ──────────────────────────────────────────"
  for entry in "${PAYLOADS[@]}"; do
    f="${entry%%|*}" ; ct="${entry##*|}"
    [ -f "$f" ] || { echo "  skip (not built): $(basename "$f")"; continue; }
    if up_to_date "$f"; then
      echo "  ✓ already up  : $(basename "$f")"
      continue
    fi
    echo "  ↑ uploading   : $(basename "$f")  ($(du -h "$f" | cut -f1))"
    if put_once "$f" "$ct"; then
      echo "  ✓ done        : $(basename "$f")"
    else
      echo "  ✗ dropped     : $(basename "$f") — will retry next round"
      pending=$((pending + 1))
    fi
  done
  [ "$pending" -eq 0 ] && break
  if [ "$round" -ge "$MAX_ROUNDS" ]; then
    echo ""
    echo "Gave up after $MAX_ROUNDS rounds with $pending file(s) still pending."
    echo "Manifests were NOT uploaded — the live update feed is untouched and consistent."
    exit 1
  fi
  echo "  … $pending file(s) pending — next round in 10s"
  sleep 10
done

# --- manifests LAST, only now that every payload is verified present -------
echo ""
echo "All payloads confirmed. Publishing manifests…"
for m in "$DIST/latest-mac.yml" "$DIST/latest.yml"; do
  [ -f "$m" ] || continue
  until put_once "$m" "text/yaml"; do echo "  … manifest retry in 5s"; sleep 5; done
  echo "  ✓ $(basename "$m")"
done

echo ""
echo "Done. v$VERSION live at $BASE/SafetyLabAero-mac-arm64.dmg (+x64, win)."
