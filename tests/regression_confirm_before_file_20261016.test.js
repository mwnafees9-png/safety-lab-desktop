#!/usr/bin/env node
/*
 * Regression (16 Oct 2026): the web app now collects changes and confirms them once at a decision point
 * (change_ack 2.0). Native File > Save and File > Open are decision points: main.js asks the page first
 * (SLChangeAck.ask) and stops when the person chooses Keep working, before any file dialog opens.
 * Run: node tests/regression_confirm_before_file_20261016.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? '  -- ' + d : '')); } };
const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const body = name => { const i = src.indexOf('async function ' + name + '('); if (i < 0) return ''; const j = src.indexOf('\nasync function ', i + 10); return src.slice(i, j < 0 ? i + 4000 : j); };
const save = body('doSave'), open = body('doOpen'), helper = body('confirmPendingFirst');
check('a helper asks the page through SLChangeAck.ask', /SLChangeAck\.ask/.test(helper) && /r !== 'keep'/.test(helper));
check('an older page without SLChangeAck carries on', /"none"/.test(helper) && /catch \(_\) \{ return true; \}/.test(helper));
check('File > Save asks first, before the save dialog', save.indexOf("confirmPendingFirst('export'") > 0 && save.indexOf("confirmPendingFirst('export'") < save.indexOf('showSaveDialog'));
check('File > Save stops on Keep working', /if \(!\(await confirmPendingFirst\('export'[^)]*\)\)\) return;/.test(save));
check('File > Open asks first, before the open dialog', open.indexOf("confirmPendingFirst('project'") > 0 && open.indexOf("confirmPendingFirst('project'") < open.indexOf('showOpenDialog'));
check('File > Open stops on Keep working', /if \(!\(await confirmPendingFirst\('project'[^)]*\)\)\) return;/.test(open));
// behavior of the helper with a fake window
(async () => {
  const mk = answer => { const fn = new Function('mainWindow', 'return (' + helper.replace(/^async function confirmPendingFirst/, 'async function') + ')')({ webContents: { executeJavaScript: () => (answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer)) } }); return fn; };
  check('Keep working stops the action', (await mk('keep')('export', 'x')) === false);
  check('Confirm all lets it go on', (await mk('confirmed')('export', 'x')) === true);
  check('a page without the API lets it go on', (await mk('none')('export', 'x')) === true);
  check('a page error lets it go on (never trap the person)', (await mk(new Error('x'))('export', 'x')) === true);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
