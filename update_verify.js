/*
 * update_verify.js — the desktop's INDEPENDENT update-manifest check. (14 Sep 2026, S24)
 *
 * THE HOLE THIS CLOSES. electron-updater trusts whatever `latest-mac.yml` / `latest.yml` the
 * update host serves: an update is only as trustworthy as a SHA-512 written in a file on that
 * same host. Anyone who controls updates.safetylabaero.com could rewrite the manifest AND the
 * payload it points at and ship code. The proper native fix (an Apple Developer ID / a Windows
 * Authenticode certificate, so electron-updater verifies the payload's own code signature) needs
 * a certificate that only exists once Safety Lab procures it.
 *
 * This module is the independent lock that does NOT need that certificate: Safety Lab signs the
 * manifest with an ECDSA P-256 key whose private half never leaves Waqas's machine, and the app
 * verifies that signature against a PUBLIC key baked in here before it believes a word of the
 * manifest. A compromised host cannot forge the signature, so it cannot announce, suppress, or
 * (when auto-update is turned on) push an update. It is the same key custody pattern as the
 * offline licence, and it stays valuable AFTER the native certificate exists — two independent
 * locks, not one.
 *
 * Same crypto as tools/license/sign.mjs: ES256, signature is raw r||s (ieee-p1363), which is what
 * WebCrypto and node's verify agree on. What is signed is the DOMAIN string followed by the exact
 * manifest bytes, so a signature made for anything else (a licence, a different feed) can never be
 * replayed here.
 *
 * Pure and dependency-free so tests/update_verify.test.js can drive every branch. main.js supplies
 * the fetch; nothing here touches the network or the disk on its own.
 */
'use strict';
const crypto = require('crypto');

// Domain separation: prepended to the manifest bytes before signing and before verifying.
// Bump the version suffix only with a deliberate format change (old signatures then stop verifying).
const UPDATE_MANIFEST_DOMAIN = 'SLAB-UPDATE-MANIFEST-v1\n';

