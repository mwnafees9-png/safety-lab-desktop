#!/usr/bin/env bash
# Pull the web bundle into app/ — the SAME build the web's wall passed. REBUILT 6 Sep 2026.
#
# The old sync-app.sh copied the READABLE source (site/) — every AI prompt and every
# "Confidential / Patent pending" comment shipped inside the installer — and it copied
# whatever happened to be on disk, committed or not, tested or not. This script refuses that:
#
#   1. the web tree must be CLEAN (every change committed) — the desktop ships only what git holds
#   2. the web WALL must be green (ship.sh --dry: tests + eval, no build, no deploy)
#   3. the STRIPPED build (build.sh → dist/) is what gets copied, never site/
#   4. the runtime smoke gate must pass on that dist (same gate ship.sh uses before a deploy)
#   5. CDN scripts are rewritten to the vendored copies (offline / air-gap)
#   6. app/BUILD_INFO.json records the web commit + a checksum manifest, and the shell's own
#      license verifier is loaded from the pulled bundle to prove it is a current build
#
#   bash pull-web.sh                       # uses ../safety-lab-deploy
#   bash pull-web.sh /path/to/web/repo
#   SKIP_WALL=1 bash pull-web.sh           # dev only: skip step 2 (never for a release; release.sh forbids it)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WEB="${1:-$HERE/../safety-lab-deploy}"
APP="$HERE/app"
die() { echo "ERROR: $*" >&2; exit 1; }

[ -d "$WEB/site" ] || die "web repo not found at $WEB (expected site/ inside it)"
[ -x "$WEB/build.sh" ] || die "$WEB/build.sh missing"
[ -d "$HERE/vendor-libs" ] && [ -n "$(ls -A "$HERE/vendor-libs")" ] || die "vendor-libs/ is empty — run: bash vendor-libs.sh"

echo "── 1/6 web tree must be clean ───────────────────────"
if [ -n "$(git -C "$WEB" status --porcelain)" ]; then
  git -C "$WEB" status --short | head -20
  die "the web tree has uncommitted changes — commit them (or stash) first; the desktop ships committed builds only"
fi
WEB_COMMIT="$(git -C "$WEB" rev-parse HEAD)"
echo "   web commit $WEB_COMMIT"

echo "── 2/6 web wall ─────────────────────────────────────"
if [ "${SKIP_WALL:-0}" = "1" ]; then echo "   SKIPPED (SKIP_WALL=1 — dev only)"; else
  ( cd "$WEB" && ./ship.sh --dry ) || die "the web wall is not green — the desktop does not ship an unproven build"
fi

echo "── 3/6 stripped build ───────────────────────────────"
( cd "$WEB" && ./build.sh ) || die "build.sh failed"
[ -f "$WEB/dist/index.html" ] || die "dist/index.html missing after build"
[ -f "$WEB/dist/slab_license.js" ] || die "dist/slab_license.js missing — this web build predates the offline license; the desktop cannot ship it"
[ -f "$WEB/dist/slab_config.js" ] || die "dist/slab_config.js missing"

echo "── 4/6 runtime smoke gate on dist ───────────────────"
if [ "${SKIP_WALL:-0}" = "1" ]; then echo "   SKIPPED (SKIP_WALL=1 — dev only)"; else
  ( cd "$WEB" && node tools/smoke/smoke_gate.js ) || die "the runtime smoke gate is red on this build"
fi

echo "── 5/6 copy dist → app/ + vendored libraries ────────"
rm -rf "$APP"
mkdir -p "$APP/vendor"
cp -R "$WEB/dist/." "$APP"/
cp -R "$HERE/vendor-libs/." "$APP/vendor"/
python3 "$HERE/patch-index.py" "$APP/index.html"
find "$APP" -name '.DS_Store' -delete 2>/dev/null || true

echo "── 6/6 build info + verifier check ──────────────────"
node - "$APP" "$WEB_COMMIT" <<'NODE'
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const [app, commit] = process.argv.slice(2);
const files = fs.readdirSync(app).filter(f => /\.(js|html|css)$/.test(f)).sort();
const manifest = {};
for (const f of files) manifest[f] = crypto.createHash('md5').update(fs.readFileSync(path.join(app, f))).digest('hex');
const info = { webCommit: commit, pulledAt: new Date().toISOString(), fileCount: files.length, manifest };
fs.writeFileSync(path.join(app, 'BUILD_INFO.json'), JSON.stringify(info, null, 2));
const R = require(path.join(app, '..', 'shell_rules.js'));
const v = R.loadVerifier(app);
if (!v.keys.length) { console.error('ERROR: the pulled slab_license.js carries NO public key — refuse to ship'); process.exit(1); }
console.log('   BUILD_INFO.json written: ' + files.length + ' files, web ' + commit.slice(0, 10) + ', license keys: ' + v.keys.map(k => k.kid).join(', '));
NODE
echo "Done. app/ is the web build at $WEB_COMMIT (stripped, offline-capable)."
