#!/usr/bin/env node
/*
 * Regression: the CAD Model page's STEP reader runs in the desktop window (13 Oct 2026).
 *
 * WHAT WAS PROVEN (Electron 31.7.7, this repo's app-window webPreferences, loadFile from file://,
 * an egress guard admitting only the bundle; the web build pulled and patched by patch-index.py;
 * also from inside an asar archive as electron-builder packs it): importing a STEP file works as is.
 * The web's CAD import runs OpenCascade (WebAssembly, and a Function-built call layer) in a worker,
 * cad_import_worker.js. On the web that worker gets its own header policy; on the desktop a worker
 * loaded from a file: address carries no policy of its own (file: has no headers, and a header added
 * by webRequest.onHeadersReceived for that file was measured to have no effect), and the page's
 * meta policy does not reach into it. So the page stays strict (no 'unsafe-eval', no
 * 'wasm-unsafe-eval': both were measured as blocked in the page) while the worker compiles.
 *
 * WHAT THE DESKTOP MUST KEEP for that to stay true, each guarded below:
 *   W1  the page policy never gains 'unsafe-eval' or 'wasm-unsafe-eval' (the import does not need it)
 *   W2  worker-src admits the bundle ('self' or file:). Measured: worker-src blob: alone refuses the
 *       worker ("Failed to construct 'Worker' ... denied by the document's Content Security Policy")
 *       and the import fails with that message.
 *   W3  the app window loads the bundle with loadFile (file://). A move to a custom protocol with
 *       headers would put a policy on the worker; it would then need the web's worker policy
 *       (script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'self').
 *   W4  the pull copies the build's sub-folders (vendor/occt holds the .wasm, vendor/three the
 *       viewer) and the package ships everything under app/.
 *   W5  the egress guard never refuses the bundle's own file: requests (the .wasm is fetched).
 *
 * Run: node tests/regression_desktop_cad_worker_20261013.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' :: ' + d : '')); } };
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function desktopCsp(py) {
  const m = py.match(/DESKTOP_CSP\s*=\s*\(([\s\S]*?)\)\s*\n/);
  if (!m) return null;
  return (m[1].match(/"([^"]*)"/g) || []).map(s => s.slice(1, -1)).join('');
}
function directive(csp, name) { return (csp.split(';').map(s => s.trim()).find(s => s.indexOf(name + ' ') === 0) || ''); }
function rules(py, mainJs, pull, pkg) {
  const csp = desktopCsp(py) || '';
  const ss = directive(csp, 'script-src'), ws = directive(csp, 'worker-src');
  const files = (JSON.parse(pkg).build || {}).files || [];
  return {
    W1: !!csp && !/'unsafe-eval'/.test(ss) && !/'wasm-unsafe-eval'/.test(ss),
    W2: /'self'|\bfile:/.test(ws.replace(/^worker-src\s+/, '')),
    W3: /mainWindow\.loadFile\(path\.join\(APP_DIR, 'index\.html'\)\)/.test(mainJs) && !/registerSchemesAsPrivileged|protocol\.handle\(/.test(mainJs),
    W4: /cp -R "\$WEB\/dist\/\." "\$APP"\//.test(pull) && files.indexOf('app/**/*') >= 0,
    W5: !/onHeadersReceived[\s\S]{0,400}cad_import_worker/.test(mainJs)   // nothing rewrites the worker's response today
  };
}

const PY = read('patch-index.py'), MAIN = read('main.js'), PULL = read('pull-web.sh'), PKG = read('package.json');
const base = rules(PY, MAIN, PULL, PKG);
console.log('[W] the CAD worker keeps working in the desktop window');
check('W1 the page policy has no eval of any kind (the CAD import does not need it here)', base.W1, directive(desktopCsp(PY) || '', 'script-src'));
check("W2 worker-src admits the bundle ('self' or file:)", base.W2, directive(desktopCsp(PY) || '', 'worker-src'));
check('W3 the app window loads the bundle from file:// (no custom protocol putting a policy on the worker)', base.W3);
check('W4 the pull copies dist sub-folders and the package ships app/**', base.W4);
check('W5 no header rewrite is aimed at the worker (measured to have no effect on file:)', base.W5);

// Each guard must see the defect it is for (a mutated copy of the real file turns it red).
console.log('\n[M] each guard goes red on its defect');
const M = [
  ['W1', "page policy widened with 'unsafe-eval'", () => rules(PY.replace(`"script-src 'self' 'unsafe-inline' file:; "`, `"script-src 'self' 'unsafe-inline' 'unsafe-eval' file:; "`), MAIN, PULL, PKG)],
  ['W1', "page policy widened with 'wasm-unsafe-eval'", () => rules(PY.replace(`"script-src 'self' 'unsafe-inline' file:; "`, `"script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' file:; "`), MAIN, PULL, PKG)],
  ['W2', 'worker-src narrowed to blob: (measured to refuse the CAD worker)', () => rules(PY.replace(`"worker-src 'self' file: blob:; "`, `"worker-src blob:; "`), MAIN, PULL, PKG)],
  ['W3', 'the window served through a custom protocol', () => rules(PY, MAIN.replace("mainWindow.loadFile(path.join(APP_DIR, 'index.html'));", "mainWindow.loadURL('slab://app/index.html');"), PULL, PKG)],
  ['W4', 'the pull copying only top-level files', () => rules(PY, MAIN, PULL.replace('cp -R "$WEB/dist/." "$APP"/', 'cp "$WEB/dist/"*.* "$APP"/'), PKG)]
];
M.forEach(([k, name, f]) => { const r = f(); check('M ' + k + ' red when ' + name, r[k] === false); });
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
