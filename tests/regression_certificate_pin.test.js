#!/usr/bin/env node
/*
 * Regression — the pinned server certificate (2 Oct 2026).
 *
 * A self-made certificate on the customer's server is trusted by the desktop for THAT server
 * name only, through the fingerprints the setup file carries. Executed against the setup file
 * install.sh really wrote and the chain the server really presented (tests/fixtures, captured
 * 2 Oct 2026). Pins every refusal: other host, other certificate, trial cloud, no pin, malformed.
 * Mutation-proven: with the host check gone, the pin would apply to any server.
 *
 * Run: node tests/regression_certificate_pin.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ROOT = path.join(__dirname, '..');
const R = require(path.join(ROOT, 'shell_rules.js'));
const setup = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample.safetylab-setup'), 'utf8');
const chain = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample.chain.json'), 'utf8'));

console.log('\n[pin] the real setup file and the real chain');
const parsed = R.parseSetupFile(setup);
check('setup file with pins accepted', parsed.ok, parsed.error);
check('two pins carried (root and server certificate), normalized to hex', parsed.ok && parsed.config.backendPin.split(',').length === 2 && /^[0-9a-f]{64},[0-9a-f]{64}$/.test(parsed.config.backendPin));
const cfg = parsed.config;
check('the chain the server presents is trusted for the server name', R.pinDecision(chain.host, chain.chain, cfg) === 0);
check('leaf alone (Chromium may withhold the root) is still trusted', R.pinDecision(chain.host, [chain.chain[0]], cfg) === 0);
check('root alone is still trusted', R.pinDecision(chain.host, [chain.chain[1]], cfg) === 0);
check('electron base64 form and hex form agree', R.normalizeFingerprint(chain.chain[1]) === cfg.backendPin.split(',')[0]);

console.log('\n[pin] refusals hand the verdict back to Chromium (-3), never trust');
check('another host, same chain', R.pinDecision('evil.example.com', chain.chain, cfg) === -3);
check('same host, another chain', R.pinDecision(chain.host, ['sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='], cfg) === -3);
check('no pin configured', R.pinDecision(chain.host, chain.chain, Object.assign({}, cfg, { backendPin: '' })) === -3);
check('trial cloud never pins', R.pinDecision(chain.host, chain.chain, Object.assign({}, cfg, { backend: 'safetylab' })) === -3);
check('empty chain', R.pinDecision(chain.host, [], cfg) === -3);
check('garbage pin is ignored', R.pinDecision(chain.host, chain.chain, Object.assign({}, cfg, { backendPin: 'not-a-fingerprint' })) === -3);
check('malformed pin in a setup file is refused outright', !R.parseSetupFile(setup.replace(cfg.backendPin.split(',')[0], 'zz')).ok);
check('pin without a server address is refused', !R.parseSetupFile(JSON.stringify({ format: 'safetylab-setup/1', backend: 'files', ai: 'off', backendPin: 'a'.repeat(64) })).ok);

console.log('\n[pin] the shell is wired');
const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
check('verify proc installed on the app partition from the live config', /installCertificatePin\(part, cfg\)/.test(main) && /setCertificateVerifyProc/.test(main));
check('only consulted when Chromium already failed the certificate', /verificationResult === 'net::OK' \|\| request\.errorCode === 0\) return callback\(-3\)/.test(main));
check('the decision is shell_rules.pinDecision, nothing else', /callback\(R\.pinDecision\(request\.hostname, chain, cfg\)\)/.test(main));
check('config carries backendPin and saveConfig normalizes it', /backendPin: ''/.test(main) && /R\.normalizePins\(next\.backendPin\)/.test(main));

console.log('\n[pin] MUTATION — with the host check gone the pin applies to any server');
{
  const src = fs.readFileSync(path.join(ROOT, 'shell_rules.js'), 'utf8');
  const mutated = src.replace("if (!host || host !== hostOf(cfg.backendUrl)) return -3;", "");
  check('mutation site present', mutated !== src);
  const m = new module.constructor(); m.paths = module.paths; m.filename = path.join(ROOT, 'shell_rules_mut.js'); m._compile(mutated, m.filename);
  check('mutation proven', m.exports.pinDecision('evil.example.com', chain.chain, cfg) === 0);
}
console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
