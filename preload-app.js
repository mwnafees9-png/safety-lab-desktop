// Safety Lab Aero — desktop preload for the MAIN app window. REBUILT 6 Sep 2026.
//
// Its ONLY job is to hand the web bundle the addresses and the license through the one config
// surface (window.__SLAB_* — read by app/slab_config.js and app/slab_license.js). It seeds NO
// identity, NO tier, NO token: the signed license decides the tier and the real sign-in decides
// who you are — the same two things that decide them on the web.
//
// 17 Sep 2026 — contextIsolation is now ON for this window, so this file no longer shares the
// page's window object. Everything it hands over goes through contextBridge instead.
//
// WHY THAT MATTERS MORE THAN IT USED TO. Since 16 Sep this preload also exposes the connector
// bridge and the keychain writer. With isolation off, the page and the preload were one world:
// anything running in the page could reach the preload's own scope. Isolation puts a real
// boundary there, and what crosses it is now an explicit list rather than everything.
//
// Each __SLAB_* key is exposed UNDER ITS OWN NAME on purpose. The web bundle reads
// window.__SLAB_SUPABASE_URL__ exactly as it always has, on every door, so nothing in site/
// needed a desktop special case. The values arrive frozen and read-only, which is correct:
// nothing in the app has ever written to them.
'use strict';
const fs = require('fs');
const { contextBridge, ipcRenderer } = require('electron');
const R = require('./shell_rules.js');

(function () {
  function arg(prefix) {
    const a = (process.argv || []).find(function (x) { return x.indexOf(prefix) === 0; });
    return a ? a.slice(prefix.length) : '';
  }
  let cfg = {}, act = {};
  try { const p = arg('--slab-config-path='); if (p && fs.existsSync(p)) cfg = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) {}
  try { const p = arg('--slab-activation-path='); if (p && fs.existsSync(p)) act = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) {}
  cfg = Object.assign({ backend: 'safetylab', ai: 'safetylab' }, cfg || {});

  const o = R.overridesFor(cfg, act && act.license, arg('--slab-version='));
  Object.keys(o).forEach(function (k) {
    try { contextBridge.exposeInMainWorld(k, o[k]); }
    catch (e) { try { console.error('[slab preload] could not expose ' + k, e); } catch (_) {} }
  });

  // Secrets: write and ask, never read. There is deliberately no accessor that returns a value;
  // the credential only ever exists in the main process. See secrets.js.
  contextBridge.exposeInMainWorld('slabSecrets', {
    available: function () { return ipcRenderer.invoke('slab:secretsAvailable'); },
    status:    function () { return ipcRenderer.invoke('slab:secretsStatus'); },
    save:      function (kind, value, meta) { return ipcRenderer.invoke('slab:saveSecret', { kind: kind, value: value, meta: meta }); },
    remove:    function (kind) { return ipcRenderer.invoke('slab:deleteSecret', kind); }
  });

  // The ALM bridge: the page asks, the main process holds the credential and makes the request.
  contextBridge.exposeInMainWorld('slabBridge', {
    get: function (targetUrl) { return ipcRenderer.invoke('slab:bridgeGet', String(targetUrl)); }
  });

  // NOTE ON THE SSO RETURN. window.__slabAuthCallback used to be defined HERE, and it reached
  // into the page for window.getSupabaseClient(). That direction is exactly what isolation
  // forbids, and it was the only thing in this file that did it. It now lives in the page, in
  // site/auth_gate.js, where the Supabase client already is. main.js reaches it through
  // webContents.executeJavaScript, which runs in the page's own world and is unaffected by
  // isolation — so the shell side did not change at all.
})();
