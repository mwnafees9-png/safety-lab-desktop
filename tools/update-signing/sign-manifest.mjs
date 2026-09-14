#!/usr/bin/env node
/*
 * Safety Lab Aero — desktop UPDATE-MANIFEST signing tool. (14 Sep 2026, S24)
 *
 * Run this on YOUR machine. The private key never leaves it and never goes in the repo or in chat.
 * Only the PUBLIC key is baked into the app (update_verify.js PUBLIC_KEYS).
 *
 * This signs the electron-updater manifests (latest-mac.yml / latest.yml / latest-linux.yml) so the
 * desktop app can trust them independently of the host they are served from. publish-desktop.sh
 * calls `sign` for each manifest before upload; if the key is missing it refuses to publish rather
 * than shipping an unsigned feed.
 *
 *   node tools/update-signing/sign-manifest.mjs keygen
 *       First run. Makes an ECDSA P-256 keypair. Writes the PRIVATE key to
 *       ~/.safetylab/update_signing_key.pem (mode 0600, outside the repo) and prints the PUBLIC key
 *       record — paste it into update_verify.js PUBLIC_KEYS.
 *
 *   node tools/update-signing/sign-manifest.mjs sign dist/latest-mac.yml
 *       Writes dist/latest-mac.yml.sig  =  <kid>.<base64url(raw r||s signature)>  over
 *       DOMAIN + the exact manifest bytes.
 *
 *   node tools/update-signing/sign-manifest.mjs verify dist/latest-mac.yml
 *       Sanity-checks the .sig beside it against the local public key.
 *
 * Algorithm: ECDSA P-256 / SHA-256 ("ES256"), signature raw r||s (ieee-p1363) — identical to the
 * licence tool, so the app verifies both the same way. A SEPARATE key from the licence key
 * (different purpose, different custody file) plus a domain-separation prefix means a licence
 * signature can never be replayed as an update signature or vice versa.
 */
import { generateKeyPairSync, createSign, createVerify, createPublicKey, createPrivateKey } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DOMAIN = 'SLAB-UPDATE-MANIFEST-v1\n';   // MUST equal UPDATE_MANIFEST_DOMAIN in update_verify.js
const KEYDIR = join(homedir(), '.safetylab');
const PRIV = join(KEYDIR, 'update_signing_key.pem');
const PUB  = join(KEYDIR, 'update_signing_key.pub.jwk.json');

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function die(msg) { console.error('ERROR: ' + msg); process.exit(1); }
function signedBytes(ymlPath) { return Buffer.concat([Buffer.from(DOMAIN, 'utf8'), readFileSync(ymlPath)]); }

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === 'keygen') {
  if (existsSync(PRIV)) die('a private key already exists at ' + PRIV + ' — refusing to overwrite. Move it aside first if you really mean to rotate.');
  mkdirSync(KEYDIR, { recursive: true, mode: 0o700 });
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  writeFileSync(PRIV, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  try { chmodSync(PRIV, 0o600); } catch (_) {}
  const jwk = publicKey.export({ format: 'jwk' });
  const pubRecord = { kid: 'slab-upd-' + new Date().toISOString().slice(0, 10), alg: 'ES256', kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
  writeFileSync(PUB, JSON.stringify(pubRecord, null, 2));
  console.log('Private key written to  ' + PRIV + '  (keep this; never share it)');
  console.log('Public key written to   ' + PUB);
  console.log('\nPaste this PUBLIC key into update_verify.js PUBLIC_KEYS (replace the UNPROVISIONED placeholder):\n');
  console.log(JSON.stringify(pubRecord));
  process.exit(0);
}

if (cmd === 'sign') {
  const [file] = rest;
  if (!file) die('usage: sign dist/latest-mac.yml');
  if (!existsSync(file)) die('no such manifest: ' + file);
  if (!existsSync(PRIV)) die('no private key at ' + PRIV + ' — run keygen first');
  const pub = JSON.parse(readFileSync(PUB, 'utf8'));
  const key = createPrivateKey(readFileSync(PRIV, 'utf8'));
  const signer = createSign('SHA256'); signer.update(signedBytes(file)); signer.end();
  const sig = signer.sign({ key, dsaEncoding: 'ieee-p1363' });
  writeFileSync(file + '.sig', pub.kid + '.' + b64u(sig) + '\n');
  console.log('Signed  ' + file + '  →  ' + file + '.sig  (kid ' + pub.kid + ')');
  process.exit(0);
}

if (cmd === 'verify') {
  const [file] = rest;
  if (!file) die('usage: verify dist/latest-mac.yml');
  if (!existsSync(file + '.sig')) die('no signature beside it: ' + file + '.sig');
  const pub = JSON.parse(readFileSync(PUB, 'utf8'));
  const sigText = readFileSync(file + '.sig', 'utf8').trim();
  const sig = Buffer.from(sigText.slice(sigText.indexOf('.') + 1).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const key = createPublicKey({ key: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }, format: 'jwk' });
  const v = createVerify('SHA256'); v.update(signedBytes(file)); v.end();
  console.log(v.verify({ key, dsaEncoding: 'ieee-p1363' }, sig) ? 'OK — signature matches the local public key' : 'BAD — signature does NOT match');
  process.exit(0);
}

console.error('usage: sign-manifest.mjs keygen | sign <yml> | verify <yml>');
process.exit(1);