// The PUBLIC key(s) that verify a manifest signature. Waqas provisions this with
//   node tools/update-signing/sign-manifest.mjs keygen
// and pastes the printed record here. MULTIPLE keys are allowed so a key can be rotated: add the
// new one, ship, then drop the old one once no manifest signed with it is still being served.
// The placeholder kid below verifies NOTHING (its coordinates are zeros) — until a real key is
// pasted in, every manifest reads as UNVERIFIED and no update is ever offered. That is fail-closed
// on purpose: a missing key must never mean "trust the host".
const PUBLIC_KEYS = [
  // { kid: 'slab-upd-2026-09-14', alg: 'ES256', kty: 'EC', crv: 'P-256', x: '…', y: '…' }
  { kid: 'slab-upd-UNPROVISIONED', alg: 'ES256', kty: 'EC', crv: 'P-256', x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', y: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }
];

function _isProvisioned(keys) {
  return (keys || []).some(k => k && k.kid && k.kid !== 'slab-upd-UNPROVISIONED' && /[^A]/.test(String(k.x || '')));
}

const _unb64u = (s) => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');

// A .sig file is  <kid>.<base64url(raw r||s signature)>  — kid tells us which public key to try
// (rotation) but is advisory: we still require a real cryptographic match, and fall back to trying
// every key if the kid does not name one we hold.
function _parseSig(sigText) {
  const t = String(sigText || '').trim();
  const dot = t.indexOf('.');
  if (dot <= 0) return { kid: '', sig: null };
  return { kid: t.slice(0, dot), sig: _unb64u(t.slice(dot + 1)) };
}

/**
 * Verify a detached manifest signature.
 * @param {Buffer|string} manifestBytes  the exact bytes of latest-*.yml as served
 * @param {string} sigText               the contents of latest-*.yml.sig
 * @param {Array}  keys                  public-key records (defaults to the baked-in PUBLIC_KEYS)
 * @returns {{ok:boolean, kid:string, reason:string}}
 */
function verifyManifest(manifestBytes, sigText, keys) {
  keys = keys || PUBLIC_KEYS;
  try {
    if (!_isProvisioned(keys)) return { ok: false, kid: '', reason: 'no update-signing key is provisioned in this build' };
    const buf = Buffer.isBuffer(manifestBytes) ? manifestBytes : Buffer.from(String(manifestBytes), 'utf8');
    const { kid, sig } = _parseSig(sigText);
    if (!sig || !sig.length) return { ok: false, kid: kid, reason: 'signature missing or malformed' };
    const signed = Buffer.concat([Buffer.from(UPDATE_MANIFEST_DOMAIN, 'utf8'), buf]);
    // try the key the sig names first, then any other held key (rotation window)
    const ordered = keys.slice().sort((a, b) => (a.kid === kid ? -1 : b.kid === kid ? 1 : 0));
    for (const k of ordered) {
      if (!k || k.kid === 'slab-upd-UNPROVISIONED') continue;
      try {
        const pub = crypto.createPublicKey({ key: { kty: k.kty, crv: k.crv, x: k.x, y: k.y }, format: 'jwk' });
        const v = crypto.createVerify('SHA256'); v.update(signed); v.end();
        if (v.verify({ key: pub, dsaEncoding: 'ieee-p1363' }, sig)) return { ok: true, kid: k.kid, reason: 'ok' };
      } catch (_) { /* try the next key */ }
    }
    return { ok: false, kid: kid, reason: 'signature did not match any known key' };
  } catch (e) {
    return { ok: false, kid: '', reason: 'verify threw: ' + ((e && e.message) || e) };
  }
}

// ---- manifest parsing (electron-builder latest-*.yml) ------------------------------------------
// Deliberately minimal and format-specific rather than a YAML dependency: the only shapes we read
// are the ones electron-builder emits (version, files[], path, sha512).
function parseManifestVersion(text) {
  const m = String(text || '').match(/^version:\s*['"]?([0-9][0-9A-Za-z.\-+]*)['"]?\s*$/m);
  return m ? m[1] : '';
}
function parseManifestFiles(text) {
  const out = [];
  const re = /-\s*url:\s*(.+?)\s*\n\s*sha512:\s*(\S+)\s*\n(?:\s*size:\s*(\d+)\s*\n)?/g;
  let m; const s = String(text || '');
  while ((m = re.exec(s))) out.push({ url: m[1].trim().replace(/^['"]|['"]$/g, ''), sha512: m[2].trim(), size: m[3] ? Number(m[3]) : null });
  return out;
}

// x.y.z compare. A prerelease (x.y.z-rc.1) sorts BELOW its release. Returns -1 / 0 / 1 (a vs b).
function cmpVersion(a, b) {
  const split = (v) => { const [core, pre] = String(v || '0').split('-'); return { core: core.split('.').map(n => parseInt(n, 10) || 0), pre: pre || '' }; };
  const A = split(a), B = split(b);
  for (let i = 0; i < Math.max(A.core.length, B.core.length); i++) {
    const d = (A.core[i] || 0) - (B.core[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  if (A.pre === B.pre) return 0;
  if (!A.pre) return 1;          // release > prerelease
  if (!B.pre) return -1;
  return A.pre < B.pre ? -1 : 1;
}

/**
 * The whole verified check, given an injected fetcher (main.js passes an https-backed one).
 * fetchText(url) must resolve to the response text or reject.
 * Returns one of:
 *   { status:'update',      version, verified:true }   a newer version, manifest signature verified
 *   { status:'current' }                               manifest verified, not newer
 *   { status:'unverified',  reason }                   manifest present but signature absent/invalid → offer NOTHING
 *   { status:'error',       reason }                   could not reach the feed
 * Fail-closed: anything short of a good signature over a newer version offers no update.
 */
async function checkForVerifiedUpdate(opts) {
  const feedUrl = opts.feedUrl;                      // e.g. https://updates.safetylabaero.com/desktop/latest-mac.yml
  const currentVersion = opts.currentVersion;
  const keys = opts.keys || PUBLIC_KEYS;
  const fetchText = opts.fetchText;
  try {
    const yml = await fetchText(feedUrl);
    let sigText = '';
    try { sigText = await fetchText(feedUrl + '.sig'); } catch (_) { sigText = ''; }
    const v = verifyManifest(Buffer.from(yml, 'utf8'), sigText, keys);
    if (!v.ok) return { status: 'unverified', reason: v.reason };
    const version = parseManifestVersion(yml);
    if (!version) return { status: 'unverified', reason: 'manifest carried no version' };
    if (cmpVersion(version, currentVersion) > 0) return { status: 'update', version: version, verified: true, files: parseManifestFiles(yml) };
    return { status: 'current', version: version };
  } catch (e) {
    return { status: 'error', reason: (e && e.message) || String(e) };
  }
}

module.exports = {
  UPDATE_MANIFEST_DOMAIN, PUBLIC_KEYS,
  verifyManifest, parseManifestVersion, parseManifestFiles, cmpVersion, checkForVerifiedUpdate,
  _isProvisioned
};
