#!/usr/bin/env node
/*
 * Regression — the shell must not call into the page for something nothing defines (17 Sep 2026).
 *
 * WHAT WENT WRONG. main.js reaches into the page five times, and every one of those calls is
 * written defensively:
 *
 *     executeJavaScript('(window.__slabAuthCallback ? window.__slabAuthCallback(url) : false)')
 *
 * That guard was put there so a call could never throw. What it actually does is make a missing
 * function indistinguishable from a function that ran and returned false. No exception, no log,
 * nothing on stderr. The feature is simply dead and the app looks fine.
 *
 * On 17 Sep that stopped being hypothetical. Turning contextIsolation on meant __slabAuthCallback
 * could no longer live in the preload and reach into the page for getSupabaseClient(), so it moved
 * into the page (site/auth_gate.js 62.75). The desktop's own bundle, though, is a vendored COPY of
 * the web build taken at some earlier commit, and it was sitting at a6655ed — one commit before
 * the move. So for a short window the handler was defined in NEITHER place:
 *
 *     preload-app.js   no longer defines it   (isolation forbids the old direction)
 *     app/auth_gate.js does not define it yet (bundle predates the move)
 *     main.js          calls it, gets undefined, takes the ': false' branch, says nothing
 *
 * A build cut in that window would have shipped a sign-in button that does nothing at all: the
 * browser opens, the user authenticates, they come back, and the app sits there. The unit tests
 * were green the whole time, because each repo was internally consistent. The defect lived in the
 * seam BETWEEN them, which is exactly the seam nothing was checking.
 *
 * WHAT THIS PINS. Every page function the shell names must be provided by exactly one side, and
 * the provider must be the one isolation allows. That is a property of the PAIR, so it is checked
 * against the vendored bundle actually on disk — not against the web repo, which is free to move
 * ahead of a release.
 *
 * Run: node tests/regression_shell_page_contract.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const DESK = path.join(__dirname, '..');
const APP = path.join(DESK, 'app');
const read = p => fs.readFileSync(path.join(DESK, p), 'utf8');

const main = read('main.js');
const pre = read('preload-app.js');

console.log('\n[contract] every page function the shell names is actually provided');
{
  // The silent-guard pattern itself: `window.X ? window.X(` inside an executeJavaScript string.
  const named = new Set();
  const re = /window\.([A-Za-z_$][\w$]*)\s*\?\s*window\.\1\s*\(/g;
  let m;
  while ((m = re.exec(main))) named.add(m[1]);

  check('the shell does reach into the page (the scan found the call sites)',
    named.size >= 5, 'found: ' + [...named].join(', ') + ' — if this dropped, the scan broke, not the app');

  const bundled = fs.existsSync(APP)
    ? fs.readdirSync(APP).filter(f => f.endsWith('.js'))
    : [];
  check('there is a vendored bundle to check against', bundled.length > 0,
    'app/ is missing — run: bash pull-web.sh');

  for (const name of [...named].sort()) {
    const inPreload = new RegExp('window\\.' + name + '\\s*=').test(pre);
    const providers = bundled.filter(f =>
      new RegExp('window\\.' + name + '\\s*=').test(fs.readFileSync(path.join(APP, f), 'utf8')));
    const where = (inPreload ? ['preload-app.js'] : []).concat(providers);
    check('something defines window.' + name, where.length > 0,
      'main.js calls it and takes the silent ": false" branch when it is absent — the feature is dead with no error');
    if (where.length > 1) {
      check('...and only one place does (' + name + ')', false, where.join(' + ') +
        ' — two definitions means load order decides which one wins');
    }
  }
}

console.log('\n[direction] the SSO handler lives in the page, because isolation forbids the alternative');
{
  const gate = fs.existsSync(path.join(APP, 'auth_gate.js'))
    ? fs.readFileSync(path.join(APP, 'auth_gate.js'), 'utf8') : '';
  check('the bundled page defines __slabAuthCallback', /window\.__slabAuthCallback\s*=/.test(gate),
    'this is the one that was missing from both sides on 17 Sep');
  check('the preload does NOT define it', !/window\.__slabAuthCallback\s*=/.test(pre),
    'defining it there means reaching into the page for its Supabase client, which isolation blocks');
  check('the handler does both halves of the return',
    /exchangeCodeForSession/.test(gate) && /setSession/.test(gate),
    'a handler that exists but only handles one of the two return shapes fails just as quietly');
}

console.log('\n[bundle] app/ is the build BUILD_INFO says it is');
{
  const infoPath = path.join(APP, 'BUILD_INFO.json');
  const info = fs.existsSync(infoPath) ? JSON.parse(fs.readFileSync(infoPath, 'utf8')) : null;
  check('BUILD_INFO.json exists and records a web commit',
    !!(info && /^[0-9a-f]{40}$/.test(String(info.webCommit || ''))), info && info.webCommit);
  if (info && info.manifest) {
    const drift = [];
    for (const [f, md5] of Object.entries(info.manifest)) {
      const p = path.join(APP, f);
      if (!fs.existsSync(p)) { drift.push(f + ' missing'); continue; }
      const got = crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
      if (got !== md5) drift.push(f + ' edited');
    }
    check('no bundled file has been changed since the pull', drift.length === 0,
      drift.slice(0, 5).join(', ') + ' — patch the web repo and re-pull, never app/ by hand');
  }
}

console.log('\n' + (fail ? 'FAIL ' + fail + ' / ' + (pass + fail) : 'PASS ' + pass + ' / ' + pass));
process.exit(fail ? 1 : 0);
