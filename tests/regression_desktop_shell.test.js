#!/usr/bin/env node
/*
 * Regression — the desktop SHELL (6 Sep 2026 rebuild, "works like Office").
 *
 * Executes the pure rules in shell_rules.js (egress allowlist, config sanity, the overrides the
 * preload hands the web bundle, deep-link parsing, the ONE license verifier loaded from the
 * pulled bundle) and checks the shell's structure: no second license system, no seeded
 * identity/tier/token, DevTools off in packaged builds, safetylab:// registered, updates gated by
 * an independently-signed manifest (S24), auto-applied only where the platform allows it (Windows
 * now; macOS once code-signed) and pinned to the verified manifest, and app/
 * pulled by pull-web.sh from a stripped web build.
 *
 * Run: node tests/regression_desktop_shell.test.js     (release.sh runs every tests/*.test.js)
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ROOT = path.join(__dirname, '..');
const read = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (_) { return ''; } };
const exists = f => fs.existsSync(path.join(ROOT, f));
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const R = require(path.join(ROOT, 'shell_rules.js'));
const main = read('main.js'), preload = read('preload-app.js'), pkg = JSON.parse(read('package.json') || '{}');

(async function () {
  console.log('\n[gone] the second license system and the seeded identity are DELETED');
  for (const f of ['license.js', 'sync-app.sh', 'signin.html', 'preload-onboarding.js', 'wrangler.jsonc']) check('file gone: ' + f, !exists(f));
  for (const dead of ['SLA1', 'Ed25519', 'PUBLIC_KEY_PEM', 'desktop-local', 'desktop@local', 'Desktop User', '--slab-tier=', 'safetyLab.license.tier', 'safetyLab.signup.email', 'profileName', 'profileEmail', 'collabMode', 'aiMode']) {
    check('gone from main.js + preload-app.js: ' + dead, strip(main + preload).indexOf(dead) < 0);   // comments stripped first (the header lists what was removed)
  }
  check('preload seeds NOTHING into localStorage', !/localStorage/.test(strip(preload)));
  check('preload hands the bundle only what shell_rules.overridesFor returns', /R\.overridesFor\(cfg, act && act\.license/.test(preload));
  check('package.json files list carries no license.js / signin.html / preload-onboarding.js', Array.isArray(pkg.build && pkg.build.files) && !pkg.build.files.some(f => /license\.js|signin\.html|preload-onboarding/.test(f)));
  check('package.json files list carries shell_rules.js, preload-gate.js, lock.html', ['shell_rules.js', 'preload-gate.js', 'lock.html'].every(f => (pkg.build.files || []).includes(f)));

  console.log('\n[shell] structure');
  check('DevTools only outside packaged builds (webPreferences.devTools = !app.isPackaged, menu item gated)', /devTools: !app\.isPackaged/.test(main) && /if \(!app\.isPackaged\) view\.push\(\{ role: 'toggleDevTools' \}\)/.test(main));
  check('gate + settings windows are isolated (contextIsolation:true, sandbox:true)', (main.match(/contextIsolation: true, nodeIntegration: false, sandbox: true/g) || []).length === 2);
  check('safetylab:// registered + single-instance lock + open-url/second-instance handled', /setAsDefaultProtocolClient\(PROTOCOL\)/.test(main) && /requestSingleInstanceLock\(\)/.test(main) && /app\.on\('open-url'/.test(main) && /app\.on\('second-instance'/.test(main));
  check('the app window gets the egress guard installed on its own partition before it loads', /installEgressGuard\(part, cfg\);[\s\S]{0,600}new BrowserWindow\(/.test(main) && /partition: 'persist:slab-app'/.test(main));
  check('egress guard cancels anything not allowed (webRequest.onBeforeRequest → cancel:true)', /onBeforeRequest\(\{ urls: \['<all_urls>'\] \}[\s\S]{0,500}cb\(\{ cancel: true \}\)/.test(main));
  check('the license verifier is the PULLED web module (shell_rules.loadVerifier over app/)', /R\.loadVerifier\(path\.join\(__dirname, 'app'\)\)/.test(main) && !/createPublicKey|crypto\.verify\(/.test(main));
  check('config sanity runs BEFORE the window opens (openMainApp → configProblem → Settings)', /function openMainApp\(\) \{[\s\S]{0,400}configProblem\(cfg\)[\s\S]{0,300}openSettings\(\); return;/.test(main));
  check('the update policy is decided by shell_rules.autoUpdatePolicy, not a hardcoded flag', /const UPDATE_POLICY = R\.autoUpdatePolicy\(process\.platform, readBuildInfo\(\)\);/.test(main) && !/AUTO_UPDATE_SIGNED/.test(main));
  check('policy OFF = manual only, no background check', /if \(!UPDATE_POLICY\.auto\) \{\s*\n\s*if \(!manual\) return;/.test(main) && /if \(UPDATE_POLICY\.auto\) setTimeout/.test(main));
  check('policy ON never auto-downloads blind: autoDownload=false and the download is pinned to the verified manifest', /autoUpdater\.autoDownload = false;/.test(main) && /R\.updateMatchesVerified\(info, _lastVerified\)/.test(main) && /autoUpdater\.downloadUpdate\(\)/.test(main) && !/autoUpdater\.autoDownload = true/.test(main));

  console.log('\n[update policy] executed');
  const pol = R.autoUpdatePolicy;
  check('windows: auto ON (manifest signature + sha512 chain needs no certificate)', pol('win32', null).auto === true);
  check('macos unsigned: auto OFF (electron-updater refuses unsigned apps)', pol('darwin', null).auto === false && pol('darwin', { codeSigned: { mac: false } }).auto === false);
  check('macos signed: auto ON', pol('darwin', { codeSigned: { mac: true } }).auto === true);
  check('macos: a truthy-but-not-true flag does not count as signed', pol('darwin', { codeSigned: { mac: 'yes' } }).auto === false && pol('darwin', { codeSigned: { mac: 1 } }).auto === false);
  check('linux: manual', pol('linux', { codeSigned: { mac: true } }).auto === false);
  const V = { status: 'update', version: '0.18.0', files: [{ url: 'a.exe', sha512: 'AAA' }, { url: 'b.zip', sha512: 'BBB' }] };
  const M = R.updateMatchesVerified;
  check('pin: same version, hashes in the verified manifest -> download', M({ version: '0.18.0', files: [{ sha512: 'AAA' }] }, V) === true);
  check('pin: version differs -> refuse', M({ version: '0.18.1', files: [{ sha512: 'AAA' }] }, V) === false);
  check('pin: hash not in the verified manifest -> refuse (swapped payload)', M({ version: '0.18.0', files: [{ sha512: 'ZZZ' }] }, V) === false);
  check('pin: one good hash and one bad -> refuse (every hash must match)', M({ version: '0.18.0', files: [{ sha512: 'AAA' }, { sha512: 'ZZZ' }] }, V) === false);
  check('pin: electron-updater reports no hashes -> refuse (nothing to bind to)', M({ version: '0.18.0', files: [] }, V) === false && M({ version: '0.18.0' }, V) === false);
  check('pin: no verified manifest / not an update -> refuse', M({ version: '0.18.0', files: [{ sha512: 'AAA' }] }, null) === false && M({ version: '0.18.0', files: [{ sha512: 'AAA' }] }, { status: 'current', version: '0.18.0' }) === false);
  check('pin: verified manifest with no hashes -> refuse (never bind to an empty set)', M({ version: '0.18.0', files: [{ sha512: 'AAA' }] }, { status: 'update', version: '0.18.0', files: [] }) === false);
  check('release.sh stamps codeSigned.mac from CSC_LINK into BUILD_INFO before packaging', /MAC_SIGNED=false; \[ -n "\$\{CSC_LINK:-\}" \] && MAC_SIGNED=true/.test(read('release.sh')) && /b\.codeSigned=\{mac:process\.argv\[1\]==="true"/.test(read('release.sh')));

  console.log('\n[S24] independent update-manifest verification');
  check('update_verify.js ships (in package.json files) and exists', (pkg.build.files || []).includes('update_verify.js') && exists('update_verify.js'));
  check('the manifest lock is ON and main.js verifies the manifest before trusting it', /const AUTO_UPDATE_MANIFEST_VERIFIED = true;/.test(main) && /const UV = require\('\.\/update_verify\.js'\)/.test(main) && /UV\.checkForVerifiedUpdate\(/.test(main));
  check('the manual check acts on the verified result; an unverified manifest offers nothing', /verified\.status === 'update'/.test(main) && /verified\.status === 'unverified'/.test(main) && /Could not verify the update/.test(main));
  check('the native auto path (once a cert exists) also refuses an unverified manifest', /refusing auto-update: manifest unverified/.test(main));
  const UVm = require(path.join(ROOT, 'update_verify.js'));
  check('update_verify is fail-closed: an unprovisioned key set verifies nothing', UVm._isProvisioned([{ kid: 'slab-upd-UNPROVISIONED', x: 'AAA' }]) === false && UVm.verifyManifest(Buffer.from('x'), 'k.zz', [{ kid: 'slab-upd-UNPROVISIONED', x: 'AAA' }]).ok === false);
  check('publish-desktop.sh signs each manifest and refuses to publish without the key', /sign-manifest\.mjs" sign/.test(read('publish-desktop.sh')) && /no update-signing key/.test(read('publish-desktop.sh')) && /latest-mac\.yml\.sig/.test(read('publish-desktop.sh')));
  check('will-attach-webview refused; new windows only open https externally', /will-attach-webview[^\n]*preventDefault/.test(main) && (main.match(/\/\^https:\\\/\\\/\/i\.test\(url\)/g) || []).length >= 3);
  check('"Open This Project on the Web" uses the bundle\'s own openInWebLink (never a hard-coded Safety Lab address)', /window\.openInWebLink \? window\.openInWebLink\(\) : ""/.test(main) && !/openExternal\(HOSTED_WEB_APP/.test(main));

  console.log('\n[rules] egress allowlist — EXECUTED');
  const trial = { backend: 'safetylab', ai: 'safetylab' };
  const own = { backend: 'own', backendUrl: 'https://db.customer.com', backendKey: 'k', ai: 'own', aiEndpoint: 'https://ai.customer.com/v1/ai', webAppUrl: 'https://safety.customer.com/app' };
  const files = { backend: 'files', ai: 'off' };
  check('trial desktop may reach our demo db + our AI, nothing else', R.egressAllowed('https://fhrqkhdrwbfnizkepkch.supabase.co/rest/v1/x', trial) && R.egressAllowed('wss://fhrqkhdrwbfnizkepkch.supabase.co/realtime', trial) && R.egressAllowed('https://api.safetylabaero.com/v1/ai/anthropic/messages', trial) && !R.egressAllowed('https://fonts.googleapis.com/css2', trial) && !R.egressAllowed('https://cdn.jsdelivr.net/npm/x', trial));
  check('customer desktop may reach ITS db + ITS AI and NEVER Safety Lab', R.egressAllowed('https://db.customer.com/auth/v1/token', own) && R.egressAllowed('https://ai.customer.com/v1/ai/x', own) && !R.egressAllowed('https://fhrqkhdrwbfnizkepkch.supabase.co/rest/v1/x', own) && !R.egressAllowed('https://api.safetylabaero.com/v1/ai', own) && !R.egressAllowed('https://safetylabaero.com/app', own));
  check('files-only desktop reaches NOTHING on the network', !R.egressAllowed('https://db.customer.com/x', files) && !R.egressAllowed('https://api.safetylabaero.com/x', files) && R.allowedHosts(files).size === 0);
  check('local schemes always allowed (file:, data:, blob:); http: never', R.egressAllowed('file:///app/index.html', files) && R.egressAllowed('data:text/plain,x', files) && R.egressAllowed('blob:null/abc', files) && !R.egressAllowed('http://db.customer.com/x', own));
  check('files + own AI: only the AI host', R.egressAllowed('https://ai.customer.com/v1', { backend: 'files', ai: 'own', aiEndpoint: 'https://ai.customer.com/v1' }) && R.allowedHosts({ backend: 'files', ai: 'own', aiEndpoint: 'https://ai.customer.com/v1' }).size === 1);
  check('garbage url → refused', !R.egressAllowed('not a url', trial) && !R.egressAllowed('', trial));

  console.log('\n[rules] config sanity mirrors the web hard stop — EXECUTED');
  check('trial config fine', R.configProblem(trial) === '');
  check('customer config fine', R.configProblem(own) === '');
  check('files-only fine', R.configProblem(files) === '');
  check('own server + Safety Lab AI → refused (would reach us)', /Safety Lab/.test(R.configProblem(Object.assign({}, own, { ai: 'safetylab' }))));
  check('own server that IS a Safety Lab address → refused', /Safety Lab/.test(R.configProblem(Object.assign({}, own, { backendUrl: 'https://fhrqkhdrwbfnizkepkch.supabase.co' }))));
  check('own server without key → refused', /required/.test(R.configProblem(Object.assign({}, own, { backendKey: '' }))));
  check('own server over http:// → refused', /https/.test(R.configProblem(Object.assign({}, own, { backendUrl: 'http://db.customer.com' }))));
  check('own server + own AI but AI endpoint blank → refused', /AI endpoint/.test(R.configProblem(Object.assign({}, own, { aiEndpoint: '' }))));
  check('own server + AI endpoint that is a Safety Lab address → refused', /Safety Lab/.test(R.configProblem(Object.assign({}, own, { aiEndpoint: 'https://api.safetylabaero.com/v1/ai' }))));
  check('own server + web address at Safety Lab → refused', /web address/.test(R.configProblem(Object.assign({}, own, { webAppUrl: 'https://safetylabaero.com/app' }))));
  check('files + Safety Lab AI → refused', /Files-only/.test(R.configProblem({ backend: 'files', ai: 'safetylab' })));
  check('files + a leftover server address → refused', /Files-only/.test(R.configProblem({ backend: 'files', ai: 'off', backendUrl: 'https://x' })));
  check('unknown backend value → refused', R.configProblem({ backend: 'cloud', ai: 'off' }) !== '');

  console.log('\n[rules] what the preload hands the bundle — EXECUTED');
  let o = R.overridesFor(trial, 'LICBLOB', '0.16.0');
  check('trial: desktop flag + license only (hosted defaults fill the rest); NO tier/token/identity keys', o.__SLAB_DESKTOP__ === true && o.__SLAB_LICENSE__ === 'LICBLOB' && !('__SLAB_SUPABASE_URL__' in o) && !('__SLAB_LOCAL_ONLY__' in o) && !Object.keys(o).some(k => /tier|token|email|name/i.test(k)));
  o = R.overridesFor(own, 'LICBLOB', '0.16.0');
  check('own: db url+key, AI endpoint, web address handed over (trailing slashes trimmed)', o.__SLAB_SUPABASE_URL__ === 'https://db.customer.com' && o.__SLAB_SUPABASE_KEY__ === 'k' && o.__SLAB_AI_ENDPOINT__ === 'https://ai.customer.com/v1/ai' && o.__SLAB_WEB_APP_URL__ === 'https://safety.customer.com/app');
  o = R.overridesFor(files, '', '0.16.0');
  check('files: LOCAL_ONLY + AI OFF, no license key when none is on file', o.__SLAB_LOCAL_ONLY__ === true && o.__SLAB_AI_OFF__ === true && !('__SLAB_LICENSE__' in o));
  check('slabDesktop carries the SSO return address for ms_sso', o.slabDesktop && o.slabDesktop.ssoRedirect === 'safetylab://auth-callback' && o.slabDesktop.isDesktop === true);
  o = R.overridesFor(Object.assign({}, trial, { ai: 'off' }), 'L', '0.16.0');
  check('trial + AI off → AI OFF flag (the web blanks the AI endpoint)', o.__SLAB_AI_OFF__ === true);
  // ALLOWLIST: whatever the config, the preload may hand the bundle ONLY these keys. A tier, a
  // token, an identity — anything else — is a regression to the seeded-identity model.
  const ALLOWED = new Set(['__SLAB_DESKTOP__', '__SLAB_LICENSE__', '__SLAB_SUPABASE_URL__', '__SLAB_SUPABASE_KEY__', '__SLAB_LOCAL_ONLY__', '__SLAB_AI_ENDPOINT__', '__SLAB_AI_OFF__', '__SLAB_WEB_APP_URL__', 'slabDesktop']);
  const extra = [];
  for (const c of [trial, own, files, Object.assign({}, trial, { ai: 'off' }), Object.assign({}, files, { ai: 'own', aiEndpoint: 'https://ai.customer.com/v1' })]) for (const k of Object.keys(R.overridesFor(c, 'L', '1'))) if (!ALLOWED.has(k)) extra.push(k);
  check('overrides carry ONLY the allowlisted keys under every configuration (no tier/token/identity, ever)', extra.length === 0, extra.join(','));

  console.log('\n[rules] deep links — EXECUTED');
  const ID = '5b5f1c3e-9f7e-4a5f-9d1e-3c2b1a0f9e8d';
  let d = R.parseDeepLink('safetylab://open?project=' + ID.toUpperCase() + '&backend=DB.customer.com');
  check('open link parsed (id + backend lower-cased)', d && d.kind === 'open' && d.id === ID && d.backend === 'db.customer.com');
  check('open link with a non-id project → null (never executed)', R.parseDeepLink('safetylab://open?project=../x') === null);
  check('auth callback recognised', (R.parseDeepLink('safetylab://auth-callback?code=abc') || {}).kind === 'auth');
  check('other schemes / hosts → null', R.parseDeepLink('https://evil/open?project=' + ID) === null && R.parseDeepLink('safetylab://elsewhere') === null && R.parseDeepLink('garbage') === null);
  check('main.js refuses an open link for a DIFFERENT backend', /link\.backend && mine && link\.backend !== mine/.test(main));

  console.log('\n[bundle] app/ is the pulled, stripped web build');
  const hasApp = exists('app/index.html');
  const info = (() => { try { return JSON.parse(read('app/BUILD_INFO.json')); } catch (_) { return null; } })();
  check('app/ present and pulled by pull-web.sh (BUILD_INFO.json)', hasApp && !!info && /^[0-9a-f]{40}$/.test(info.webCommit || ''), hasApp ? 'run: bash pull-web.sh' : 'app/ missing — run: bash pull-web.sh');
  if (hasApp && info) {
    const idx = read('app/index.html');
    check('no remote <script> left in the bundle (offline-capable; egress allowlist never admits a CDN)', !/<script[^>]+src="https?:\/\//.test(idx));
    // esbuild keeps the one legal banner (/*! Patent pending … */) by design; everything else — the
    // ~3,000 rationale/prompt comment lines in the readable source — must be gone.
    const aiLines = (read('app/ai_assistant.js').match(/^\s*\/\//mg) || []).length;
    check('bundle is STRIPPED (the readable source\'s ~3,000 comment lines are gone; no HTML comments)', aiLines < 20 && !/<!--/.test(idx), aiLines + ' comment lines in app/ai_assistant.js');
    check('bundle carries slab_config.js + slab_license.js (the config surface + the license)', exists('app/slab_config.js') && exists('app/slab_license.js') && /slab_license\.js\?v=/.test(idx));
    let bad = 0; for (const [f, h] of Object.entries(info.manifest || {})) { try { if (crypto.createHash('md5').update(fs.readFileSync(path.join(ROOT, 'app', f))).digest('hex') !== h) bad++; } catch (_) { bad++; } }
    check('every file in app/ matches the BUILD_INFO checksum manifest (nothing hand-edited since the pull)', bad === 0, bad + ' mismatched');
    check('vendored libraries present (d3, chart, supabase)', ['d3.v7.min.js', 'chart.umd.min.js', 'supabase.min.js'].every(f => exists('app/vendor/' + f)));
    // the ONE verifier: load it from the pulled bundle and prove it verifies with an ephemeral key
    try {
      const v = R.loadVerifier(path.join(ROOT, 'app'));
      check('verifier loads from the pulled bundle and carries a public key', typeof v.verify === 'function' && v.keys.length >= 1);
      const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const jwk = publicKey.export({ format: 'jwk' }); const KX = { kid: 'kx', alg: 'ES256', kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
      const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const sign = (p) => { const pb = b64u(Buffer.from(JSON.stringify(Object.assign({ kid: 'kx' }, p)), 'utf8')); const s = crypto.createSign('SHA256'); s.update(Buffer.from(pb, 'utf8')); s.end(); return pb + '.' + b64u(s.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' })); };
      const now = Date.now();
      const lic = (over) => Object.assign({ v: 1, alg: 'ES256', issuer: 'safetylabaero', id: 'SL-LIC-T', customer: 'Shell Co', tier: 'enterprise', seats: 2, bind: { backend: 'db.customer.com' }, issuedAt: new Date(now - 86400000).toISOString(), notBefore: new Date(now - 86400000).toISOString(), notAfter: new Date(now + 30 * 86400000).toISOString() }, over || {});
      const ok = await R.verifyLicenseBlob(v, sign(lic()), own, 0, [KX]);
      check('a license bound to the customer\'s backend verifies on the customer desktop (ephemeral key)', ok.valid === true && ok.customer === 'Shell Co');
      const wrong = await R.verifyLicenseBlob(v, sign(lic()), trial, 0, [KX]);
      check('the same license REFUSES on a trial desktop (bound to a different backend) with a plain reason', wrong.valid === false && /different server/.test(wrong.plain));
      const shipped = await R.verifyLicenseBlob(v, sign(lic()), own, 0);
      check('an ephemeral-key license does NOT verify against the SHIPPED keys', shipped.valid === false && shipped.reason === 'signature invalid');
      const rolled = await R.verifyLicenseBlob(v, sign(lic()), own, now + 365 * 86400000, [KX]);
      check('clock rollback (activation remembers a newer license) → refused', rolled.valid === false && /clock/.test(rolled.plain));
    } catch (e) { check('verifier loads from the pulled bundle', false, e.message); }
  }

  console.log('\n[pipeline] pull-web.sh + release.sh refuse the unproven');
  const pull = read('pull-web.sh'), rel = read('release.sh');
  check('pull-web refuses a dirty web tree', /git -C "\$WEB" status --porcelain/.test(pull) && /uncommitted changes/.test(pull));
  check('pull-web runs the WEB wall (ship.sh --dry) and the runtime smoke gate', /ship\.sh --dry/.test(pull) && /smoke_gate\.js/.test(pull));
  check('pull-web copies dist/ (stripped), never site/', /cp -R "\$WEB\/dist\/\." "\$APP"\//.test(pull) && !/cp -R "\$WEB\/site/.test(pull) && !/\$SRC/.test(pull));
  check('pull-web refuses a web build without slab_license.js / a public key', /dist\/slab_license\.js missing/.test(pull) && /carries NO public key/.test(pull));
  check('pull-web writes BUILD_INFO.json with the web commit + checksum manifest', /BUILD_INFO\.json/.test(pull) && /webCommit: commit/.test(pull) && /manifest\[f\] = crypto/.test(pull));
  check('release.sh: pull → desktop wall → package; refuses SKIP_WALL', /pull-web\.sh"[\s\S]*desktop wall[\s\S]*electron-builder/.test(rel) && /SKIP_WALL[\s\S]{0,80}refusing to release/.test(rel));
  check('package.json: version 0.16.0+, scripts point at release.sh / pull-web.sh, no wrangler scripts', /^0\.(1[6-9]|[2-9]\d)\./.test(pkg.version || '') && /release\.sh/.test(pkg.scripts && pkg.scripts.release || '') && /pull-web\.sh/.test(pkg.scripts && pkg.scripts.pull || '') && !(pkg.scripts && (pkg.scripts.deploy || pkg.scripts.preview)) && !(pkg.devDependencies && pkg.devDependencies.wrangler));

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL  suite crashed — ' + e.message); process.exit(1); });
