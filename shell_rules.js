// Safety Lab Aero — desktop shell RULES. PURE (no Electron), so the desktop test wall executes them.
// main.js is the only other consumer. (6 Sep 2026, desktop parity rebuild)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

// Safety Lab's OWN demo cloud — trials / demos / internal only. Must match site/slab_config.js.
const HOSTED = Object.freeze({
  dbHost: 'fhrqkhdrwbfnizkepkch.supabase.co',
  aiHost: 'api.safetylabaero.com',
  webApp: 'https://safetylabaero.com/app'
});

function hostOf(u) { try { return new URL(u).host.toLowerCase(); } catch (_) { return ''; } }
function isSafetyLabHost(h) { h = String(h || '').toLowerCase(); return h === HOSTED.dbHost || /(^|\.)safetylabaero\.com$/.test(h); }

// The desktop's three backend cases → the web's config modes:
//   'safetylab' → demo cloud (hosted defaults; mode 'desktop' in slab_config)
//   'own'       → the customer's own server (mode 'self-hosted'; the leak check applies)
//   'files'     → files only, no backend (mode 'browser-only')
function backendHostFor(cfg) {
  if (cfg.backend === 'own') return hostOf(cfg.backendUrl);
  if (cfg.backend === 'safetylab') return HOSTED.dbHost;
  return '';
}

// Which hosts may the app window reach under this configuration? Everything else is refused
// at the network layer. Fonts, analytics, anything not named here: refused.
function allowedHosts(cfg) {
  const hosts = new Set();
  if (cfg.backend === 'safetylab') hosts.add(HOSTED.dbHost);
  if (cfg.backend === 'own' && cfg.backendUrl) hosts.add(hostOf(cfg.backendUrl));
  if (cfg.ai === 'own' && cfg.aiEndpoint) hosts.add(hostOf(cfg.aiEndpoint));
  // ai === 'key' adds NOTHING here on purpose: the page never calls Anthropic. The main process
  // does, with the key from the keychain (ai_main.js), outside the renderer's fence.
  if (cfg.ai === 'safetylab' && cfg.backend === 'safetylab') hosts.add(HOSTED.aiHost);
  hosts.delete('');
  return hosts;
}
function egressAllowed(url, cfg) {
  let u; try { u = new URL(String(url)); } catch (_) { return false; }
  if (u.protocol === 'file:' || u.protocol === 'data:' || u.protocol === 'blob:' || u.protocol === 'devtools:') return true;
  if (u.protocol !== 'https:' && u.protocol !== 'wss:') return false;
  return allowedHosts(cfg).has(u.host.toLowerCase());
}

