#!/usr/bin/env node
/*
 * Regression — the setup file (2 Oct 2026).
 *
 * One file from the customer's own install configures the desktop in one click. It may carry only
 * what a browser bundle already carries in the open plus the signed license. These checks execute
 * shell_rules.parseSetupFile on the file install.sh really writes (tests/fixtures), and prove the
 * refusals: secrets, Safety Lab addresses, unknown fields, wrong format, non-https. Mutation-proven:
 * with the secret check removed, a service key would be accepted.
 *
 * Run: node tests/regression_setup_file.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ROOT = path.join(__dirname, '..');
const R = require(path.join(ROOT, 'shell_rules.js'));
const sample = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample.safetylab-setup'), 'utf8');
const base = JSON.parse(sample);
const variant = (patch) => { const j = Object.assign({}, base, patch); for (const k of Object.keys(patch)) if (patch[k] === undefined) delete j[k]; return JSON.stringify(j); };

console.log('\n[setup] the file install.sh writes is accepted and maps onto the config');
{
  const r = R.parseSetupFile(sample);
  check('accepted', r.ok, r.error);
  check('backend own at the server address', r.ok && r.config.backend === 'own' && r.config.backendUrl === base.backendUrl);
  check('publishable key carried', r.ok && r.config.backendKey === base.backendKey);
  check('AI through the server /v1/ai', r.ok && r.config.ai === 'own' && r.config.aiEndpoint === base.backendUrl + '/v1/ai');
  check('license carried through untouched', r.ok && r.license === base.license);
  check('config passes the same sanity check the settings screen uses', r.ok && R.configProblem(r.config) === '');
}
console.log('\n[setup] refusals');
check('not JSON', !R.parseSetupFile('hello').ok);
check('wrong format tag', !R.parseSetupFile(variant({ format: 'safetylab-setup/9' })).ok);
check('unknown field refused (an AI key has no place here)', !R.parseSetupFile(variant({ ANTHROPIC_API_KEY: 'sk-ant-x' })).ok);
check('server secret key refused', !R.parseSetupFile(variant({ backendKey: 'sb_secret_abc' })).ok);
check('a bare string in the key slot refused', !R.parseSetupFile(variant({ backendKey: 'hunter2' })).ok);
check('legacy anon JWT accepted (it is public too)', R.parseSetupFile(variant({ backendKey: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.c2ln' })).ok);
check('Safety Lab backend refused', !R.parseSetupFile(variant({ backend: 'safetylab' })).ok);
check('Safety Lab host as the server refused', !R.parseSetupFile(variant({ backendUrl: 'https://' + R.HOSTED.dbHost })).ok);
check('Safety Lab AI refused', !R.parseSetupFile(variant({ ai: 'safetylab' })).ok);
check('http (not https) refused', !R.parseSetupFile(variant({ backendUrl: 'http://safetylab.test.local' })).ok);
check('address with query parameters refused', !R.parseSetupFile(variant({ aiEndpoint: base.aiEndpoint + '?token=x' })).ok);
check('http AI endpoint refused (the fence would refuse it anyway; say so up front)', !R.parseSetupFile(variant({ aiEndpoint: 'http://safetylab.test.local/v1/ai' })).ok);
check('http web address refused', !R.parseSetupFile(variant({ webAppUrl: 'http://safetylab.test.local/app' })).ok);
check('files-only setup file (no server) accepted with AI off', (() => { const r = R.parseSetupFile(JSON.stringify({ format: 'safetylab-setup/1', backend: 'files', ai: 'off' })); return r.ok && r.config.backend === 'files'; })());
check('no license is fine (loaded separately)', (() => { const r = R.parseSetupFile(variant({ license: undefined })); return r.ok && r.license === ''; })());

console.log('\n[setup] the shell is wired');
const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8'), pre = fs.readFileSync(path.join(ROOT, 'preload-gate.js'), 'utf8'), ob = fs.readFileSync(path.join(ROOT, 'onboarding.html'), 'utf8');
check('main.js parses through shell_rules.parseSetupFile', main.includes('R.parseSetupFile('));
check('main.js verifies the license against the setup file\'s server before saving', /applySetupFileText[\s\S]*verifyLicense\(parsed\.license, cfg\)[\s\S]*writeConfig\(cfg\)/.test(main));
check('main.js saves nothing when the license fails', /if \(!v\.valid\) return \{ ok: false[\s\S]*writeConfig\(cfg\)/.test(main));
check('preload exposes pickSetupFile and applySetupText only through IPC', pre.includes("ipcRenderer.invoke('gate:pickSetupFile')") && pre.includes("ipcRenderer.invoke('gate:applySetupText', text)"));
check('onboarding offers the setup file first', ob.indexOf('btn-setupfile') > 0 && ob.indexOf('btn-setupfile') < ob.indexOf('btn-loadfile'));
check('onboarding accepts a dropped file', ob.includes("addEventListener('drop'"));

console.log('\n[setup] MUTATION — without the secret check a service key passes');
{
  const src = fs.readFileSync(path.join(ROOT, 'shell_rules.js'), 'utf8');
  const mutated = src.replace("if (/^sb_secret_/.test(key) || /service_role/.test(key)) return", "if (false) return")
                     .replace("if (key && !/^sb_publishable_", "if (false && !/^sb_publishable_");
  check('mutation site present', mutated !== src);
  const m = new module.constructor(); m.paths = module.paths; m._compile(mutated, path.join(ROOT, 'shell_rules_mutated.js'));
  check('mutation proven: service key accepted once the check is gone', m.exports.parseSetupFile(variant({ backendKey: 'sb_secret_abc' })).ok);
}
console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
