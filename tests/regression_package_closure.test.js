#!/usr/bin/env node
/*
 * Regression — everything main.js and the preloads require is actually PACKAGED.
 *
 * WHY THIS EXISTS. On 16 Sep 2026 secrets.js and bridge_main.js were added and wired into
 * main.js. package.json "build.files" is an ALLOWLIST and nobody added them to it. The build
 * succeeded, the desktop wall passed, the smoke gate passed, and 0.18.2 shipped to both platforms
 * without them. Every installed copy died on launch with:
 *
 *     Uncaught Exception: Error: Cannot find module './secrets.js'
 *
 * It was live on the website for two weeks. Nothing caught it because every other check runs
 * against the SOURCE TREE, where the files are present, rather than against what electron-builder
 * actually put in app.asar.
 *
 * WHAT THIS CHECKS. Walks the require() graph from the packaged entry points, then asserts
 * (a) every local file it reaches is covered by build.files, and
 * (b) if a built app.asar exists under dist/, that the asar really contains each one.
 *
 * Run: node tests/regression_package_closure.test.js   (release.sh runs every tests/*.test.js)
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const FILES = (pkg.build && pkg.build.files) || [];

// Entry points electron actually loads: the main process and every preload named in build.files.
const ENTRIES = ['main.js'].concat(FILES.filter(f => /^preload-[\w-]+\.js$/.test(f)));

// --- require() closure over first-party files ------------------------------------------------
const seen = new Set();
(function walk(rel) {
  if (seen.has(rel)) return;
  seen.add(rel);
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return;
  const src = fs.readFileSync(abs, 'utf8');
  const re = /require\(\s*['"](\.\/[\w./-]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    let dep = m[1].replace(/^\.\//, '');
    if (!/\.[a-z]+$/.test(dep)) dep += '.js';
    walk(path.posix.normalize(dep));
  }
})(ENTRIES[0]);
ENTRIES.slice(1).forEach(e => { if (!seen.has(e)) { seen.add(e); } });

const closure = [...seen].filter(f => fs.existsSync(path.join(ROOT, f))).sort();

// A build.files entry covers a path if it matches exactly or via a dir/**/* glob.
const covered = (f) => FILES.some(pat => {
  if (pat.startsWith('!')) return false;
  if (pat === f) return true;
  const g = pat.match(/^(.*?)\/\*\*\/\*$/);
  return !!g && f.startsWith(g[1] + '/');
});

console.log('  entry points: ' + ENTRIES.join(', '));
console.log('  require closure: ' + closure.join(', ') + '\n');

const missing = closure.filter(f => !covered(f));
check('every required first-party file is listed in build.files', missing.length === 0,
      missing.length ? 'NOT PACKAGED: ' + missing.join(', ') : '');

// The two that actually bit us, named so a future reader sees the history.
check('secrets.js is packaged', covered('secrets.js'));
check('bridge_main.js is packaged', covered('bridge_main.js'));

// --- and verify the real artifact when one has been built -------------------------------------
function asarFiles(asarPath) {
  const fd = fs.openSync(asarPath, 'r');
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  const jsonLen = head.readUInt32LE(12);
  const buf = Buffer.alloc(jsonLen);
  fs.readSync(fd, buf, 0, jsonLen, 16);
  fs.closeSync(fd);
  return JSON.parse(buf.toString('utf8')).files || {};
}
const asars = [];
(function find(dir, depth) {
  if (depth > 6 || !fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) find(p, depth + 1);
    else if (e.name === 'app.asar') asars.push(p);
  }
})(path.join(ROOT, 'dist'), 0);

// The asar in dist/ is whatever was built LAST, so before a package it is stale by definition and
// would block the very build that fixes it. release.sh (mac and --win) re-runs this suite
// with SLAB_CHECK_ASAR=1 immediately AFTER electron-builder, which is the only moment the artifact
// check means anything. The closure check above always runs.
if (process.env.SLAB_CHECK_ASAR !== '1') {
  console.log('  (artifact check deferred — release.sh re-runs this with SLAB_CHECK_ASAR=1 after packaging)');
} else if (!asars.length) {
  check('an app.asar exists to check', false, 'SLAB_CHECK_ASAR=1 but nothing was packaged under dist/');
} else {
  for (const a of asars) {
    let entries = {};
    try { entries = asarFiles(a); } catch (e) { check('asar readable: ' + a, false, e.message); continue; }
    const gone = closure.filter(f => !(f in entries));
    check('packaged asar contains the full closure: ' + path.relative(ROOT, a),
          gone.length === 0, gone.length ? 'MISSING FROM ASAR: ' + gone.join(', ') : '');
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
