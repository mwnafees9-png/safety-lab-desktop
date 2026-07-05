// Safety Lab Aero — offline license validation (main process).
// Embeds ONLY the public key. A license is a string "SLA1.<payloadB64url>.<sigB64url>"
// signed by keys/private.pem (held by Safety Lab Aero, never shipped). Validation is
// fully offline: verify the Ed25519 signature, then check expiry. No network, no server.
'use strict';
const crypto = require('crypto');

const PUBLIC_KEY_PEM =
  '-----BEGIN PUBLIC KEY-----\n' +
  'MCowBQYDK2VwAyEAYCPKMS+uw5s2xu1ej8q8orTEdwsZS7sfC4gzOrqnH0s=\n' +
  '-----END PUBLIC KEY-----\n';

const b64urlBuf = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function validateLicense(keyString) {
  try {
    const parts = String(keyString || '').trim().split('.');
    if (parts.length !== 3 || parts[0] !== 'SLA1') {
      return { ok: false, error: "That doesn't look like a Safety Lab Aero license key." };
    }
    let pub;
    try { pub = crypto.createPublicKey(PUBLIC_KEY_PEM); }
    catch (e) { return { ok: false, error: 'License verifier misconfigured.' }; }

    const good = crypto.verify(null, Buffer.from(parts[1]), pub, b64urlBuf(parts[2]));
    if (!good) {
      return { ok: false, error: 'License signature is invalid — the key was altered or was not issued by Safety Lab Aero.' };
    }
    const payload = JSON.parse(b64urlBuf(parts[1]).toString('utf8'));
    if (payload.exp && (Date.now() / 1000) > payload.exp) {
      return { ok: false, expired: true, payload, error: 'This license expired on ' + new Date(payload.exp * 1000).toISOString().slice(0, 10) + '.' };
    }
    return { ok: true, payload };
  } catch (e) {
    return { ok: false, error: 'Could not read license: ' + e.message };
  }
}

module.exports = { validateLicense, PUBLIC_KEY_PEM };