// Mirrors slab_config.js's hard stop, decided BEFORE the window opens so the user gets one plain
// sentence instead of a refused boot. '' = fine. Every rule here exists because the web has it.
function configProblem(cfg) {
  cfg = cfg || {};
  if (!['safetylab', 'own', 'files'].includes(cfg.backend)) return 'Choose where your data lives: Safety Lab\'s trial cloud, your organization\'s server, or files only.';
  if (!['safetylab', 'own', 'off', 'key'].includes(cfg.ai)) return 'Choose an AI setting.';
  if (cfg.ai === 'key' && cfg.backend === 'safetylab') return 'Your own AI key is for your organization\'s server or files-only installs; the trial cloud uses Safety Lab\'s AI.';
  if (cfg.backend === 'own') {
    if (!cfg.backendUrl || !cfg.backendKey) return 'Your organization\'s server address and key are both required.';
    if (!/^https:\/\//i.test(cfg.backendUrl)) return 'Your organization\'s server address must start with https://.';
    if (isSafetyLabHost(hostOf(cfg.backendUrl))) return 'Your organization\'s server must not be a Safety Lab address.';
    if (cfg.ai === 'safetylab') return 'With your organization\'s server, AI must run on your organization\'s endpoint (or be off) — nothing may reach Safety Lab.';
    if (cfg.ai === 'own' && (!cfg.aiEndpoint || isSafetyLabHost(hostOf(cfg.aiEndpoint)))) return 'Enter your organization\'s own AI endpoint (not a Safety Lab address) or set AI to Off.';
    if (cfg.webAppUrl && isSafetyLabHost(hostOf(cfg.webAppUrl))) return 'The web address must be your organization\'s own, not Safety Lab\'s.';
  }
  if (cfg.backend === 'files') {
    if (cfg.ai === 'safetylab') return 'Files-only installs cannot use Safety Lab\'s AI — choose your organization\'s endpoint or Off.';
    if (cfg.ai === 'own' && (!cfg.aiEndpoint || isSafetyLabHost(hostOf(cfg.aiEndpoint)))) return 'Enter your organization\'s own AI endpoint or set AI to Off.';
    if (cfg.backendUrl || cfg.backendKey) return 'Files-only installs must not have a server address configured.';
  }
  if (cfg.backend === 'safetylab' && cfg.ai === 'own' && !cfg.aiEndpoint) return 'Enter your organization\'s AI endpoint or choose Safety Lab\'s AI.';
  return '';
}

// What the preload hands the web bundle. ONLY addresses and the license — never a tier, a token,
// or a name. The web's slab_config.js and slab_license.js decide everything from these.
function overridesFor(cfg, licenseBlob, version) {
  const o = { __SLAB_DESKTOP__: true };
  if (licenseBlob) o.__SLAB_LICENSE__ = String(licenseBlob);
  if (cfg.backend === 'own') { o.__SLAB_SUPABASE_URL__ = String(cfg.backendUrl).replace(/\/+$/, ''); o.__SLAB_SUPABASE_KEY__ = String(cfg.backendKey); }
  if (cfg.backend === 'files') o.__SLAB_LOCAL_ONLY__ = true;
  if (cfg.ai === 'own' && cfg.aiEndpoint) o.__SLAB_AI_ENDPOINT__ = String(cfg.aiEndpoint).replace(/\/+$/, '');
  if (cfg.ai === 'off') o.__SLAB_AI_OFF__ = true;
  if (cfg.ai === 'key') o.__SLAB_AI_DESKTOP_KEY__ = true;   // the page routes AI through slabAi; no endpoint
  if (cfg.backend === 'own' && cfg.webAppUrl) o.__SLAB_WEB_APP_URL__ = String(cfg.webAppUrl).replace(/\/+$/, '');
  o.slabDesktop = { isDesktop: true, version: String(version || ''), backend: cfg.backend, ai: cfg.ai, ssoRedirect: 'safetylab://auth-callback' };
  return o;
}

// The ONE license verifier: the web bundle's own app/slab_license.js loaded in Node. Loading that
// exact file (not a copy) is what makes "one license" true: same keys, same rules, same reasons.
function loadVerifier(appDir) {
  const src = fs.readFileSync(path.join(appDir, 'slab_license.js'), 'utf8');
  const W = { localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }, crypto: crypto.webcrypto, SLConfig: { mode: 'hosted-demo', supabaseUrl: '' } };
  const doc = { readyState: 'complete', addEventListener() {}, getElementById() { return null; }, body: { appendChild() {} }, documentElement: { appendChild() {} }, createElement() { return { setAttribute() {}, addEventListener() {}, innerHTML: '', id: '' }; } };
  const ctx = { window: W, document: doc, console: { info() {}, warn() {}, error() {}, log() {} }, URL, TextEncoder, TextDecoder, atob: s => Buffer.from(s, 'base64').toString('binary'), localStorage: W.localStorage, setTimeout, Date, JSON, Math, Number, String, Array, Object, Uint8Array, Promise, isNaN, FileReader: function () {}, location: { reload() {} } };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  if (typeof W.SLLicenseVerify !== 'function' || !Array.isArray(W.SLLicensePublicKeys)) throw new Error('slab_license.js did not expose the verifier — is app/ pulled from a current web build?');
  return { verify: W.SLLicenseVerify, keys: W.SLLicensePublicKeys, plain: W.SLLicensePlainReason || (r => String(r)) };
}
async function verifyLicenseBlob(v, blob, cfg, maxSeen, keysOverride) {
  const r = await v.verify(String(blob || ''), { now: Date.now(), keys: keysOverride || v.keys, subtle: crypto.webcrypto.subtle, backendHost: backendHostFor(cfg || {}), email: '', tenant: '', maxSeen: Number(maxSeen || 0) || 0 });
  r.plain = v.plain(r.reason);
  return r;
}

// Deep links. Returns {kind:'open', id, backend} | {kind:'auth', url} | null.
function parseDeepLink(raw) {
  let u; try { u = new URL(String(raw)); } catch (_) { return null; }
  if (u.protocol !== 'safetylab:') return null;
  const where = (u.host || u.pathname.replace(/^\/+/, '')).toLowerCase();
  if (where === 'open') {
    const id = (u.searchParams.get('project') || '').toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return null;
    return { kind: 'open', id, backend: (u.searchParams.get('backend') || '').toLowerCase() };
  }
  if (where === 'auth-callback') return { kind: 'auth', url: String(raw) };
  return null;
}

