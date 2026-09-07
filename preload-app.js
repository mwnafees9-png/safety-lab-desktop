// Safety Lab Aero — desktop preload for the MAIN app window. REBUILT 6 Sep 2026.
//
// Runs before any page script. With contextIsolation:false it shares the page's window, and its
// ONLY job is to hand the web bundle the addresses and the license through the one config
// surface (window.__SLAB_* — read by app/slab_config.js and app/slab_license.js). It seeds NO
// identity, NO tier, NO token: the signed license decides the tier and the real sign-in decides
// who you are — the same two things that decide them on the web.
'use strict';
const fs = require('fs');
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
  try { Object.keys(o).forEach(function (k) { window[k] = o[k]; }); } catch (_) {}

  // SSO return: the shell receives safetylab://auth-callback?code=… (PKCE) from the system browser
  // and forwards the URL here; supabase-js exchanges the code for a session and fires SIGNED_IN,
  // which the auth gate handles exactly as on the web.
  window.__slabAuthCallback = async function (url) {
    try {
      const u = new URL(String(url));
      const code = u.searchParams.get('code');
      const sb = (typeof window.getSupabaseClient === 'function') ? window.getSupabaseClient() : null;
      if (!sb || !sb.auth) return false;
      if (code && typeof sb.auth.exchangeCodeForSession === 'function') { const r = await sb.auth.exchangeCodeForSession(code); return !r.error; }
      const h = new URLSearchParams(String(u.hash || '').replace(/^#/, ''));
      const at = h.get('access_token'), rt = h.get('refresh_token');
      if (at && rt && typeof sb.auth.setSession === 'function') { const r = await sb.auth.setSession({ access_token: at, refresh_token: rt }); return !r.error; }
    } catch (_) {}
    return false;
  };
})();
