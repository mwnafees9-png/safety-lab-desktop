#!/usr/bin/env bash
# Publish the built macOS installers + auto-update manifest to the R2 bucket that backs
# https://updates.safetylabaero.com/desktop/  (bucket: safetylab-downloads, key prefix: desktop/).
#
# Run AFTER building, e.g.:   npm run release        (sync + build + this script)
#                       or:   npm run dist:mac && bash publish-desktop.sh
#
# Auth: uses your logged-in wrangler session (run `wrangler login` once). Uploads the version
# from package.json. The .dmg names are version-agnostic (the website link never changes); the
# .zip names carry the version and are what electron-updater pulls via latest-mac.yml.
set -euo pipefail

# A stale CLOUDFLARE_API_TOKEN exported in your shell shadows your `wrangler login` session and
# fails uploads with "Invalid access token". Clear it here so these uploads use the OAuth login.
# (If you intentionally use a valid API token, delete this line.)
unset CLOUDFLARE_API_TOKEN CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL 2>/dev/null || true

HERE="$(cd "$(dirname "$0")" && pwd)"
DIST="$HERE/dist"
BUCKET="safetylab-downloads"
PREFIX="desktop"
VERSION="$(node -p "require('$HERE/package.json').version")"

echo "Publishing Safety Lab Aero desktop v$VERSION  →  r2://$BUCKET/$PREFIX/"

# --- REFUSE a stale feed (15 Sep 2026). This script uploads and SIGNS whatever dist/latest*.yml it
#     finds. Twice tonight the Windows build had not run, dist/latest.yml still said 0.15.0 from
#     August, and the publish went ahead: the August installer was re-uploaded and the August
#     manifest was freshly signed as current, under our key. A warning in the build script did not
#     stop it. Only a refusal here can. Every manifest present in dist/ must carry package.json's
#     version, and every payload a manifest names must exist beside it, or nothing is published.
STALE=0
for y in latest-mac.yml latest.yml latest-linux.yml; do
  [ -f "$DIST/$y" ] || continue
  MV="$(sed -n 's/^version:[[:space:]]*//p' "$DIST/$y" | head -1 | tr -d "'\"")"
  if [ "$MV" != "$VERSION" ]; then
    echo "  REFUSED: $y says version $MV but package.json says $VERSION" >&2
    echo "    that manifest is from an old build. Build this platform first (build-win-docker.sh / release.sh)." >&2
    STALE=1
  fi
  for u in $(sed -n 's/^[[:space:]]*-[[:space:]]*url:[[:space:]]*//p' "$DIST/$y" | tr -d "'\"" | tr ' ' '\001'); do
    f="$(printf '%s' "$u" | tr '\001' ' ')"
    if [ ! -f "$DIST/$f" ]; then
      echo "  REFUSED: $y names '$f' but dist/ has no such file" >&2
      STALE=1
    fi
  done
done
[ "$STALE" = "0" ] || { echo "Nothing published. Fix the build, then run this again." >&2; exit 1; }

# --- CACHE LIFETIME (16 Sep 2026). Two kinds of object live in this bucket and they need
#     opposite caching:
#
#       VERSION-NAMED  "Safety Lab Aero-0.18.1-arm64-mac.zip" — the bytes behind that name never
#                      change, so cache them forever.
#       FIXED-NAME     SafetyLabAero-mac-arm64.dmg, the blockmaps, latest*.yml and their .sig —
#                      the NAME stays put while the CONTENT changes every release. These are what
#                      the website download buttons and electron-updater point at.
#
#     Nothing set Cache-Control at all, so Cloudflare applied its zone default of four hours to
#     everything. On the 0.18.1 release that meant the site served the 0.18.0 Apple Silicon .dmg
#     for hours after a SUCCESSFUL publish: the download button handed out the build whose export
#     and import were broken, which is the exact thing 0.18.1 fixed. A stale latest.yml is the
#     same risk for auto-update.
#
#     This only bites if the zone's Browser Cache TTL is "Respect Existing Headers". If it is
#     pinned to a fixed value Cloudflare overrides us, and the check at the end will say so.
cache_control_for () {  # <basename>
  case "$1" in
    *[0-9].[0-9]*.[0-9]*) echo "public, max-age=31536000, immutable" ;;   # version in the name
    *)                    echo "public, max-age=60, must-revalidate" ;;   # name reused every release
  esac
}

put () {  # <local file> <content-type>
  local f="$1" ct="$2" tries=0 max=5 cc
  if [ ! -f "$f" ]; then echo "  SKIP (missing): $(basename "$f")"; return 0; fi
  cc="$(cache_control_for "$(basename "$f")")"
  echo "  ↑ $(basename "$f")  ($(du -h "$f" | cut -f1))  [$cc]"
  # Large DMGs/zips (~100 MB) over wifi occasionally drop mid-PUT ("fetch failed").
  # Retry with backoff so one transient network blip doesn't abort the whole release.
  until wrangler r2 object put "$BUCKET/$PREFIX/$(basename "$f")" --file="$f" --content-type="$ct" --cache-control="$cc" --remote; do
    tries=$((tries + 1))
    if [ "$tries" -ge "$max" ]; then echo "  ✗ giving up on $(basename "$f") after $max attempts" >&2; return 1; fi
    echo "  … upload dropped — retry $tries/$max in $((tries * 5))s"
    sleep $((tries * 5))
  done
}

