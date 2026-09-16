// ============================================================================
// secrets.js — OS-keychain-backed secret storage for the desktop app.
// NEW 16 Sep 2026.
//
// WHY THIS EXISTS. The 5 Sep security audit listed "Jama username+password ...
// in plaintext localStorage" among the HIGH findings. On the web door the answer
// is the database vault (customer-install/db/08_user_secrets_vault.sql). On the
// desktop there is no database to put it in, so the answer is the OS keychain:
// Electron's safeStorage encrypts with Keychain on macOS, DPAPI on Windows and
// libsecret on Linux. No new dependency — safeStorage ships with Electron.
//
// THE RULE, same as the database vault's: the renderer can WRITE a secret and
// can ask WHETHER one is stored, and can never read one back. Nothing in the
// page ever holds the value, so an XSS in ~230 classic scripts cannot lift it.
// Only the main process decrypts, and only to put the credential on an outbound
// request the user asked for.
//
// If the OS keychain is unavailable (a Linux box with no libsecret, say), we do
// NOT silently fall back to writing plaintext — saving fails and says why. A
// credential store that quietly stops encrypting is worse than one that refuses.
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

let _app = null, _safeStorage = null;
function init(app, safeStorage) { _app = app; _safeStorage = safeStorage; }

function secretsPath() { return path.join(_app.getPath('userData'), 'secrets.json'); }

function _readAll() {
  try { return JSON.parse(fs.readFileSync(secretsPath(), 'utf8')) || {}; }
  catch (_) { return {}; }
}
function _writeAll(all) {
  const p = secretsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(all, null, 2), 'utf8');
  // Owner-only. The keychain is the real protection; this is so a stray backup
  // or a shared machine does not hand the ciphertext around for free.
  try { fs.chmodSync(p, 0o600); } catch (_) {}
}

function available() {
  try { return !!(_safeStorage && _safeStorage.isEncryptionAvailable()); } catch (_) { return false; }
}

// kind: 'jama' | 'anthropic' | ... ; value: any JSON-serializable; meta: NON-SECRET only.
function save(kind, value, meta) {
  if (!kind) throw new Error('a secret needs a kind');
  if (!available()) {
    throw new Error('This computer has no available keychain, so the credential cannot be stored safely. Nothing was saved.');
  }
  const all = _readAll();
  all[String(kind)] = {
    enc: _safeStorage.encryptString(JSON.stringify(value)).toString('base64'),
    meta: meta || {},
    updatedAt: new Date().toISOString()
  };
  _writeAll(all);
  return status();
}

function remove(kind) {
  const all = _readAll();
  delete all[String(kind)];
  _writeAll(all);
  return status();
}

// What the renderer is allowed to know: that a secret exists, its non-secret
// meta, and when it was last written. Never the value.
function status() {
  const all = _readAll();
  return Object.keys(all).map(function (kind) {
    const e = all[kind] || {};
    return { kind: kind, meta: e.meta || {}, updatedAt: e.updatedAt || null };
  });
}

// MAIN PROCESS ONLY. Never exposed over IPC, never returned to a renderer.
function reveal(kind) {
  const e = _readAll()[String(kind)];
  if (!e || !e.enc) return null;
  try { return JSON.parse(_safeStorage.decryptString(Buffer.from(e.enc, 'base64'))); }
  catch (_) { return null; }
}

function metaFor(kind) {
  const e = _readAll()[String(kind)];
  return (e && e.meta) || null;
}

module.exports = { init, available, save, remove, status, reveal, metaFor, secretsPath };
