#!/usr/bin/env node
/*
 * Regression: a desktop release is one version and one web build on every platform (5 Oct 2026).
 * Builds fake packaged apps (real asar layout) in a temp dist/ and runs tools/release/consistency.mjs
 * against stand-in live manifests. The first case is exactly what happened on 5 Oct.
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'release', 'consistency.mjs');

function writeAsar(file, entries) {             // entries: { 'app/BUILD_INFO.json': string, ... }
  const tree = { files: {} }; const blobs = []; let off = 0;
  for (const [k, v] of Object.entries(entries)) {
    const parts = k.split('/'); let n = tree;
    for (const p of parts.slice(0, -1)) n = (n.files[p] = n.files[p] || { files: {} });
    const b = Buffer.from(v); n.files[parts[parts.length - 1]] = { size: b.length, offset: String(off) }; off += b.length; blobs.push(b);
  }
  const json = Buffer.from(JSON.stringify(tree)); const al = Math.ceil(json.length / 4) * 4;
  const head = Buffer.alloc(16 + al); head.writeUInt32LE(4, 0); head.writeUInt32LE(8 + al, 4); head.writeUInt32LE(4 + al, 8); head.writeUInt32LE(json.length, 12); json.copy(head, 16);
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.concat([head, ...blobs]));
}
const yml = (v, h) => `version: ${v}\nfiles:\n  - url: x\n    sha512: ${h}\n    size: 1\n`;
function scenario({ win, mac, live }) {           // win/mac: { version, web, hash } or null
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'slrel-')), dist = path.join(d, 'dist'), ld = path.join(d, 'live');
  fs.mkdirSync(ld, { recursive: true });
  const app = (p, o) => writeAsar(path.join(dist, p), { 'package.json': JSON.stringify({ version: o.version }), 'app/BUILD_INFO.json': JSON.stringify({ webCommit: o.web, pulledAt: 'x', manifest: { 'a.js': o.web } }) });
  if (win) { app('win-unpacked/resources/app.asar', win); fs.writeFileSync(path.join(dist, 'latest.yml'), yml(win.version, win.hash)); }
  if (mac) { for (const m of ['mac-arm64', 'mac']) app(m + '/Safety Lab Aero.app/Contents/Resources/app.asar', mac); fs.writeFileSync(path.join(dist, 'latest-mac.yml'), yml(mac.version, mac.hash)); }
  for (const [k, v] of Object.entries(live || {})) fs.writeFileSync(path.join(ld, k), v);
  return { dist, ld, d };
}
function run(s, version, env) {
  const r = cp.spawnSync(process.execPath, [TOOL, s.dist, version], { encoding: 'utf8', env: Object.assign({}, process.env, { SLAB_LIVE_DIR: s.ld }, env || {}) });
  fs.rmSync(s.d, { recursive: true, force: true }); return { code: r.status, out: r.stdout + r.stderr };
}
const LIVE_0185 = { 'latest.yml': yml('0.18.5', 'WINOLD'), 'latest-mac.yml': yml('0.18.5', 'MACOLD') };

console.log('[1] 5 Oct: Mac rebuilt at the live version, Windows left from the afternoon');
let r = run(scenario({ win: { version: '0.18.5', web: 'dbf19db', hash: 'WINOLD' }, mac: { version: '0.18.5', web: '6939869', hash: 'MACNEW' }, live: LIVE_0185 }), '0.18.5');
check('refused', r.code === 1, r.out);
check('...because the platforms carry different web builds', /different web builds/.test(r.out));
check('...and because 0.18.5 is already live with other contents', /0\.18\.5 is already live in latest-mac\.yml with different contents/.test(r.out));

console.log('[2] Mac only, no Windows build at all');
r = run(scenario({ mac: { version: '0.18.6', web: 'aaa', hash: 'M' }, live: LIVE_0185 }), '0.18.6');
check('refused without saying so on purpose', r.code === 1 && /no Windows build/.test(r.out), r.out);
r = run(scenario({ mac: { version: '0.18.6', web: 'aaa', hash: 'M' }, live: LIVE_0185 }), '0.18.6', { SLAB_PUBLISH_MAC_ONLY: '1' });
check('allowed when SLAB_PUBLISH_MAC_ONLY=1 is set', r.code === 0, r.out);

console.log('[3] a platform packaged at the old version');
r = run(scenario({ win: { version: '0.18.5', web: 'aaa', hash: 'W' }, mac: { version: '0.18.6', web: 'aaa', hash: 'M' }, live: LIVE_0185 }), '0.18.6');
check('refused: Windows was packaged as 0.18.5', r.code === 1 && /Windows was packaged as 0\.18\.5/.test(r.out), r.out);

console.log('[4] the good release: new version, same web build, both platforms');
r = run(scenario({ win: { version: '0.18.6', web: 'aaa', hash: 'W' }, mac: { version: '0.18.6', web: 'aaa', hash: 'M' }, live: LIVE_0185 }), '0.18.6');
check('allowed', r.code === 0 && /one version, one web build, Windows and Mac together/.test(r.out), r.out);

console.log('[5] resuming a publish that dropped half way (same version, same contents live)');
r = run(scenario({ win: { version: '0.18.6', web: 'aaa', hash: 'W' }, mac: { version: '0.18.6', web: 'aaa', hash: 'M' }, live: { 'latest.yml': yml('0.18.6', 'W'), 'latest-mac.yml': yml('0.18.5', 'X') } }), '0.18.6');
check('allowed', r.code === 0 && /same contents: resuming/.test(r.out), r.out);

console.log('[6] publish-desktop.sh runs the gate before uploading anything');
const pub = fs.readFileSync(path.join(ROOT, 'publish-desktop.sh'), 'utf8');
const gate = pub.indexOf('tools/release/consistency.mjs'), firstPut = pub.indexOf('\nput "');
check('the gate is called, and exits on refusal', gate > 0 && /consistency\.mjs" "\$DIST" "\$VERSION" \|\| exit 1/.test(pub));
check('...before the first upload', gate > 0 && firstPut > gate);

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