// ---- auto-update policy (15 Sep 2026) -----------------------------------------------------------
// Whether this build may DOWNLOAD and INSTALL an update on its own, per platform. Two facts decide it:
//
//   Windows: electron-updater does not need a code-signing certificate to update safely. It checks
//     the downloaded installer's SHA-512 against latest.yml, and latest.yml is verified against our
//     own ES256 key (update_verify.js) before a byte is fetched, so the chain is our key -> manifest
//     -> hash -> payload. Authenticode would only remove the SmartScreen notice at install; it adds
//     nothing to integrity. ON.
//   macOS: electron-updater REFUSES to update an app that is not code-signed ("Could not get code
//     signature for running application"). That is Apple's rule, not ours. ON only when the build
//     was signed, which release.sh records in BUILD_INFO.json as codeSigned.mac from CSC_LINK.
//   Linux: manual.
//
// Pure so the wall can execute every branch. buildInfo is app/BUILD_INFO.json or null.
function autoUpdatePolicy(platform, buildInfo) {
  if (platform === 'win32') return { auto: true, reason: 'windows: manifest signature + sha512 chain' };
  if (platform === 'darwin') {
    const signed = !!(buildInfo && buildInfo.codeSigned && buildInfo.codeSigned.mac === true);
    return signed ? { auto: true, reason: 'macos: build is code-signed' }
                  : { auto: false, reason: 'macos: unsigned build; electron-updater cannot apply updates without an Apple Developer ID' };
  }
  return { auto: false, reason: platform + ': manual updates' };
}

// The TOCTOU closer. update_verify.js verifies latest-*.yml and its signature; electron-updater then
// fetches latest-*.yml AGAIN on its own and would trust whatever it gets. Before we let it download,
// the update it reports must be the one we verified: same version, and every payload hash it intends
// to check against must appear in the manifest we signed. A host that swapped the manifest between
// the two fetches gets nothing.
function updateMatchesVerified(info, verified) {
  try {
    if (!info || !verified || verified.status !== 'update') return false;
    if (String(info.version || '') !== String(verified.version || '')) return false;
    const ours = new Set((verified.files || []).map(f => String(f.sha512 || '')).filter(Boolean));
    if (!ours.size) return false;
    const theirs = (info.files || []).map(f => String((f && f.sha512) || '')).filter(Boolean);
    if (!theirs.length) return false;
    return theirs.every(h => ours.has(h));
  } catch (_) { return false; }
}

