#!/usr/bin/env node
/*
 * Regression: an administrator-approved internal Jama host, on the customer's own server only
 * (21 Oct 2026).
 *
 * Waqas's ruling: Radia may keep Jama inside its own network. The desktop connector refused any
 * internal host (bare IPs, .local, .internal) in two places, the keychain save (checkSecret) and
 * the main-process request (bridge_main.targetProblem). The fix is NOT to drop that rule: the
 * customer's administrator lists the internal hosts in the server's ai-proxy.env, install.sh puts
 * the list in the setup file, and only a setup file for backend 'own' can bring it in. Everything
 * else stays: https only, /rest/ only, the host saved with the credential, redirects refused, and
 * the renderer's egress fence never learns the host at all.
 *
 * Run: node tests/regression_internal_connector_host_20261021.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' (' + d + ')' : '')); } };
const ROOT = path.join(__dirname, '..');
const R = require(path.join(ROOT, 'shell_rules.js'));
const B = require(path.join(ROOT, 'bridge_main.js'));
const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const LIST = 'jama.radia.local, 192.168.10.50, alm.radia.internal:8443';

console.log('\n[list] parsing the administrator\'s list');
{
  const p = R.parseInternalHosts(LIST);
  check('a good list parses, lower-cased and trimmed', p.ok && p.list.join() === 'jama.radia.local,192.168.10.50,alm.radia.internal:8443');
  check('empty is an empty list', R.parseInternalHosts('').ok && R.parseInternalHosts('').list.length === 0);
  check('a scheme or path is refused', !R.parseInternalHosts('https://jama.radia.local').ok && !R.parseInternalHosts('jama.radia.local/rest').ok);
  check('a wildcard is refused', !R.parseInternalHosts('*.radia.local').ok);
  check('an impossible port is refused', !R.parseInternalHosts('jama.radia.local:70000').ok);
  check('more than 16 is refused', !R.parseInternalHosts(Array.from({ length: 17 }, (_, i) => 'h' + i + '.local').join(',')).ok);
  check('listed host on 443 matches', R.internalHostListed('jama.radia.local', '', LIST) && R.internalHostListed('JAMA.radia.local', '443', LIST));
  check('listed host on another port does not', !R.internalHostListed('jama.radia.local', '8443', LIST));
  check('host:port entry matches only that port', R.internalHostListed('alm.radia.internal', '8443', LIST) && !R.internalHostListed('alm.radia.internal', '', LIST));
  check('an unlisted host does not match', !R.internalHostListed('192.168.10.51', '', LIST));
  check('a lookalike does not match', !R.internalHostListed('evil-jama.radia.local', '', LIST) && !R.internalHostListed('jama.radia.local.evil.com', '', LIST));
}

console.log('\n[setup] only the customer\'s own server\'s setup file brings it');
{
  const base = { format: R.SETUP_FORMAT, backend: 'own', backendUrl: 'https://192.168.10.42', backendKey: 'sb_publishable_x', ai: 'own', aiEndpoint: 'https://192.168.10.42/v1/ai' };
  const ok = R.parseSetupFile(JSON.stringify(Object.assign({}, base, { bridgeInternalHosts: LIST })));
  check('accepted with backend own', ok.ok && ok.config.bridgeInternalHosts === 'jama.radia.local,192.168.10.50,alm.radia.internal:8443', ok.error);
  const none = R.parseSetupFile(JSON.stringify(base));
  check('absent means none (a new setup file clears an old list)', none.ok && none.config.bridgeInternalHosts === '');
  const bad = R.parseSetupFile(JSON.stringify(Object.assign({}, base, { bridgeInternalHosts: 'https://x/' })));
  check('a malformed list refuses the whole file', !bad.ok);
  const files = R.parseSetupFile(JSON.stringify({ format: R.SETUP_FORMAT, backend: 'files', ai: 'off', bridgeInternalHosts: 'jama.radia.local' }));
  check('refused without the customer\'s own server', !files.ok);
}

console.log('\n[keychain] saving the credential');
{
  const cred = { user: 'u', token: 't' };
  check('internal host refused with no list', !R.checkSecret('jama', cred, { baseHost: 'jama.radia.local' }).ok);
  check('internal host refused when not listed', !R.checkSecret('jama', cred, { baseHost: '10.0.0.9' }, { internalHosts: LIST }).ok);
  check('listed internal host accepted', R.checkSecret('jama', cred, { baseHost: 'jama.radia.local' }, { internalHosts: LIST }).ok);
  check('listed by host:port is accepted (port checked at request time)', R.checkSecret('jama', cred, { baseHost: 'alm.radia.internal' }, { internalHosts: LIST }).ok);
  check('public host unchanged', R.checkSecret('jama', cred, { baseHost: 'radia.jamacloud.com' }).ok);
}

console.log('\n[request] the main process makes the call');
{
  const tp = B.targetProblem;
  check('internal host refused with no list', !!tp('https://jama.radia.local/rest/latest/items', 'jama.radia.local', ''));
  check('listed internal host allowed', tp('https://jama.radia.local/rest/latest/items', 'jama.radia.local', LIST) === '');
  check('listed address allowed', tp('https://192.168.10.50/rest/latest/items', '192.168.10.50', LIST) === '');
  check('unlisted address refused', !!tp('https://192.168.10.51/rest/latest/items', '192.168.10.51', LIST));
  check('listed host:port allowed on that port', tp('https://alm.radia.internal:8443/rest/latest/items', 'alm.radia.internal', LIST) === '');
  check('listed host refused on an unlisted port', !!tp('https://jama.radia.local:8443/rest/latest/items', 'jama.radia.local', LIST));
  check('http refused even when listed', !!tp('http://jama.radia.local/rest/latest/items', 'jama.radia.local', LIST));
  check('non /rest/ path refused even when listed', !!tp('https://jama.radia.local/login', 'jama.radia.local', LIST));
  check('must match the saved connector host', /does not match/.test(tp('https://jama.radia.local/rest/latest/items', '192.168.10.50', LIST)));
  check('public hosts unchanged', tp('https://radia.jamacloud.com/rest/latest/items', 'radia.jamacloud.com', '') === '');
  check('redirects still refused', /redirect: 'error'/.test(fs.readFileSync(path.join(ROOT, 'bridge_main.js'), 'utf8')));
}

console.log('\n[wiring] the list comes from config, own server only, never from the page');
{
  check('main.js reads the list only for backend own', /_internalConnectorHosts\(\)[\s\S]{0,120}backend === 'own'/.test(main));
  check('the request gets it', /bridgeMain\.get\(targetUrl, \{ internalHosts: _internalConnectorHosts\(\) \}\)/.test(main));
  check('the keychain save gets it', /R\.checkSecret\([^)]*\{ internalHosts: _internalConnectorHosts\(\) \}\)/.test(main));
  const save = (/ipcMain\.handle\('slab:saveConfig'[\s\S]*?\n\}\);/.exec(main) || [''])[0];
  check('settings cannot set it (only a setup file can)', save && !/'bridgeInternalHosts'\]/.test(save) && !/partial\.bridgeInternalHosts/.test(save));
  check('pointing at another server by hand drops it', /next\.bridgeInternalHosts = ''/.test(save));
  check('the renderer egress fence does not learn it', !/bridgeInternalHosts|internalHost/.test(String(R.allowedHosts)) && !/bridgeInternalHosts|internalHost/.test(String(R.egressAllowed)));
  const cfg = { backend: 'own', backendUrl: 'https://192.168.10.42', ai: 'own', aiEndpoint: 'https://192.168.10.42/v1/ai', bridgeInternalHosts: 'jama.radia.local' };
  check('the fence still refuses the internal host in the page', R.egressAllowed('https://jama.radia.local/rest/latest/items', cfg) === false);
}
for (const f of ['shell_rules.js', 'bridge_main.js', 'tests/regression_internal_connector_host_20261021.test.js']) {
  const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const added = f === 'shell_rules.js' ? t.slice(t.indexOf('function parseInternalHosts'), t.indexOf('function parseSetupFile')) : t;
  if (f !== 'bridge_main.js') check('no em dashes in what was added to ' + f, added.indexOf(String.fromCharCode(0x2014)) < 0);
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
