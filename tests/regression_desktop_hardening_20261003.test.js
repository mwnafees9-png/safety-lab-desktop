#!/usr/bin/env node
/*
 * Regression — desktop hardening, 3 Oct 2026 (security review of 2 Oct, batch 2).
 *
 * What was wrong, one line each:
 *   - the page could write ANY kind of secret with any value and any details into the keychain
 *     (so a page bug or injected script could swap the user's AI key for someone else's);
 *   - the Jama host stored with the credential was never checked, so it could name a private address;
 *   - the own-key AI request had no size or model bound;
 *   - the app window could navigate to ANY file:// address, and that page would get the keychain
 *     writer and the AI bridge; the gate and settings windows had no navigation lock at all;
 *   - every IPC channel answered any window that called it;
 *   - activation.json (license + agreement record) was written readable by everyone on the machine;
 *   - the certificate pin compared "host:port" to a bare host name, so a pin on a non-443 server did
 *     nothing, and it kept the config from when the window opened, so a new setup file needed a restart;
 *   - the app window had no content security policy.
 *
 * Every rule is executed here, and the ones that guard a boundary are mutation-proven: the suite
 * loads a deliberately broken copy of shell_rules.js and shows the check fails on it.
 *
 * Run: node tests/regression_desktop_hardening_20261003.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const R = require(path.join(ROOT, 'shell_rules.js'));
const rulesSrc = read('shell_rules.js'), main = read('main.js'), aiSrc = read('ai_main.js');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'slab-hard-'));
function mutant(from, to) {
  if (rulesSrc.indexOf(from) < 0) throw new Error('mutation site missing: ' + from);
  const f = path.join(TMP, 'rules_' + Math.random().toString(16).slice(2) + '.js');
  fs.writeFileSync(f, rulesSrc.replace(from, to));
  return require(f);
}

console.log('\n[secrets] four kinds, their shapes, plain details, a public Jama host');
const S = R.checkSecret;
check('jama credential with its public host: accepted, host lowercased', (() => { const r = S('jama', { user: 'w', token: 't' }, { baseHost: 'Electra.JamaCloud.com', user: 'w' }); return r.ok && r.meta.baseHost === 'electra.jamacloud.com' && r.value.token === 't'; })());
check('anthropic key as a string with last4: accepted', S('anthropic_key', 'sk-ant-xyz', { last4: 'xyz1' }).ok);
check('voyage key and jama token (the page\'s other kinds): accepted', S('voyage_key', 'pa-1', {}).ok && S('jama_token', 'tok', { baseHost: 'x.jamacloud.com', user: 'u' }).ok);
check('an unknown kind is refused', !S('evil', 'x', {}).ok && !S('__proto__', 'x', {}).ok && !S('', 'x', {}).ok);
check('a key that is not a string is refused', !S('anthropic_key', { k: 1 }, {}).ok && !S('anthropic_key', '', {}).ok);
check('an oversized value is refused', !S('anthropic_key', 'x'.repeat(8193), {}).ok);
check('a jama credential without a token is refused', !S('jama', { user: 'w' }, { baseHost: 'a.b.com' }).ok);
check('extra fields in the jama value are dropped, not stored', Object.keys(S('jama', { user: 'w', token: 't', extra: 'x' }, { baseHost: 'a.b.com' }).value).join() === 'user,token');
check('an unexpected detail is refused', !S('anthropic_key', 'k', { url: 'https://x' }).ok);
check('a detail that is not plain text is refused', !S('anthropic_key', 'k', { last4: { a: 1 } }).ok);
for (const h of ['localhost', '10.0.0.5', '192.168.1.1', 'jama.local', 'svc.internal', 'a.localhost', 'x', '', 'a..b', '[::1]']) {
  check('jama host refused: ' + JSON.stringify(h), !S('jama', { user: 'w', token: 't' }, { baseHost: h }).ok);
}
check('a baseHost on the AI key is refused (it only belongs to the connector)', !S('anthropic_key', 'k', { baseHost: 'a.b.com' }).ok);
{
  const M = mutant("if (!Object.prototype.hasOwnProperty.call(SECRET_KINDS, k)) return { ok: false, error: 'unknown secret kind' };", '');
  check('MUTATION: without the kind list an unknown kind gets through (what the guard prevents)', M.checkSecret('evil', 'x', {}).ok === true || M.checkSecret('evil', 'x', {}).error !== 'unknown secret kind');
}
check('main.js: saveSecret stores only what checkSecret returns', /const c = R\.checkSecret\(payload && payload\.kind, payload && payload\.value, payload && payload\.meta\);[\s\S]{0,120}secrets\.save\(c\.kind, c\.value, c\.meta\)/.test(main));
check('main.js: deleteSecret refuses an unknown kind', /slab:deleteSecret[\s\S]{0,200}R\.SECRET_KINDS/.test(main));

console.log('\n[ai] the own-key request is bounded');
const ok = { model: 'claude-opus-4-8', max_tokens: 100, messages: [{ role: 'user', content: 'x' }] };
check('a normal Claude request passes', R.aiBodyProblem(ok) === '');
check('a non-Claude model is refused', R.aiBodyProblem(Object.assign({}, ok, { model: 'gpt-4o' })) !== '');
check('a model name with odd characters is refused', R.aiBodyProblem(Object.assign({}, ok, { model: 'claude-x/../y' })) !== '');
check('no messages is refused', R.aiBodyProblem(Object.assign({}, ok, { messages: [] })) !== '');
check('over 32 MB is refused', R.aiBodyProblem(Object.assign({}, ok, { messages: [{ role: 'user', content: 'x'.repeat(R.AI_MAX_BODY_BYTES) }] })) !== '');
check('ai_main.requestProblem runs the bound', /return R\.aiBodyProblem\(body\);/.test(aiSrc) && require(path.join(ROOT, 'ai_main.js')).requestProblem({ ai: 'key', backend: 'own' }, Object.assign({}, ok, { model: 'gpt-4o' }), {}) !== '');
check('the ITAR refusal still comes first', require(path.join(ROOT, 'ai_main.js')).requestProblem({ ai: 'key', backend: 'own' }, ok, { itar: true }).indexOf('export-controlled') === 0);

console.log('\n[navigation] the app window stays inside its own bundle');
const APP = path.join(ROOT, 'app');
const fu = p => require('url').pathToFileURL(p).href;
check('a file inside the bundle is allowed', R.fileUrlInside(fu(path.join(APP, 'index.html')), APP));
check('a file inside the bundle with a query or hash is allowed', R.fileUrlInside(fu(path.join(APP, 'index.html')) + '?x=1#y', APP));
check('a file outside the bundle is refused', !R.fileUrlInside(fu(path.join(ROOT, 'settings.html')), APP));
check('a sibling folder whose name starts the same is refused', !R.fileUrlInside(fu(APP + '2/index.html'), APP));
check('climbing out with .. is refused', !R.fileUrlInside(fu(APP) + '/../main.js', APP) && !R.fileUrlInside(fu(APP) + '/%2e%2e/main.js', APP));
check('https, data and javascript addresses are refused', !R.fileUrlInside('https://evil.example/', APP) && !R.fileUrlInside('data:text/html,x', APP) && !R.fileUrlInside('javascript:alert(1)', APP));
check('a gate window may show only its own page', R.fileUrlIs(fu(path.join(ROOT, 'onboarding.html')), path.join(ROOT, 'onboarding.html')) && !R.fileUrlIs(fu(path.join(ROOT, 'lock.html')), path.join(ROOT, 'onboarding.html')));
{
  const M = mutant('return p === root || p.startsWith(root + path.sep);', 'return p === root || p.startsWith(root);');
  check('MUTATION: a prefix check without the separator lets a sibling folder through', M.fileUrlInside(fu(APP + '2/index.html'), APP) === true);
}
check('main.js: the app window\'s navigation lock is the bundle rule', /lockNavigation\(mainWindow, \(url\) => R\.fileUrlInside\(url, APP_DIR\)\)/.test(main));
check('main.js: gate and settings windows are locked to their own page', /lockNavigation\(win, \(url\) => R\.fileUrlIs\(url, own\)\)/.test(main) && /lockNavigation\(settingsWindow, \(url\) => R\.fileUrlIs\(url, own\)\)/.test(main));
check('main.js: the lock covers redirects too', /win\.webContents\.on\('will-navigate', guard\);\s*win\.webContents\.on\('will-redirect', guard\);/.test(main));
check('main.js: the old "any file:// is fine" rule is gone', !/url\.startsWith\('file:\/\/'\)/.test(main));

console.log('\n[ipc] each channel answers only its own window');
const wcA = { id: 1 }, wcB = { id: 2 };
const appExp = { webContents: wcA, dir: APP };
check('the app window\'s top frame on its bundle: answered', R.ipcSenderOk({ webContents: wcA, isMainFrame: true, url: fu(path.join(APP, 'index.html')) }, appExp));
check('another window: refused', !R.ipcSenderOk({ webContents: wcB, isMainFrame: true, url: fu(path.join(APP, 'index.html')) }, appExp));
check('a subframe of the right window: refused', !R.ipcSenderOk({ webContents: wcA, isMainFrame: false, url: fu(path.join(APP, 'index.html')) }, appExp));
check('the right window showing something else: refused', !R.ipcSenderOk({ webContents: wcA, isMainFrame: true, url: 'https://evil.example/' }, appExp));
check('no such window open: refused', !R.ipcSenderOk({ webContents: wcA, isMainFrame: true, url: fu(path.join(APP, 'index.html')) }, null));
{
  const M = mutant('if (sender.webContents !== expected.webContents) return false;', '');
  check('MUTATION: without the window check another window is answered', M.ipcSenderOk({ webContents: wcB, isMainFrame: true, url: fu(path.join(APP, 'index.html')) }, appExp) === true);
}
// Every handler in main.js opens with its sender check.
const handlers = [...main.matchAll(/ipcMain\.(handle|on)\('([^']+)',\s*(async\s*)?\((e)?[^)]*\)\s*=>\s*/g)]
  .map(m => ({ name: m[2], body: main.slice(m.index + m[0].length, m.index + m[0].length + 200).replace(/^\{\s*/, '') }));
check('main.js registers the 22 channels', handlers.length === 22, String(handlers.length));
for (const h of handlers) {
  const want = h.name.startsWith('gate:') ? 'fromGate(e)' : (/^slab:(secrets|saveSecret|deleteSecret|aiMessages|bridgeGet)/.test(h.name) ? 'fromApp(e)' : 'fromSettings(e)');
  const first = h.body.replace(/^if \(!/, '');
  check('channel ' + h.name + ' checks ' + want + ' first', first.startsWith(want), h.body.slice(0, 60));
}
check('main.js: a sender is described by its window, top frame and page', /function senderOf\(e\) \{ const f = e && e\.senderFrame; return \{ webContents: e && e\.sender, isMainFrame: !!f && !f\.parent, url: f \? f\.url : '' \}; \}/.test(main));

console.log('\n[files] activation.json is owner-only');
check('saveActivation chmods 600 after writing', /function saveActivation\(a\) \{[\s\S]{0,300}fs\.writeFileSync\(activationPath\(\)[\s\S]{0,400}fs\.chmodSync\(activationPath\(\), 0o600\)/.test(main));

console.log('\n[pin] host name without the port, and the live configuration');
const pinCfg = { backend: 'own', backendUrl: 'https://safety.acme.test:8443', backendPin: 'a'.repeat(64) };
const leaf = 'sha256/' + Buffer.from('a'.repeat(64), 'hex').toString('base64');
check('a pinned server on port 8443 is trusted by its host name', R.pinDecision('safety.acme.test', [leaf], pinCfg) === 0);
check('another host is still refused', R.pinDecision('other.acme.test', [leaf], pinCfg) === -3);
{
  const M = mutant('host !== hostnameOf(cfg.backendUrl)', 'host !== hostOf(cfg.backendUrl)');
  check('MUTATION: comparing host:port to the host name never matches (the bug)', M.pinDecision('safety.acme.test', [leaf], pinCfg) === -3);
}
check('main.js: the pin reads the configuration on every check', /setCertificateVerifyProc\(\(request, callback\) => \{\s*try \{\s*const cfg = readConfig\(\);/.test(main) && /installCertificatePin\(part\);/.test(main));

console.log('\n[csp] the app window gets a content security policy');
{
  const sample = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src *"></head><body><script src="https://d3js.org/d3.v7.min.js"></script></body></html>';
  const f = path.join(TMP, 'index.html'); fs.writeFileSync(f, sample);
  const run = () => cp.spawnSync('python3', [path.join(ROOT, 'patch-index.py'), f], { encoding: 'utf8' });
  const r1 = run(), r2 = run();
  const out = fs.readFileSync(f, 'utf8');
  check('patch-index.py runs (twice, idempotent)', r1.status === 0 && r2.status === 0, (r1.stderr || '') + (r2.stderr || ''));
  check('exactly one policy, the desktop one (any older one replaced)', (out.match(/Content-Security-Policy/g) || []).length === 1 && !/default-src \*/.test(out));
  for (const d of ["object-src 'none'", "base-uri 'self'", "form-action 'none'", "script-src 'self' 'unsafe-inline' file:", "frame-src 'self' file: blob:"]) check('policy carries ' + d, out.indexOf(d) >= 0);
  check('no eval allowed (the web enforces the same)', out.indexOf("'unsafe-eval'") < 0);
}

console.log('\n[onboarding] finishing setup with the license already on this computer');
check('gate:complete falls back to the stored license when none is handed over, and still verifies it', /const blob = String\(data\.license \|\| ''\)\.trim\(\) \|\| String\(loadActivation\(\)\.license \|\| ''\)\.trim\(\);\s*const inst = await installLicense\(blob\);/.test(main));
check('the page sends no license on that path (why the fallback is needed)', /license: state\.license \|\| undefined/.test(read('onboarding.html')) && /state\.licenseOk = true; state\.license = '';/.test(read('onboarding.html')));

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
