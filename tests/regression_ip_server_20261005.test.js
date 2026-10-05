#!/usr/bin/env node
/*
 * Regression (5 Oct 2026): the desktop app against a customer server addressed by IP address.
 *
 * Radia's server has no DNS name; IT will give it a fixed IP. The fixtures are the setup file a real
 * install.sh run wrote for the bare IP 192.0.2.2 and the certificate chain that server presented
 * (captured the same day, test stack). This proves the desktop takes that file, trusts that one
 * server by its pin, lets the app reach it and its AI endpoint and nothing else, and refuses
 * every near miss: another IP, the same IP over http, the root alone, a different certificate.
 *
 * Run: node tests/regression_ip_server_20261005.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' :: ' + d : '')); } };
const R = require(path.join(__dirname, '..', 'shell_rules.js'));
const setup = fs.readFileSync(path.join(__dirname, 'fixtures', 'ip.safetylab-setup'), 'utf8');
const chain = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ip.chain.json'), 'utf8'));

console.log('\n[ip] the setup file install.sh wrote for 192.0.2.2');
const parsed = R.parseSetupFile(setup);
check('accepted', parsed.ok, parsed.error);
const cfg = parsed.config || {};
check('server and AI are https on the IP', cfg.backendUrl === 'https://192.0.2.2' && cfg.aiEndpoint === 'https://192.0.2.2/v1/ai');
check('it carries one pin, the server certificate', /^[0-9a-f]{64}$/.test(cfg.backendPin || ''));
check('the settings screen\'s own sanity check passes', R.configProblem(cfg) === '', R.configProblem(cfg));
check('an http address on the same IP is refused', !R.parseSetupFile(setup.split('https://192.0.2.2').join('http://192.0.2.2')).ok);

console.log('\n[ip] trust: the pin, for that IP only');
check('the chain the server presents is trusted', R.pinDecision(chain.host, chain.chain, cfg) === 0);
check('the server certificate alone is trusted', R.pinDecision(chain.host, [chain.chain[0]], cfg) === 0);
check('the root alone is not', R.pinDecision(chain.host, [chain.chain[1]], cfg) === -3);
check('the same certificate on another IP is not', R.pinDecision('192.0.2.99', chain.chain, cfg) === -3);
check('a different certificate on the same IP is not', R.pinDecision('192.0.2.2', ['sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='], cfg) === -3);
check('the pin and the captured chain agree (same certificate)', R.normalizeFingerprint(chain.chain[0]) === cfg.backendPin);

console.log('\n[ip] what the app may reach');
check('the server', R.egressAllowed('https://192.0.2.2/rest/v1/projects', cfg));
check('live sync on the server', R.egressAllowed('wss://192.0.2.2/realtime/v1/websocket', cfg));
check('the AI endpoint', R.egressAllowed('https://192.0.2.2/v1/ai/anthropic/messages', cfg));
check('not the same IP over http', !R.egressAllowed('http://192.0.2.2/rest/v1/projects', cfg));
check('not the same IP on another port', !R.egressAllowed('https://192.0.2.2:8443/', cfg));
check('not another IP', !R.egressAllowed('https://192.0.2.3/', cfg));
check('not Safety Lab', !R.egressAllowed('https://fhrqkhdrwbfnizkepkch.supabase.co/rest/v1/', cfg));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
