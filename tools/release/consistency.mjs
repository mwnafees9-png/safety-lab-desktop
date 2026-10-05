#!/usr/bin/env node
/*
 * Release consistency gate (5 Oct 2026). Run by publish-desktop.sh before anything is uploaded.
 *
 * Why: on 5 Oct `npm run release` built only the Mac app, at the version already live (0.18.5).
 * The stale-feed check passed, because dist/latest.yml also said 0.18.5, so the publish re-signed
 * the 13:27 Windows build as current while the Mac app carried a newer web build. Windows users
 * (Radia's engineers among them) would have installed a different Safety Lab from Mac users, and
 * Macs that already had 0.18.5 were never offered the new one. Nothing warned.
 *
 * Refuses unless:
 *   1. every platform being published was PACKAGED (read from inside each app.asar) with the same
 *      web build (BUILD_INFO webCommit + file manifest) and with package.json's version;
 *   2. a Windows build is present (a Mac-only publish needs SLAB_PUBLISH_MAC_ONLY=1, said out loud);
 *   3. the version is not already live with different contents (a re-run of the same release,
 *      byte for byte, is allowed, so a publish that dropped half way can be resumed).
 *
 *   node tools/release/consistency.mjs <dist-dir> <version>
 * Test hooks: SLAB_LIVE_DIR (read live manifests from a folder instead of the network).
 */
import fs from 'node:fs';
import path from 'node:path';

const [DIST, VERSION] = process.argv.slice(2);
const problems = [];
const say = (m) => console.log('  ' + m);
const refuse = (m) => problems.push(m);

function asarRead(asarPath, inner) {
  const fd = fs.openSync(asarPath, 'r');
  try {
    const head = Buffer.alloc(16); fs.readSync(fd, head, 0, 16, 0);
    const headerSize = head.readUInt32LE(4), jsonLen = head.readUInt32LE(12);
    const jb = Buffer.alloc(jsonLen); fs.readSync(fd, jb, 0, jsonLen, 16);
    let node = JSON.parse(jb.toString('utf8'));
    for (const part of inner.split('/')) { node = node && node.files && node.files[part]; }
    if (!node || node.size == null) return null;
    if (node.unpacked) return fs.readFileSync(path.join(asarPath + '.unpacked', inner), 'utf8');
    const buf = Buffer.alloc(node.size); fs.readSync(fd, buf, 0, node.size, 8 + headerSize + Number(node.offset));
    return buf.toString('utf8');
  } finally { fs.closeSync(fd); }
}
const manifestVersion = (txt) => ((/^version:\s*['"]?([^'"\s]+)/m.exec(txt || '') || [])[1]) || null;
const manifestHashes = (txt) => [...String(txt || '').matchAll(/sha512:\s*(\S+)/g)].map(m => m[1]).sort().join(',');

const PLATFORMS = [
  { name: 'Windows',            manifest: 'latest.yml',     asar: 'win-unpacked/resources/app.asar' },
  { name: 'Mac (Apple Silicon)', manifest: 'latest-mac.yml', asar: 'mac-arm64/Safety Lab Aero.app/Contents/Resources/app.asar' },
  { name: 'Mac (Intel)',         manifest: 'latest-mac.yml', asar: 'mac/Safety Lab Aero.app/Contents/Resources/app.asar' },
];

// 2. Windows must be in the release.
const hasWin = fs.existsSync(path.join(DIST, 'latest.yml'));
const hasMac = fs.existsSync(path.join(DIST, 'latest-mac.yml'));
if (!hasWin && process.env.SLAB_PUBLISH_MAC_ONLY !== '1') refuse('there is no Windows build in dist/ (no latest.yml). Build it first: ./release.sh --win. To publish Mac only on purpose, set SLAB_PUBLISH_MAC_ONLY=1.');
if (!hasMac && !hasWin) refuse('there is nothing to publish in dist/.');

// 1. Same web build and version inside every packaged app.
const builds = [];
for (const p of PLATFORMS) {
  if (!fs.existsSync(path.join(DIST, p.manifest))) continue;
  const a = path.join(DIST, p.asar);
  if (!fs.existsSync(a)) { refuse(p.name + ': ' + p.manifest + ' is present but the packaged app is not (' + p.asar + ').'); continue; }
  let info = null, pkg = null;
  try { info = JSON.parse(asarRead(a, 'app/BUILD_INFO.json') || 'null'); pkg = JSON.parse(asarRead(a, 'package.json') || 'null'); }
  catch (e) { refuse(p.name + ': could not read the packaged app (' + e.message + ').'); continue; }
  if (!info || !pkg) { refuse(p.name + ': the packaged app has no BUILD_INFO.json or package.json.'); continue; }
  const web = info.webCommit + ':' + JSON.stringify(info.manifest || {});
  builds.push({ name: p.name, version: pkg.version, webCommit: info.webCommit, web, pulledAt: info.pulledAt });
  if (pkg.version !== VERSION) refuse(p.name + ' was packaged as ' + pkg.version + ', but this release is ' + VERSION + '. Rebuild it.');
}
for (const b of builds) say(b.name.padEnd(20) + ' version ' + b.version + '  web ' + String(b.webCommit).slice(0, 7) + '  (pulled ' + String(b.pulledAt).slice(0, 16) + ')');
const webs = [...new Set(builds.map(b => b.web))];
if (webs.length > 1) refuse('the platforms carry different web builds (' + builds.map(b => b.name + ' ' + String(b.webCommit).slice(0, 7)).join(', ') + '). Rebuild them from the same web build, Windows first, then Mac, with nothing shipped in between.');

// 3. Never reuse a live version number for new contents.
async function live(name) {
  if (process.env.SLAB_LIVE_DIR) { const f = path.join(process.env.SLAB_LIVE_DIR, name); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; }
  const r = await fetch('https://updates.safetylabaero.com/desktop/' + name + '?nocache=' + Date.now(), { signal: AbortSignal.timeout(30000) });
  if (r.status === 404) return '';
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}
for (const m of ['latest.yml', 'latest-mac.yml']) {
  if (!fs.existsSync(path.join(DIST, m))) continue;
  let txt;
  try { txt = await live(m); } catch (e) { refuse('could not read the live ' + m + ' to check the version (' + e.message + '). Check the connection and run again.'); continue; }
  const lv = manifestVersion(txt);
  if (lv === VERSION && manifestHashes(txt) !== manifestHashes(fs.readFileSync(path.join(DIST, m), 'utf8')))
    refuse(VERSION + ' is already live in ' + m + ' with different contents. Installed copies would never be offered this build. Raise the version in package.json and rebuild.');
  else say(m.padEnd(16) + ' live ' + (lv || 'none') + ', publishing ' + VERSION + (lv === VERSION ? ' (same contents: resuming)' : ''));
}

if (problems.length) {
  for (const p of problems) console.error('  REFUSED: ' + p);
  console.error('Nothing published.');
  process.exit(1);
}
console.log('  release is consistent: one version, one web build' + (hasWin ? ', Windows and Mac together' : ', Mac only (asked for)'));
