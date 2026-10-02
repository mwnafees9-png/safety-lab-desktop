#!/usr/bin/env node
/*
 * Regression — the user's OWN AI key, used from the main process (2 Oct 2026).
 *
 * Executes ai_main.js against a stub keychain and a stub fetch: the request is refused unless
 * this computer is set to "my own key", never on the trial cloud, never for an export-controlled
 * project; the key goes on the header and never into an error; the answer streams back head
 * first then chunks. Mutation-proven: with the ITAR check gone, controlled text would go out.
 * Also pins the shell rules: the 'key' AI mode validates, adds NO host to the renderer's fence,
 * and hands the page the flag and no endpoint.
 *
 * Run: node tests/regression_own_ai_key.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ROOT = path.join(__dirname, '..');
const R = require(path.join(ROOT, 'shell_rules.js'));

// stub the keychain before ai_main loads it
const secretsPath = require.resolve(path.join(ROOT, 'secrets.js'));
require.cache[secretsPath] = { id: secretsPath, filename: secretsPath, loaded: true, exports: { reveal: (k) => (k === 'anthropic_key' ? 'sk-ant-TESTKEY' : null) } };
const AI = require(path.join(ROOT, 'ai_main.js'));
const KEYCFG = { backend: 'files', ai: 'key' }, OWNCFG = { backend: 'own', backendUrl: 'https://s.example.com', backendKey: 'sb_publishable_x', ai: 'key' };
const BODY = { model: 'claude-x', messages: [{ role: 'user', content: 'hi' }], stream: true };

(async () => {
  console.log('\n[rules] the key mode in shell_rules');
  check('files + key validates', R.configProblem(KEYCFG) === '');
  check('own server + key validates', R.configProblem(OWNCFG) === '');
  check('trial cloud + key refused', R.configProblem({ backend: 'safetylab', ai: 'key' }) !== '');
  check('renderer fence gains no host in key mode', !R.allowedHosts(KEYCFG).has('api.anthropic.com') && R.allowedHosts(KEYCFG).size === 0);
  check('page gets the flag and no endpoint', R.overridesFor(KEYCFG, '', '1').__SLAB_AI_DESKTOP_KEY__ === true && !R.overridesFor(KEYCFG, '', '1').__SLAB_AI_ENDPOINT__);
  check('page does not get the flag in any other mode', !R.overridesFor({ backend: 'files', ai: 'off' }, '', '1').__SLAB_AI_DESKTOP_KEY__);

  console.log('\n[refusals] requestProblem');
  check('wrong mode refused', !!AI.requestProblem({ backend: 'files', ai: 'own' }, BODY, {}));
  check('trial cloud refused', !!AI.requestProblem({ backend: 'safetylab', ai: 'key' }, BODY, {}));
  check('malformed body refused', !!AI.requestProblem(KEYCFG, { nope: 1 }, {}));
  check('export-controlled refused', /export-controlled/.test(AI.requestProblem(KEYCFG, BODY, { itar: true })));
  check('ordinary request accepted', AI.requestProblem(KEYCFG, BODY, { itar: false }) === '');

  console.log('\n[call] executed against a stub Anthropic');
  let seen = null;
  global.fetch = async (url, init) => {
    seen = { url, init };
    const enc = new TextEncoder();
    const chunks = ['event: message_start\ndata: {}\n\n', 'event: message_stop\ndata: {}\n\n'].map(s => enc.encode(s));
    let i = 0;
    const body = new ReadableStream({ pull(c) { if (i < chunks.length) c.enqueue(chunks[i++]); else c.close(); } });
    return { status: 200, headers: { get: (h) => (h === 'content-type' ? 'text/event-stream' : null) }, body };
  };
  const heads = [], chunks = [];
  const r = await AI.messages(KEYCFG, BODY, { itar: false }, (b) => chunks.push(Buffer.from(b).toString()), (h) => heads.push(h));
  check('ok with status and content type', r.ok && r.status === 200 && r.contentType === 'text/event-stream');
  check('only the Anthropic messages endpoint, POST, no redirects', seen.url === AI.ANTHROPIC_URL && seen.init.method === 'POST' && seen.init.redirect === 'error');
  check('the key is on the header, from the keychain', seen.init.headers['x-api-key'] === 'sk-ant-TESTKEY' && !!seen.init.headers['anthropic-version']);
  check('no browser-only header on a main-process call', !seen.init.headers['anthropic-dangerous-direct-browser-access']);
  check('head arrives once, before the chunks', heads.length === 1 && chunks.length === 2 && /message_start/.test(chunks[0]));
  check('body forwarded as sent', JSON.parse(seen.init.body).model === 'claude-x');

  console.log('\n[call] failure paths');
  global.fetch = async () => { throw new Error('ECONNREFUSED x-api-key: sk-ant-TESTKEY'); };
  const f = await AI.messages(KEYCFG, BODY, {}, () => {}, () => {});
  check('unreachable -> plain error, key never echoed', !f.ok && /Could not reach/.test(f.error) && !/sk-ant/.test(f.error));
  require.cache[secretsPath].exports.reveal = () => null;
  const nk = await AI.messages(KEYCFG, BODY, {}, () => {}, () => {});
  check('no key in the keychain -> says where to paste it, no request made', !nk.ok && /Paste your Anthropic key/.test(nk.error));

  console.log('\n[shell] wiring');
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8'), pre = fs.readFileSync(path.join(ROOT, 'preload-app.js'), 'utf8'), set = fs.readFileSync(path.join(ROOT, 'settings.html'), 'utf8');
  check('main handles slab:aiMessages through ai_main with the live config', /ipcMain\.handle\('slab:aiMessages'[\s\S]*aiMain\.messages\(readConfig\(\)/.test(main));
  const code = (t) => t.replace(/\/\/[^\n]*/g, '');
  check('still no slab:getSecret handler or caller (comments aside)', !/slab:getSecret/.test(code(main)) && !/slab:getSecret/.test(code(pre)));
  check('preload exposes slabAi only when the config says key', /if \(cfg\.ai === 'key'\) \{[\s\S]*exposeInMainWorld\('slabAi'/.test(pre));
  check('preload forwards the ITAR flag', /itar: !!\(meta && meta\.itar\)/.test(pre));
  check('settings offers the third AI choice', /name="ai" value="key"/.test(set));

  console.log('\n[mutation] with the ITAR check removed, controlled text goes out');
  {
    const src = fs.readFileSync(path.join(ROOT, 'ai_main.js'), 'utf8');
    const mutated = src.replace("if (meta && meta.itar === true) return 'export-controlled project: nothing leaves this computer';", "");
    check('mutation site present', mutated !== src);
    const m = new module.constructor(); m.paths = module.paths; m.filename = path.join(ROOT, 'ai_main_mutated.js'); m._compile(mutated, m.filename);
    check('mutation proven', m.exports.requestProblem(KEYCFG, BODY, { itar: true }) === '');
  }
  console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