# --- Website download targets (stable, version-agnostic names) + blockmaps ---
put "$DIST/SafetyLabAero-mac-arm64.dmg"          "application/x-apple-diskimage"
put "$DIST/SafetyLabAero-mac-arm64.dmg.blockmap" "application/octet-stream"
put "$DIST/SafetyLabAero-mac-x64.dmg"            "application/x-apple-diskimage"
put "$DIST/SafetyLabAero-mac-x64.dmg.blockmap"   "application/octet-stream"

# --- macOS auto-update payloads (electron-updater uses the zips referenced by latest-mac.yml) ---
put "$DIST/Safety Lab Aero-$VERSION-arm64-mac.zip"          "application/zip"
put "$DIST/Safety Lab Aero-$VERSION-arm64-mac.zip.blockmap" "application/octet-stream"
put "$DIST/Safety Lab Aero-$VERSION-mac.zip"                "application/zip"
put "$DIST/Safety Lab Aero-$VERSION-mac.zip.blockmap"       "application/octet-stream"

# --- Windows (auto-skipped on a mac-only build — `put` no-ops on missing files). The NSIS .exe is
#     BOTH the website download AND the electron-updater payload (referenced by latest.yml). ---
put "$DIST/SafetyLabAero-win-x64.exe"          "application/octet-stream"
put "$DIST/SafetyLabAero-win-x64.exe.blockmap" "application/octet-stream"
put "$DIST/Safety Lab Aero-$VERSION-win.zip"   "application/zip"

# --- Sign the update manifests (S24) so the desktop app trusts them independently of this host.
#     The private key lives only on your Mac (~/.safetylab/update_signing_key.pem, created by
#     `node tools/update-signing/sign-manifest.mjs keygen`). The app REQUIRES a valid signature, so
#     refuse to publish an unsigned feed rather than silently break updates for everyone. ---
if [ ! -f "$HOME/.safetylab/update_signing_key.pem" ]; then
  echo "  ERROR: no update-signing key at ~/.safetylab/update_signing_key.pem" >&2
  echo "    run once:  node tools/update-signing/sign-manifest.mjs keygen   then paste the public key into update_verify.js and rebuild" >&2
  exit 1
fi
for y in latest-mac.yml latest.yml latest-linux.yml; do
  [ -f "$DIST/$y" ] || continue
  node "$HERE/tools/update-signing/sign-manifest.mjs" sign "$DIST/$y"
done

# --- Update-manifest signatures FIRST (a client that gets a new .yml must find its .sig) ---
put "$DIST/latest-mac.yml.sig" "text/plain"
put "$DIST/latest.yml.sig"     "text/plain"

# --- Update manifests LAST, so clients never fetch one before its payloads exist ---
put "$DIST/latest-mac.yml" "text/yaml"
put "$DIST/latest.yml"     "text/yaml"

# --- VERIFY WHAT THE EDGE SERVES (16 Sep 2026). Uploading is not publishing. On 0.18.1 every
#     upload succeeded and the site still served the previous build, because a copy cached at
#     Cloudflare's edge outlived the new object. Nothing here noticed; it was caught by hand
#     afterwards. So the script looks now: for each fixed-name file it compares the byte count the
#     edge returns against the file on disk. A mismatch is NOT fatal, the bytes in R2 are correct,
#     but it means a purge is needed before anyone is pointed at the download page.
echo
echo "── verifying what the edge actually serves ──────────"
BASE="https://updates.safetylabaero.com/$PREFIX"
STALE=""
UNCHECKED=""
for f in SafetyLabAero-mac-arm64.dmg SafetyLabAero-mac-x64.dmg SafetyLabAero-win-x64.exe latest-mac.yml latest.yml; do
  [ -f "$DIST/$f" ] || continue
  want="$(wc -c < "$DIST/$f" | tr -d ' ')"
  got="$(curl -sSI -m 60 "$BASE/$f" 2>/dev/null | tr -d '\r' | awk 'tolower($1)=="content-length:"{print $2}')"
  if [ -z "$got" ]; then
    # Could not reach the edge at all. That is a network problem here, NOT evidence of a stale
    # cache, and telling someone to purge URLs that are fine wastes their time and their trust
    # in this check. Say what actually happened.
    printf "  ?      %-32s could not reach the edge to check\n" "$f"
    UNCHECKED="$UNCHECKED $f"
  elif [ "$got" = "$want" ]; then
    printf "  OK     %-32s %s bytes\n" "$f" "$want"
  else
    printf "  STALE  %-32s edge=%s  expected=%s\n" "$f" "$got" "$want"
    STALE="$STALE  $BASE/$f
"
  fi
done
if [ -n "$UNCHECKED" ]; then
  echo
  echo "  Could not check:$UNCHECKED"
  echo "  The upload itself succeeded. Re-check by hand before announcing the download links."
fi
if [ -n "$STALE" ]; then
  echo
  echo "  The upload is fine, R2 holds the new bytes. Cloudflare's edge is still serving the old"
  echo "  ones. Purge these before pointing anyone at the download page:"
  echo "    dashboard > safetylabaero.com > Caching > Configuration > Purge Custom URLs"
  echo
  printf "%s" "$STALE"
  echo
fi

echo "Done. Live at:"
echo "  Apple Silicon : https://updates.safetylabaero.com/$PREFIX/SafetyLabAero-mac-arm64.dmg"
echo "  Intel         : https://updates.safetylabaero.com/$PREFIX/SafetyLabAero-mac-x64.dmg"
echo "  Windows       : https://updates.safetylabaero.com/$PREFIX/SafetyLabAero-win-x64.exe"
echo "  Update feeds  : .../latest-mac.yml + .../latest.yml  (v$VERSION)"
