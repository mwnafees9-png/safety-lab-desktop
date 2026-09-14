#!/usr/bin/env node
/*
 * Regression — the independent update-manifest verifier (14 Sep 2026, S24).
 *
 * WHAT IT GUARDS. The desktop must not trust an update manifest just because the host served it.
 * update_verify.js requires a valid ECDSA P-256 signature (raw r||s, over a domain-separated copy
 * of the exact manifest bytes) against a baked-in public key before it will believe a manifest —
 * and offers NOTHING when the signature is absent, wrong, made for another purpose, or when no key
 * is provisioned. This suite signs with a throwaway key (the real private key lives only on Waqas's
 * Mac) and drives every branch.
 *
 * PINNED:
 *   U1  a correctly signed manifest verifies; a newer version is offered, an older/equal is not
 *   U2  tamper the manifest by one byte  -> rejected (the sha512 chain the manifest carries is only
 *       trustworthy because the manifest itself is)
 *   U3  a signature from a different key -> rejected
 *   U4  a missing / malformed .sig       -> unverified, no update offered
 *   U5  DOMAIN separation: a signature over the raw bytes (no domain prefix — how a naive or a
 *       licence-style signer would sign) does NOT verify here
 *   U6  fail-closed: the shipped build's placeholder key verifies nothing
 *   U7  version compare, and the manifest parsers, on the real electron-builder shape
 *   U8  mutation: dropping the domain prefix inside the verifier lets the U5 cross-context signature
 *       through -> proves the domain check is load-bearing
 *
 * Run: node tests/update_verify.test.js       (release.sh runs every tests/*.test.js)
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const ROOT = path.join(__dirname, '..');
const UV = require(path.join(ROOT, 'update_verify.js'));

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// a throwaway signing identity, and a second one for the wrong-key test
function newKey(kid) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  return { kid, priv: privateKey, pub: { kid, alg: 'ES256', kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y } };
}
function sign(priv, kid, bytes, domain) {
  const signed = domain == null ? bytes : Buffer.concat([Buffer.from(domain, 'utf8'), bytes]);
  const s = crypto.createSign('SHA256'); s.update(signed); s.end();
  return kid + '.' + b64u(s.sign({ key: priv, dsaEncoding: 'ieee-p1363' }));
}

const SAMPLE = [
  'version: 0.18.0',
  'files:',
  '  - url: Safety Lab Aero-0.18.0-arm64-mac.zip',
  '    sha512: Ul925vdAYUE1ESP/MhgfkasGZewJWRSH+yWv3g5qc0FUK+QCoH6apqsnZw4Nc7KyuYn53up3CtDasJJ4Yc2J5w==',
  '    size: 96310101',
  '  - url: SafetyLabAero-mac-arm64.dmg',
  '    sha512: p6SIBSw57R6lqKGcvvc/Q67PUMuxI4+D6vvGAXZRmkARQgDM+OpgqaGnAk5IalJGra24iWHhNzBRPohkEasxAg==',
  '    size: 99671517',
  "path: Safety Lab Aero-0.18.0-arm64-mac.zip",
  'sha512: Ul925vdAYUE1ESP/MhgfkasGZewJWRSH+yWv3g5qc0FUK+QCoH6apqsnZw4Nc7KyuYn53up3CtDasJJ4Yc2J5w==',
  "releaseDate: '2026-09-14T00:00:00.000Z'", ''
].join('\n');
const ymlBuf = Buffer.from(SAMPLE, 'utf8');
const KEY = newKey('slab-upd-test'), OTHER = newKey('slab-upd-other');
const KEYS = [KEY.pub];

console.log('[U1] a correctly signed manifest verifies');
{
  const sig = sign(KEY.priv, KEY.kid, ymlBuf, UV.UPDATE_MANIFEST_DOMAIN);
  const r = UV.verifyManifest(ymlBuf, sig, KEYS);
  check('signature verifies and names the key', r.ok === true && r.kid === 'slab-upd-test', JSON.stringify(r));
}

console.log('\n[U2] one tampered byte is rejected');
{
  const sig = sign(KEY.priv, KEY.kid, ymlBuf, UV.UPDATE_MANIFEST_DOMAIN);
  const tampered = Buffer.from(SAMPLE.replace('96310101', '96310102'), 'utf8');   // change a size the payload chain relies on
  const r = UV.verifyManifest(tampered, sig, KEYS);
  check('a manifest changed after signing does not verify', r.ok === false, JSON.stringify(r));
}

console.log('\n[U3] a signature from a different key is rejected');
{
  const sig = sign(OTHER.priv, KEY.kid, ymlBuf, UV.UPDATE_MANIFEST_DOMAIN);   // OTHER signs, but claims KEY's kid
  const r = UV.verifyManifest(ymlBuf, sig, KEYS);
  check('a foreign signature (even wearing a known kid) is rejected', r.ok === false, JSON.stringify(r));
}

console.log('\n[U4] a missing or malformed signature is unverified');
{
  check('empty .sig', UV.verifyManifest(ymlBuf, '', KEYS).ok === false);
  check('garbage .sig', UV.verifyManifest(ymlBuf, 'not-a-signature', KEYS).ok === false);
  check('kid but empty sig', UV.verifyManifest(ymlBuf, 'slab-upd-test.', KEYS).ok === false);
}

console.log('\n[U5] domain separation: a non-domain (licence-style) signature does not verify');
{
  const rawSig = sign(KEY.priv, KEY.kid, ymlBuf, null);   // signed the bytes WITHOUT the domain prefix
  const r = UV.verifyManifest(ymlBuf, rawSig, KEYS);
  check('a signature over the bare bytes is not accepted as an update signature', r.ok === false, JSON.stringify(r));
}

console.log('\n[U6] the shipped build is fail-closed until a real key is pasted in');
{
  check('_isProvisioned is false for the baked-in placeholder', UV._isProvisioned(UV.PUBLIC_KEYS) === false, JSON.stringify(UV.PUBLIC_KEYS.map(k => k.kid)));
  const sig = sign(KEY.priv, KEY.kid, ymlBuf, UV.UPDATE_MANIFEST_DOMAIN);
  check('with only the placeholder key, even a real signature verifies nothing', UV.verifyManifest(ymlBuf, sig, UV.PUBLIC_KEYS).ok === false);
}

console.log('\n[U7] version compare and manifest parsing');
{
  check('parseManifestVersion reads the version', UV.parseManifestVersion(SAMPLE) === '0.18.0');
  const files = UV.parseManifestFiles(SAMPLE);
  check('parseManifestFiles reads every file with its sha512', files.length === 2 && files[0].url === 'Safety Lab Aero-0.18.0-arm64-mac.zip' && /^Ul925/.test(files[0].sha512) && files[0].size === 96310101, JSON.stringify(files));
  check('newer > older', UV.cmpVersion('0.18.0', '0.17.0') === 1 && UV.cmpVersion('0.17.0', '0.18.0') === -1 && UV.cmpVersion('0.17.0', '0.17.0') === 0);
  check('two-digit segments compare numerically, not as text', UV.cmpVersion('0.17.10', '0.17.9') === 1);
  check('a prerelease sorts below its release', UV.cmpVersion('0.18.0-rc.1', '0.18.0') === -1);
}

console.log('\n[U7b] checkForVerifiedUpdate end to end (injected fetch)');
(async () => {
  const sig = sign(KEY.priv, KEY.kid, ymlBuf, UV.UPDATE_MANIFEST_DOMAIN);
  const fetchOK = (u) => Promise.resolve(u.endsWith('.sig') ? sig : SAMPLE);
  const up = await UV.checkForVerifiedUpdate({ feedUrl: 'https://x/latest-mac.yml', currentVersion: '0.17.0', keys: KEYS, fetchText: fetchOK });
  check('newer + verified -> status update', up.status === 'update' && up.version === '0.18.0' && up.verified === true, JSON.stringify(up));
  const cur = await UV.checkForVerifiedUpdate({ feedUrl: 'https://x/latest-mac.yml', currentVersion: '0.18.0', keys: KEYS, fetchText: fetchOK });
  check('same version -> status current', cur.status === 'current', JSON.stringify(cur));
  const noSig = await UV.checkForVerifiedUpdate({ feedUrl: 'https://x/latest-mac.yml', currentVersion: '0.17.0', keys: KEYS, fetchText: (u) => u.endsWith('.sig') ? Promise.reject(new Error('404')) : Promise.resolve(SAMPLE) });
  check('a newer version with no signature -> unverified, not offered', noSig.status === 'unverified', JSON.stringify(noSig));
  const down = await UV.checkForVerifiedUpdate({ feedUrl: 'https://x/latest-mac.yml', currentVersion: '0.17.0', keys: KEYS, fetchText: () => Promise.reject(new Error('offline')) });
  check('feed unreachable -> status error, not offered', down.status === 'error', JSON.stringify(down));

  console.log('\n[U8] mutation: a verifier that drops the domain prefix accepts the cross-context signature');
  {
    const src = fs.readFileSync(path.join(ROOT, 'update_verify.js'), 'utf8');
    const mutated = src.replace('const signed = Buffer.concat([Buffer.from(UPDATE_MANIFEST_DOMAIN, \'utf8\'), buf]);', 'const signed = buf;');
    check('the mutation actually changed the source', mutated !== src);
    const m = { exports: {} };
    new Function('module', 'exports', 'require', mutated)(m, m.exports, require);
    const rawSig = sign(KEY.priv, KEY.kid, ymlBuf, null);
    check('WITHOUT the domain prefix the bare-bytes signature now passes (so the real code\'s prefix is what blocks it)', m.exports.verifyManifest(ymlBuf, rawSig, KEYS).ok === true);
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
