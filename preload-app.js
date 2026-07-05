// Safety Lab Aero — desktop preload (main app window).
// Runs before any page script. With contextIsolation:false it shares the page's window,
// so it can (1) flag the desktop build, (2) optionally override the AI endpoint for
// air-gap deployments, and (3) seed a local profile + license so the offline app clears
// the hosted auth/paywall gate. Real on-prem licensing (license file / local model) is a
// follow-on — see task #56.
const fs = require('fs');

(function () {
  function arg(prefix) {
    const a = (process.argv || []).find(function (x) { return x.indexOf(prefix) === 0; });
    return a ? a.slice(prefix.length) : '';
  }

  let cfg = {};
  try {
    const p = arg('--slab-config-path=');
    if (p && fs.existsSync(p)) cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) { /* fall back to defaults below */ }

  const aiMode = cfg.aiMode || 'cloud';
  const endpoint = (aiMode === 'custom' && cfg.aiEndpoint)
    ? String(cfg.aiEndpoint).replace(/\/+$/, '')
    : '';

  // Collaboration backend override (auth + realtime co-authoring + the project_crdt store). Only
  // applied when the operator selects a custom self-hosted Supabase AND supplies BOTH its URL and
  // its anon key — a half-config falls back to the hosted backend rather than a broken client.
  const collabCustom = (cfg.collabMode === 'custom' && cfg.collabUrl && cfg.collabKey);
  const collabUrl = collabCustom ? String(cfg.collabUrl).replace(/\/+$/, '') : '';
  const collabKey = collabCustom ? String(cfg.collabKey) : '';

  // (1) + (2) — flag the desktop build and (optionally) override the AI + collaboration endpoints
  // BEFORE the SPA evaluates them (const AI_PROXY_BASE_URL / SUPABASE_PROJECT_URL = window.__SLAB_*__ || <hosted>).
  try {
    window.__SLAB_DESKTOP__ = true;
    if (endpoint) window.__SLAB_AI_ENDPOINT__ = endpoint;
    if (collabUrl) window.__SLAB_SUPABASE_URL__ = collabUrl;
    if (collabKey) window.__SLAB_SUPABASE_KEY__ = collabKey;
    window.slabDesktop = { isDesktop: true, aiMode: aiMode, endpoint: endpoint, collabMode: cfg.collabMode || 'cloud', collabUrl: collabUrl };
  } catch (_) {}

  // (3) — seed the LICENSED tier + local identity so the SPA's paywall/AI gating matches the
  // license activated at the gate. The Electron gate already enforced authorization, so this
  // just mirrors the license tier into the app. Profile flows from the onboarding step (config).
  const RANK = { edu: 0, pro: 1, 'pro-plus': 2, enterprise: 3 };
  const licensedTier = arg('--slab-tier=') || 'pro-plus';
  try {
    const LS = window.localStorage;
    let tier = licensedTier;
    if (aiMode === 'off' && (RANK[tier] || 0) >= RANK['pro-plus']) tier = 'pro'; // AI turned off -> hide AI UI
    LS.setItem('safetyLab.license.tier', tier);
    if (aiMode === 'off') LS.removeItem('safetyLab.license.token');
    else LS.setItem('safetyLab.license.token', cfg.aiToken || 'desktop-local');
    LS.setItem('safetyLab.signup.email', cfg.profileEmail || 'desktop@local');
    LS.setItem('safetyLab.signup.name', cfg.profileName || 'Desktop User');
    if (!LS.getItem('safetyLab.signup.signupDate')) LS.setItem('safetyLab.signup.signupDate', String(Date.now()));
  } catch (_) {}
})();
