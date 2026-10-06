#!/usr/bin/env node
/*
 * Regression: the desktop app takes its license from the customer's own server (6 Oct 2026).
 * shell_rules.takeServerLicense decides; main.js fetches through the app's own network session
 * (certificate pin + egress guard) before deciding where to start.
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const R = require(path.join(__dirname, '..', 'shell_rules.js'));
const V = { valid: true }, X = { valid: false };
console.log('[1] when the server\'s license is taken');
check('no license on this computer, valid one on the server: taken', R.takeServerLicense(null, V, '', 'srv') === true);
check('an invalid stored license, valid one on the server: taken', R.takeServerLicense(X, V, 'old', 'srv') === true);
check('a different valid license on the server (renewal): taken', R.takeServerLicense(V, V, 'old', 'new') === true);
check('the same license: nothing to do', R.takeServerLicense(V, V, 'same', ' same\n') === false);
check('an invalid server license never replaces a valid stored one', R.takeServerLicense(V, X, 'old', 'bad') === false);
check('an invalid server license is never stored at all', R.takeServerLicense(null, X, '', 'bad') === false);
check('an empty answer is ignored', R.takeServerLicense(null, V, '', '') === false);
console.log('[2] main.js');
const m = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const fn = m.slice(m.indexOf('async function refreshLicenseFromServer'), m.indexOf('async function routeStartup'));
check('only for an app set up for its own server and its own AI service', /cfg\.backend !== 'own' \|\| cfg\.ai !== 'own'/.test(fn));
check('fetched through the app session, with the certificate pin and egress guard', /part\.fetch\(/.test(fn) && /installCertificatePin\(part\)/.test(fn) && /installEgressGuard\(part, cfg\)/.test(fn));
check('gives up after a few seconds', /setTimeout\(\(\) => ctl\.abort\(\), 4000\)/.test(fn));
check('verified against this server before the decision', /const fromServer = await verifyLicense\(blob, cfg\)/.test(fn) && /R\.takeServerLicense\(stored, fromServer, a\.license, blob\)/.test(fn));
const rs = m.slice(m.indexOf('async function routeStartup'));
check('runs before the app decides where to start', rs.indexOf('await refreshLicenseFromServer()') > 0 && rs.indexOf('await refreshLicenseFromServer()') < rs.indexOf('activationStatus()'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
