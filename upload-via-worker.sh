#!/usr/bin/env bash
# Chunked upload to R2 through the site Worker's /api/upload route (D-PUB).
# 25MB parts with per-part retry — built for connections where single
# ~100MB+ PUTs never survive.
#
# Usage:
#   export UPLOAD_TOKEN='the secret you set with: wrangler secret put UPLOAD_TOKEN'
#   bash upload-via-worker.sh dist/SafetyLabAero-mac-x64.dmg
#   bash upload-via-worker.sh "dist/Safety Lab Aero-0.10.1-mac.zip"
#
# The remote key is desktop/<basename of the file>. Content-type inferred.
set -euo pipefail

API="https://safetylabaero.com/api/upload"
PART_BYTES=$((5 * 1024 * 1024))
MAX_TRIES=25

[ -n "${UPLOAD_TOKEN:-}" ] || { echo "ERROR: set UPLOAD_TOKEN env var first." >&2; exit 1; }
FILE="${1:-}"
[ -f "$FILE" ] || { echo "ERROR: file not found: $FILE" >&2; exit 1; }

NAME="$(basename "$FILE")"
case "$NAME" in
  *.dmg) CT="application/x-apple-diskimage" ;;
  *.zip) CT="application/zip" ;;
  *.yml) CT="text/yaml" ;;
  *)     CT="application/octet-stream" ;;
esac
KEY="desktop/$NAME"
ENC_KEY="$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1], safe='/'))" "$KEY")"
SIZE=$(stat -f%z "$FILE" 2>/dev/null || stat -c%s "$FILE")

echo "Uploading $NAME ($((SIZE / 1048576)) MB) → r2:$KEY in $((PART_BYTES / 1048576))MB parts"

# --- split into parts -------------------------------------------------------
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
split -b "$PART_BYTES" "$FILE" "$TMP/part_"

# --- create the multipart upload -------------------------------------------
CREATE=$(curl -sf --max-time 30 -X POST -H "x-upload-token: $UPLOAD_TOKEN" \
  "$API?action=create&key=$ENC_KEY&ct=$CT")
UPLOAD_ID=$(python3 -c "import json,sys;print(json.loads(sys.argv[1])['uploadId'])" "$CREATE")
echo "  uploadId: ${UPLOAD_ID:0:18}…"

# --- upload each part with retry --------------------------------------------
PARTS_JSON="["
N=0
for P in "$TMP"/part_*; do
  N=$((N + 1))
  tries=0
  while : ; do
    tries=$((tries + 1))
    HTTP=$(curl -s -o "$TMP/resp.json" -w "%{http_code}" --max-time 180 -X PUT -H "x-upload-token: $UPLOAD_TOKEN" \
      --data-binary @"$P" \
      "$API?action=part&key=$ENC_KEY&uploadId=$UPLOAD_ID&part=$N" 2>"$TMP/err.txt") || HTTP="net"
    if [ "$HTTP" = "200" ]; then RESP=$(cat "$TMP/resp.json"); break; fi
    REASON="$HTTP"
    [ "$HTTP" = "net" ] && REASON="network: $(tail -c 80 "$TMP/err.txt" 2>/dev/null | tr -d '\n')"
    [ "$HTTP" != "net" ] && [ -s "$TMP/resp.json" ] && REASON="$HTTP: $(head -c 100 "$TMP/resp.json")"
    if [ "$tries" -ge "$MAX_TRIES" ]; then
      echo "  ✗ part $N failed $MAX_TRIES times — aborting upload" >&2
      curl -s -X POST -H "x-upload-token: $UPLOAD_TOKEN" \
        "$API?action=abort&key=$ENC_KEY&uploadId=$UPLOAD_ID" > /dev/null || true
      exit 1
    fi
    echo "  … part $N dropped ($REASON) — retry $tries/$MAX_TRIES in 3s"
    sleep 3
  done
  ETAG=$(python3 -c "import json,sys;print(json.loads(sys.argv[1])['etag'])" "$RESP")
  echo "  ✓ part $N/$(ls "$TMP"/part_* | wc -l | tr -d ' ')  etag ${ETAG:0:12}…"
  [ "$N" -gt 1 ] && PARTS_JSON="$PARTS_JSON,"
  PARTS_JSON="$PARTS_JSON{\"partNumber\":$N,\"etag\":\"$ETAG\"}"
done
PARTS_JSON="$PARTS_JSON]"

# --- complete ----------------------------------------------------------------
DONE=$(curl -sf --max-time 60 -X POST -H "x-upload-token: $UPLOAD_TOKEN" \
  -H "content-type: application/json" --data "$PARTS_JSON" \
  "$API?action=complete&key=$ENC_KEY&uploadId=$UPLOAD_ID")
echo "  assembled: $DONE"

# --- verify ------------------------------------------------------------------
GOT=$(curl -sI --max-time 20 "https://updates.safetylabaero.com/$ENC_KEY?cb=$(date +%s)" | tr -d '\r' | awk 'tolower($1)=="content-length:"{print $2}')
if [ "$GOT" = "$SIZE" ]; then
  echo "✓ verified: remote size matches ($SIZE bytes). $NAME is live."
else
  echo "⚠ remote size $GOT ≠ local $SIZE — check before publishing manifests." >&2
  exit 1
fi
