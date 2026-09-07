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
  if (!['safetylab', 'own', 'off'].includes(cfg.ai)) return 'Choose an AI setting.';
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

module.exports = { HOSTED, hostOf, isSafetyLabHost, backendHostFor, allowedHosts, egressAllowed, configProblem, overridesFor, loadVerifier, verifyLicenseBlob, parseDeepLink };
