#!/usr/bin/env node
/*
 * Regression (5 Oct 2026): the Windows installer is built natively on the Mac by `release.sh --win`.
 * build-win-docker.sh ran electron-builder inside a Linux/amd64 Wine container. On Apple Silicon the
 * 32-bit rcedit step runs under QEMU (Rosetta for Linux covers 64-bit only) and Wine aborts, so the
 * script could never produce a build here. It also skipped the codeSigned stamp release.sh writes.
 * On macOS electron-builder stamps the exe with its own native rcedit and needs no Wine. 0.18.4 and
 * 0.18.5 for Windows were both built this way. This guards that the dead path stays gone.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };

check('build-win-docker.sh no longer exists', !fs.existsSync(path.join(ROOT, 'build-win-docker.sh')));

const SKIP = new Set(['node_modules', 'dist', 'app', '.git']);
const hits = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (p === __filename || !/\.(sh|js|json|md|yml|yaml)$/.test(e.name)) continue;
    if (/build-win-docker/.test(fs.readFileSync(p, 'utf8'))) hits.push(path.relative(ROOT, p));
  }
})(ROOT);
check('nothing points at the removed Docker script', hits.length === 0, hits.join(', '));

const rel = fs.readFileSync(path.join(ROOT, 'release.sh'), 'utf8');
check('release.sh takes --win', /\[ "\$a" = "--win" \] && WIN=1/.test(rel));
check('release.sh --win packages natively with electron-builder --win --x64', /WIN" = "1" \]; then npx electron-builder --win --x64/.test(rel));
check('release.sh does not run Docker or Wine', !/\bdocker\b|\bwine\b/i.test(rel.replace(/^#.*$/mg, '')));
check('release.sh checks the packaged app.asar after packaging, for both platforms',
  rel.indexOf('SLAB_CHECK_ASAR=1') > rel.indexOf('npx electron-builder --win'));
check('release.sh stamps the code-signing state for Windows too', /win:!!process\.env\.WIN_CSC_LINK/.test(rel));

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
check('package.json release:win goes through release.sh', /^bash release\.sh --win/.test(pkg.scripts['release:win'] || ''));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