// ---- the pinned server certificate (2 Oct 2026) ------------------------------------------------
// A customer's own server often has no certificate from a public or corporate CA; the install
// script then makes its own root and signs the server with it. Rather than every user installing
// that root by hand, the setup file carries the root's SHA-256 fingerprint and the desktop trusts
// THAT root for THAT server name only. It is tighter than a CA, not looser: one exact root, one
// exact host, nothing else changes. A pin is only ever consulted when the normal check failed;
// a server that already has a valid certificate never touches it.
//
// Fingerprints arrive as Electron gives them ("sha256/<base64>") or as the install script writes
// them (64 hex chars); both normalize to lowercase hex so a pin can be compared byte for byte.
function normalizeFingerprint(fp) {
  const s = String(fp || '').trim();
  if (/^sha256\//i.test(s)) { try { return Buffer.from(s.slice(7), 'base64').toString('hex').toLowerCase(); } catch (_) { return ''; } }
  const hex = s.replace(/[:\s]/g, '').toLowerCase();
  return /^[0-9a-f]{64}$/.test(hex) ? hex : '';
}
// Returns the value Electron's setCertificateVerifyProc wants: 0 = trust, -3 = use Chromium's own
// verdict. chainFingerprints: the presented chain, leaf first, as Electron fingerprints.
// cfg.backendPin: one or more fingerprints, comma-separated (the install writes the root it made
// and the server certificate it signed, both long-lived). Accept when ANY pinned fingerprint is
// anywhere in the presented chain; Chromium may or may not hand us the root itself.
function normalizePins(list) {
  return String(list || '').split(',').map(normalizeFingerprint).filter(Boolean);
}
function pinDecision(hostname, chainFingerprints, cfg) {
  try {
    if (!cfg || cfg.backend !== 'own' || !cfg.backendPin) return -3;
    const pins = normalizePins(cfg.backendPin); if (!pins.length) return -3;
    const host = String(hostname || '').toLowerCase();
    if (!host || host !== hostOf(cfg.backendUrl)) return -3;
    const chain = (chainFingerprints || []).map(normalizeFingerprint).filter(Boolean);
    if (!chain.length) return -3;
    return chain.some(f => pins.includes(f)) ? 0 : -3;
  } catch (_) { return -3; }
}

// ---- the setup file (2 Oct 2026) -----------------------------------------------------------------
// One file from the customer's own install, so a user configures the desktop with one click instead
// of typing three addresses and hunting for a license. It may carry ONLY what a browser bundle already
// carries in the open: the server address, the server's PUBLISHABLE key, the AI endpoint, the web
// address, and the signed license blob. It is refused if it carries anything that looks like a
// secret, if it points at a Safety Lab address on a customer install, or if its shape is wrong.
// The caller still runs the license through the ONE verifier against this config before saving.
const SETUP_FORMAT = 'safetylab-setup/1';
const SETUP_FIELDS = ['backend', 'backendUrl', 'backendKey', 'ai', 'aiEndpoint', 'webAppUrl', 'backendPin'];
function parseSetupFile(text) {
  let j;
  try { j = JSON.parse(String(text || '')); } catch (_) { return { ok: false, error: 'This is not a Safety Lab Aero setup file.' }; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return { ok: false, error: 'This is not a Safety Lab Aero setup file.' };
  if (j.format !== SETUP_FORMAT) return { ok: false, error: 'This setup file is for a different version of Safety Lab Aero.' };
  for (const k of Object.keys(j)) {
    if (k === 'format' || k === 'license' || k === 'note' || SETUP_FIELDS.includes(k)) continue;
    return { ok: false, error: 'The setup file carries a field it must not (' + k + '). Ask whoever made it to regenerate it.' };
  }
  const cfg = {};
  for (const k of SETUP_FIELDS) cfg[k] = j[k] == null ? '' : String(j[k]).trim();
  if (!cfg.backend) cfg.backend = cfg.backendUrl ? 'own' : 'files';
  if (!cfg.ai) cfg.ai = cfg.aiEndpoint ? 'own' : 'off';
  if (cfg.backend === 'safetylab' || cfg.ai === 'safetylab') return { ok: false, error: 'A setup file is for your organization\'s own server; it cannot point at Safety Lab.' };
  // A publishable key is public by design. Anything else in that slot is someone's secret, and a
  // secret must never travel in a file that is handed around; refuse rather than store it.
  const key = cfg.backendKey;
  if (key && !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key) && !/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) {
    return { ok: false, error: 'The server key in this setup file is not a publishable key. Ask whoever made it to regenerate it.' };
  }
  if (/^sb_secret_/.test(key) || /service_role/.test(key)) return { ok: false, error: 'The setup file carries a server secret. It must not. Ask whoever made it to regenerate it.' };
  for (const k of ['backendUrl', 'aiEndpoint', 'webAppUrl']) {
    if (cfg[k] && /[?#]/.test(cfg[k])) return { ok: false, error: 'An address in the setup file carries extra parameters; it must be a plain https address.' };
  }
  if (cfg.backendPin) {
    const raw = cfg.backendPin.split(',').map(x => x.trim()).filter(Boolean);
    const n = normalizePins(cfg.backendPin);
    if (!n.length || n.length !== raw.length) return { ok: false, error: 'A server certificate fingerprint in the setup file is malformed. Ask whoever made it to regenerate it.' };
    if (cfg.backend !== 'own') return { ok: false, error: 'A certificate fingerprint only makes sense with a server address.' };
    cfg.backendPin = n.join(',');
  }
  const problem = configProblem(cfg);
  if (problem) return { ok: false, error: problem };
  const license = j.license == null ? '' : String(j.license).trim();
  return { ok: true, config: cfg, license };
}

module.exports = { HOSTED, hostOf, isSafetyLabHost, backendHostFor, allowedHosts, egressAllowed, configProblem, overridesFor, loadVerifier, verifyLicenseBlob, parseDeepLink, autoUpdatePolicy, updateMatchesVerified, parseSetupFile, SETUP_FORMAT, normalizeFingerprint, normalizePins, pinDecision };
