/**
 * Safety Lab Aero — Auth Gate (Phase 56.14j)
 * ============================================================================
 * Full-screen split-pane sign-in / sign-up gate. Blocks the app until the user
 * is authenticated with email + password (with Supabase email verification on
 * signup).
 *
 * Left pane: Safety Lab Aero branding — logo, tagline, customer references.
 * Right pane: Sign In / Create Account form with toggle. Email + password,
 * forgot-password link, terms link.
 *
 * Replaces the prior magic-link modal (Phase 55.0.8). The previous storage
 * keys are preserved so existing sessions survive the upgrade.
 *
 *   <script src="safety_lab.js?v=p56.6"></script>
 *   <script src="auth_gate.js?v=p56.6"></script>
 *
 * Comped domains/emails (electra.aero, mwnafees9@gmail.com) still get Pro+
 * automatically after sign-in.
 * ============================================================================
 */
(function () {
  'use strict';

  const GATE_ID = 'sl-auth-gate';
  const STYLE_ID = 'sl-auth-gate-styles';
  // Phase 56.14c — added 'set-new-password' state, entered when Supabase fires
  // PASSWORD_RECOVERY (user clicked the reset link). We MUST force a password
  // change before lifting the gate; otherwise the recovery flow effectively
  // becomes a passwordless sign-in via inbox access.
  let _mode = 'signin'; // 'signin' | 'signup' | 'verify-sent' | 'forgot' | 'reset-sent' | 'set-new-password'
  let _passwordRecoveryActive = false;

  // Phase 56.14f — Capture the URL at IIFE-load BEFORE Supabase strips it.
  // Two flows can land here from a password-reset email:
  //   (A) Token / implicit flow → hash contains "type=recovery&access_token=..."
  //   (B) PKCE flow             → query contains "?code=..." (no type marker)
  // safety_lab.js initializes Supabase with flowType:'pkce', so almost every
  // real reset link will be shape (B). We can't tell from the URL alone if
  // (B) is a recovery or a signup confirmation — same URL shape — so we treat
  // either signal as "potentially recovery" and wait for the PASSWORD_RECOVERY
  // event from the listener before deciding to lift the gate vs show the
  // set-new-password screen.
  const _initialUrlSnapshot = (function() {
    try {
      const href = (typeof window !== 'undefined' && window.location) ? String(window.location.href) : '';
      const hash = (typeof window !== 'undefined' && window.location) ? String(window.location.hash || '') : '';
      const search = (typeof window !== 'undefined' && window.location) ? String(window.location.search || '') : '';
      return { href, hash, search };
    } catch (_) { return { href: '', hash: '', search: '' }; }
  })();
  const _hasRecoveryHash = /[#&]type=recovery(?:[&]|$)/.test(_initialUrlSnapshot.hash);
  const _hasOurRecoveryMarker = /#sl-recovery(?:[?&]|$)/.test(_initialUrlSnapshot.hash);
  // Phase 56.14g — also check the localStorage breadcrumb set when the user
  // initiates Forgot Password through our UI. The breadcrumb is the most
  // reliable signal because we control it directly; Supabase's PASSWORD_RECOVERY
  // event is unreliable in PKCE flow across versions.
  const _hasRecoveryBreadcrumb = (function() {
    try {
      const raw = localStorage.getItem('safetyLab.auth.recoveryPending');
      const ts = raw ? parseInt(raw, 10) : NaN;
      if (!Number.isFinite(ts)) return false;
      const ageMs = Date.now() - ts;
      // 60-minute window. Reset links are usually clicked within minutes.
      return ageMs >= 0 && ageMs < 60 * 60 * 1000;
    } catch (_) { return false; }
  })();
  const _hasPKCECode = /[?&]code=[^&]+/.test(_initialUrlSnapshot.search);
  const _isRecovery = _hasRecoveryHash || _hasOurRecoveryMarker || (_hasPKCECode && _hasRecoveryBreadcrumb);
  // _potentialRecovery is the looser check used to delay lift-gate decisions.
  const _potentialRecovery = _isRecovery || _hasPKCECode;
  try { console.log('[auth-gate] URL snapshot — hash:', _initialUrlSnapshot.hash, 'search:', _initialUrlSnapshot.search, 'recoveryBreadcrumb:', _hasRecoveryBreadcrumb, 'isRecovery:', _isRecovery, 'potentialRecovery:', _potentialRecovery); } catch (_) {}

  function getSupabase() {
    // Phase 56.14b — the actual Supabase CLIENT (with .auth.signUp etc.) lives
    // behind window.getSupabaseClient(). The bare window.supabase is just the
    // SDK namespace (with createClient) and has no .auth — calling signUp on
    // it produces "Cannot read properties of undefined (reading 'signUp')".
    // Lazy-init the client if safety_lab.js hasn't called _initSupabaseClient yet.
    try {
      if (typeof window.getSupabaseClient === 'function') {
        const c = window.getSupabaseClient();
        if (c) return c;
      }
      if (typeof window._initSupabaseClient === 'function') {
        const c = window._initSupabaseClient();
        if (c) return c;
      }
    } catch (_) {}
    return null;
  }

  function toast(msg, kind) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, kind || 'info');
    } else {
      console.log('[auth-gate: ' + (kind || 'info') + '] ' + msg);
    }
  }

  // -------------------------------------------------------------------------
  // Styles
  // -------------------------------------------------------------------------
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    // Phase 56.14h — Theme-aware styling. The gate now picks up safety_lab.css
    // CSS variables and the user's saved theme preference (light/dark from
    // localStorage 'safetyLab.theme'). Hardcoded fallbacks remain for the
    // case where safety_lab.css hasn't loaded yet, but on a normal page load
    // the gate matches the app's exact palette.
    style.textContent = [
      // The gate itself uses surface-1 (white in light, near-black in dark).
      '#' + GATE_ID + ' { position: fixed; inset: 0; z-index: 2147483600; background: var(--color-surface-1, #ffffff); display: flex; font: 14px var(--font-system, "IBM Plex Sans", -apple-system, "Segoe UI", Arial, sans-serif); color: var(--color-text-primary, #000000); }',

      // Brand pane (left) — gradient stays for the marketing-side feel; theme adjusts the
      // overlay strength so the contrast holds in both modes.
      '#' + GATE_ID + ' .sl-brand-pane { flex: 0 0 44%; background: linear-gradient(155deg, #1F3A5F 0%, #007aff 60%, #af52de 100%); color: #fff; padding: 56px 56px 40px; display: flex; flex-direction: column; justify-content: space-between; position: relative; overflow: hidden; }',
      '#' + GATE_ID + ' .sl-brand-pane::before { content: ""; position: absolute; inset: 0; background: radial-gradient(circle at 30% 20%, rgba(255,255,255,0.12), transparent 60%); pointer-events: none; }',

      // Brand mark — matches safety_lab.css .brand-mark (gradient square with white triangle).
      '#' + GATE_ID + ' .sl-brand-logo { display: flex; align-items: center; gap: 14px; position: relative; z-index: 1; }',
      '#' + GATE_ID + ' .sl-brand-mark { width: 44px; height: 44px; border-radius: 11px; background: linear-gradient(135deg, #007aff 0%, #af52de 100%); position: relative; box-shadow: 0 6px 18px rgba(0,0,0,0.25); flex-shrink: 0; }',
      '#' + GATE_ID + ' .sl-brand-mark::before { content: ""; position: absolute; inset: 11px; background: rgba(255,255,255,0.97); clip-path: polygon(50% 0, 100% 100%, 0 100%); }',
      '#' + GATE_ID + ' .sl-brand-logo .sl-brand-text { display: flex; flex-direction: column; gap: 2px; }',
      '#' + GATE_ID + ' .sl-brand-logo .name { font-size: 22px; font-weight: 600; letter-spacing: -0.3px; line-height: 1.1; }',
      '#' + GATE_ID + ' .sl-brand-logo .tagline { font-size: 13px; font-weight: 400; color: rgba(255,255,255,0.78); letter-spacing: 0.1px; line-height: 1.2; }',
      '#' + GATE_ID + ' .sl-brand-hero { position: relative; z-index: 1; margin-top: -40px; }',
      '#' + GATE_ID + ' .sl-brand-hero h2 { font-size: 32px; font-weight: 600; line-height: 1.2; margin: 0 0 16px; max-width: 440px; }',
      '#' + GATE_ID + ' .sl-brand-hero p { font-size: 15px; line-height: 1.55; opacity: 0.85; margin: 0; max-width: 420px; }',
      '#' + GATE_ID + ' .sl-brand-logos { position: relative; z-index: 1; }',
      '#' + GATE_ID + ' .sl-brand-logos-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.6; margin-bottom: 14px; }',
      '#' + GATE_ID + ' .sl-brand-logos-row { display: flex; gap: 28px; align-items: center; flex-wrap: wrap; }',
      '#' + GATE_ID + ' .sl-brand-logo-pill { padding: 7px 14px; border-radius: 999px; background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.20); font-size: 13px; font-weight: 500; letter-spacing: 0.2px; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }',
      '#' + GATE_ID + ' .sl-brand-logo-pill.placeholder { opacity: 0.55; font-style: italic; }',

      // Form pane (right) — uses theme-aware tokens
      '#' + GATE_ID + ' .sl-form-pane { flex: 1; padding: 56px 56px 40px; display: flex; flex-direction: column; overflow-y: auto; background: var(--color-surface-1, #ffffff); color: var(--color-text-primary, #000000); }',
      '#' + GATE_ID + ' .sl-form-pane-inner { max-width: 420px; width: 100%; margin: auto 0; }',
      '#' + GATE_ID + ' .sl-form-tabs { display: flex; gap: 4px; padding: 4px; background: var(--color-surface-3, rgba(127,127,127,0.10)); border-radius: 10px; margin-bottom: 28px; }',
      '#' + GATE_ID + ' .sl-form-tab { flex: 1; padding: 9px 12px; border: none; background: transparent; color: var(--color-text-secondary, inherit); font: inherit; font-size: 13.5px; font-weight: 500; cursor: pointer; border-radius: 7px; transition: background 0.15s; }',
      '#' + GATE_ID + ' .sl-form-tab.active { background: var(--color-surface-1, #ffffff); color: var(--color-text-primary, #1F3A5F); font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }',
      '#' + GATE_ID + ' h1.sl-form-title { font-size: 26px; font-weight: 600; margin: 0 0 8px; letter-spacing: -0.3px; color: var(--color-text-primary, #000); }',
      '#' + GATE_ID + ' p.sl-form-sub { margin: 0 0 24px; color: var(--color-text-secondary, rgba(0,0,0,0.7)); font-size: 14px; line-height: 1.5; }',
      '#' + GATE_ID + ' .sl-field { margin-bottom: 14px; }',
      '#' + GATE_ID + ' .sl-field label { display: block; font-size: 12px; font-weight: 500; margin-bottom: 6px; color: var(--color-text-secondary, rgba(0,0,0,0.85)); text-transform: uppercase; letter-spacing: 0.5px; }',
      '#' + GATE_ID + ' .sl-field input { width: 100%; box-sizing: border-box; padding: 11px 13px; border-radius: 9px; border: 1px solid var(--color-border-hair, rgba(127,127,127,0.35)); background: var(--color-surface-2, #ffffff); color: var(--color-text-primary, inherit); font: inherit; font-size: 14px; transition: border-color 0.12s, box-shadow 0.12s; }',
      '#' + GATE_ID + ' .sl-field input:focus { outline: none; border-color: var(--color-accent, #007aff); box-shadow: 0 0 0 3px var(--color-accent-soft, rgba(0,122,255,0.18)); }',
      '#' + GATE_ID + ' .sl-row-between { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; margin-bottom: 18px; }',
      '#' + GATE_ID + ' .sl-link { color: var(--color-accent, #007aff); text-decoration: none; cursor: pointer; background: none; border: none; padding: 0; font: inherit; font-size: 12.5px; }',
      '#' + GATE_ID + ' .sl-link:hover { text-decoration: underline; }',
      '#' + GATE_ID + ' button.sl-primary { width: 100%; padding: 12px 16px; border-radius: 9px; border: none; background: var(--color-accent, #007aff); color: #fff; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.12s, filter 0.12s; }',
      '#' + GATE_ID + ' button.sl-primary:hover:not(:disabled) { filter: brightness(1.08); }',
      '#' + GATE_ID + ' button.sl-primary:disabled { opacity: 0.55; cursor: not-allowed; }',
      '#' + GATE_ID + ' .sl-msg { margin-top: 16px; padding: 11px 13px; border-radius: 9px; font-size: 13px; line-height: 1.45; display: none; }',
      '#' + GATE_ID + ' .sl-msg.show { display: block; }',
      '#' + GATE_ID + ' .sl-msg.success { background: rgba(16,185,129,0.10); border: 1px solid rgba(16,185,129,0.30); color: var(--color-success, #047857); }',
      '#' + GATE_ID + ' .sl-msg.error { background: rgba(239,68,68,0.10); border: 1px solid rgba(239,68,68,0.30); color: var(--color-danger, #b91c1c); }',
      'body.theme-dark #' + GATE_ID + ' .sl-msg.success { color: #6ee7b7; }',
      'body.theme-dark #' + GATE_ID + ' .sl-msg.error { color: #fca5a5; }',
      '#' + GATE_ID + ' .sl-foot { margin-top: 32px; font-size: 11.5px; color: var(--color-text-tertiary, rgba(0,0,0,0.55)); line-height: 1.55; }',
      '#' + GATE_ID + ' .sl-foot a { color: inherit; text-decoration: underline; }',

      // Responsive — stack on mobile
      '@media (max-width: 880px) { #' + GATE_ID + ' { flex-direction: column; } #' + GATE_ID + ' .sl-brand-pane { flex: 0 0 auto; padding: 28px 28px 20px; } #' + GATE_ID + ' .sl-brand-hero { margin-top: 16px; } #' + GATE_ID + ' .sl-brand-hero h2 { font-size: 22px; } #' + GATE_ID + ' .sl-brand-hero p { font-size: 13.5px; } #' + GATE_ID + ' .sl-brand-logos { margin-top: 18px; } #' + GATE_ID + ' .sl-form-pane { padding: 28px 24px 32px; } }',

      // Block any interaction with the page behind the gate
      'html.sl-auth-gate-blocked, html.sl-auth-gate-blocked body { overflow: hidden !important; }',
    ].join('\n');
    document.head.appendChild(style);
  }

  // Phase 56.14h — Apply the user's saved theme preference to <body> so the
  // CSS variables resolve to the right palette. safety_lab.js does this on
  // its own DOMContentLoaded, but the auth gate may render BEFORE that runs,
  // so we mirror the logic here to avoid a flash of un-themed content.
  function applyThemePreference() {
    try {
      const pref = localStorage.getItem('safetyLab.theme') ||
                   (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const body = document.body;
      if (!body) return;
      body.classList.toggle('theme-dark', pref === 'dark');
      body.classList.toggle('theme-light', pref !== 'dark');
    } catch (_) {}
  }

  // -------------------------------------------------------------------------
  // Brand pane HTML — static; logo + tagline + customer logos
  // -------------------------------------------------------------------------
  function brandPaneHTML() {
    // Phase 56.14h — Brand mark replaces the "SL" placeholder dot; matches the
    // gradient-square + white-triangle styling of safety_lab.css .brand-mark.
    // Marketing copy block removed (user request); brand pane is now logo on
    // top and "Built for" regulatory badges at bottom, with the gradient
    // background providing the visual interest.
    return [
      '<div class="sl-brand-pane">',
      '  <div class="sl-brand-logo">',
      '    <div class="sl-brand-mark" aria-hidden="true"></div>',
      '    <div class="sl-brand-text">',
      '      <div class="name">Safety Lab Aero</div>',
      '      <div class="tagline">Aerospace safety analysis, integrated</div>',
      '    </div>',
      '  </div>',
      '  <div class="sl-brand-logos">',
      '    <div class="sl-brand-logos-label">Built for</div>',
      '    <div class="sl-brand-logos-row">',
      '      <div class="sl-brand-logo-pill">FAA Part 25</div>',
      '      <div class="sl-brand-logo-pill">Part 23</div>',
      '      <div class="sl-brand-logo-pill">Part 27 / 29</div>',
      '      <div class="sl-brand-logo-pill">SC-VTOL</div>',
      '      <div class="sl-brand-logo-pill">ARP 4761A</div>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('');
  }

  // -------------------------------------------------------------------------
  // Form pane HTML — content varies by mode
  // -------------------------------------------------------------------------
  function formPaneHTML() {
    if (_mode === 'verify-sent') {
      return [
        '<div class="sl-form-pane"><div class="sl-form-pane-inner">',
        '  <h1 class="sl-form-title">Check your email</h1>',
        '  <p class="sl-form-sub">We sent a verification link to <strong id="sl-verify-email-display">your inbox</strong>. Click it to activate your account and start your 10-day trial. The link expires in 24 hours.</p>',
        '  <button class="sl-primary" type="button" onclick="window.SafetyLab._authBackToSignIn()">Back to sign in</button>',
        '  <div class="sl-msg" id="sl-msg"></div>',
        '  <div class="sl-foot">Didn\'t receive it? Check spam, or <button class="sl-link" onclick="window.SafetyLab._authResendVerification()">resend the link</button>.</div>',
        '</div></div>',
      ].join('');
    }
    if (_mode === 'forgot') {
      return [
        '<div class="sl-form-pane"><div class="sl-form-pane-inner">',
        '  <h1 class="sl-form-title">Reset your password</h1>',
        '  <p class="sl-form-sub">Enter your account email and we\'ll send a reset link.</p>',
        '  <form id="sl-auth-form" autocomplete="on" novalidate>',
        '    <div class="sl-field"><label for="sl-email">Email</label><input id="sl-email" type="email" required spellcheck="false" autocomplete="email" autocapitalize="off" autofocus></div>',
        '    <button class="sl-primary" type="submit" id="sl-submit">Send reset link</button>',
        '  </form>',
        '  <div class="sl-msg" id="sl-msg"></div>',
        '  <div class="sl-foot"><button class="sl-link" onclick="window.SafetyLab._authBackToSignIn()">← Back to sign in</button></div>',
        '</div></div>',
      ].join('');
    }
    if (_mode === 'reset-sent') {
      return [
        '<div class="sl-form-pane"><div class="sl-form-pane-inner">',
        '  <h1 class="sl-form-title">Check your email</h1>',
        '  <p class="sl-form-sub">A password reset link has been sent to <strong id="sl-verify-email-display">your inbox</strong>. Click it to set a new password.</p>',
        '  <button class="sl-primary" type="button" onclick="window.SafetyLab._authBackToSignIn()">Back to sign in</button>',
        '</div></div>',
      ].join('');
    }
    if (_mode === 'set-new-password') {
      // Phase 56.14c — entered after Supabase fires PASSWORD_RECOVERY (recovery
      // link clicked). The user MUST set a new password before the gate lifts.
      // We do NOT show the sign-in/sign-up toggle here so they can\'t bypass.
      return [
        '<div class="sl-form-pane"><div class="sl-form-pane-inner">',
        '  <h1 class="sl-form-title">Set a new password</h1>',
        '  <p class="sl-form-sub">You\'re finishing a password reset. Enter your new password below — once saved, you\'ll be signed in automatically.</p>',
        '  <form id="sl-auth-form" autocomplete="on" novalidate>',
        '    <div class="sl-field"><label for="sl-password">New password</label><input id="sl-password" type="password" required autocomplete="new-password" minlength="8" placeholder="At least 8 characters" autofocus></div>',
        '    <div class="sl-field"><label for="sl-password-confirm">Confirm new password</label><input id="sl-password-confirm" type="password" required autocomplete="new-password" minlength="8" placeholder="Re-enter to confirm"></div>',
        '    <button class="sl-primary" type="submit" id="sl-submit">Save new password</button>',
        '  </form>',
        '  <div class="sl-msg" id="sl-msg"></div>',
        '  <div class="sl-foot">For your security, the previous password is no longer valid. You\'ll need this new one for future sign-ins.</div>',
        '</div></div>',
      ].join('');
    }
    // signin | signup share the structure
    const isSignup = _mode === 'signup';
    return [
      '<div class="sl-form-pane"><div class="sl-form-pane-inner">',
      '  <div class="sl-form-tabs" role="tablist">',
      '    <button class="sl-form-tab ' + (isSignup ? '' : 'active') + '" type="button" onclick="window.SafetyLab._authSetMode(\'signin\')">Sign in</button>',
      '    <button class="sl-form-tab ' + (isSignup ? 'active' : '') + '" type="button" onclick="window.SafetyLab._authSetMode(\'signup\')">Create account</button>',
      '  </div>',
      '  <h1 class="sl-form-title">' + (isSignup ? 'Create your account' : 'Welcome back') + '</h1>',
      '  <p class="sl-form-sub">' + (isSignup
              ? 'Start a 10-day trial. No credit card required. Email verification is required to activate the trial.'
              : 'Sign in to continue with Safety Lab Aero.') + '</p>',
      '  <form id="sl-auth-form" autocomplete="on" novalidate>',
      (isSignup ? '    <div class="sl-field"><label for="sl-name">Full name</label><input id="sl-name" type="text" required autocomplete="name" autofocus placeholder="Jane Doe"></div>' : ''),
      '    <div class="sl-field"><label for="sl-email">Email</label><input id="sl-email" type="email" required spellcheck="false" autocomplete="email" autocapitalize="off"' + (isSignup ? '' : ' autofocus') + ' placeholder="you@example.com"></div>',
      (isSignup ? '    <div class="sl-field"><label for="sl-org">Organization</label><input id="sl-org" type="text" required autocomplete="organization" placeholder="Company or institution"></div>' : ''),
      '    <div class="sl-field"><label for="sl-password">Password</label><input id="sl-password" type="password" required autocomplete="' + (isSignup ? 'new-password' : 'current-password') + '" minlength="8" placeholder="' + (isSignup ? 'At least 8 characters' : '') + '"></div>',
      (isSignup ? '    <div class="sl-field"><label for="sl-password-confirm">Confirm password</label><input id="sl-password-confirm" type="password" required autocomplete="new-password" minlength="8" placeholder="Re-enter password"></div>' : ''),
      (isSignup ? '' : '<div class="sl-row-between"><span></span><button type="button" class="sl-link" onclick="window.SafetyLab._authSetMode(\'forgot\')">Forgot password?</button></div>'),
      '    <button class="sl-primary" type="submit" id="sl-submit">' + (isSignup ? 'Create account' : 'Sign in') + '</button>',
      '  </form>',
      '  <div class="sl-msg" id="sl-msg"></div>',
      '  <div class="sl-foot">By continuing, you agree to the Safety Lab Aero End User License Agreement. Email is required for account verification and password recovery.</div>',
      '</div></div>',
    ].join('');
  }

  // -------------------------------------------------------------------------
  // Inactivity timeout — after IDLE_MS of no interaction, sign the user out and
  // re-show the gate so they must sign in again. Applies to EVERY signed-in
  // session with NO exemption (including ones open since first sign-in): the
  // idle clock starts at sign-in (liftGate) and ANY interaction resets it.
  // Web (Supabase) sessions only — the desktop build has its own lock.
  // -------------------------------------------------------------------------
  const IDLE_MS = 20 * 60 * 1000;         // 20 minutes of inactivity
  const IDLE_WARN_MS = 2 * 60 * 1000;     // show a "stay signed in?" warning this long before the cutoff (≈18-min mark)
  const IDLE_TICK_MS = 10 * 1000;         // how often we check the idle clock
  const BUSY_MAX_MS = 15 * 60 * 1000;     // safety cap: a long op marked 'busy' longer than this is treated as leaked/hung and ignored
  const IDLE_EVENTS = ['mousedown', 'mousemove', 'keydown', 'wheel', 'scroll', 'touchstart', 'click'];
  const WARN_ID = 'sl-idle-warning', WARN_STYLE_ID = 'sl-idle-warning-style', WARN_COUNT_ID = 'sl-idle-warning-count', WARN_BTN_ID = 'sl-idle-warning-btn';
  let _idleLast = 0, _idleInterval = null, _idleArmed = false, _idleLockMessage = '';
  let _idleWarnShown = false, _idleCountdownTimer = null;       // option 2 — pre-logout warning toast
  let _busyCount = 0, _busySince = 0;                           // option 3 — long-running ops (AI/compute/export) hold the idle clock
  function _busyActive() {                                      // is a user-initiated long op currently holding the session open?
    if (_busyCount <= 0) return false;
    if ((Date.now() - _busySince) >= BUSY_MAX_MS) { _busyCount = 0; return false; }   // stale/leaked → self-heal so logout still works
    return true;
  }
  function _idleBump() { _idleLast = Date.now(); if (_idleWarnShown) hideIdleWarning(); }
  function _idleCheck() {
    if (!_idleArmed) return;
    if (_busyActive()) { _idleBump(); return; }                 // a long op the user kicked off is running → treat as active
    const idleFor = Date.now() - _idleLast;
    if (idleFor >= IDLE_MS) { onIdleTimeout(); return; }
    if (idleFor >= (IDLE_MS - IDLE_WARN_MS)) showIdleWarning();  // entered the final ~2 min → warn, don't sign out yet
  }
  function _idleVis() { if (document.visibilityState === 'visible') _idleCheck(); }
  function armIdleTimeout() {
    try { if (typeof window !== 'undefined' && window.__SLAB_DESKTOP__) return; } catch (_) {}   // desktop has its own lock
    if (_idleArmed) { _idleBump(); return; }
    _idleArmed = true; _idleBump();
    IDLE_EVENTS.forEach(function (ev) { try { document.addEventListener(ev, _idleBump, { passive: true, capture: true }); } catch (_) { try { document.addEventListener(ev, _idleBump, true); } catch (_) {} } });
    try { document.addEventListener('visibilitychange', _idleVis, true); } catch (_) {}
    if (_idleInterval) { try { clearInterval(_idleInterval); } catch (_) {} }
    _idleInterval = setInterval(_idleCheck, IDLE_TICK_MS);
  }
  function disarmIdleTimeout() {
    _idleArmed = false;
    IDLE_EVENTS.forEach(function (ev) { try { document.removeEventListener(ev, _idleBump, true); } catch (_) {} });
    try { document.removeEventListener('visibilitychange', _idleVis, true); } catch (_) {}
    if (_idleInterval) { try { clearInterval(_idleInterval); } catch (_) {} _idleInterval = null; }
    try { hideIdleWarning(); } catch (_) {}                     // gate going up / signed out → drop any pending warning
  }
  function onIdleTimeout() {
    disarmIdleTimeout();
    _idleLockMessage = 'Signed out after 20 minutes of inactivity. Please sign in again.';
    try { renderGate(); } catch (_) {}                                                          // lock immediately, don't wait on the network
    try { const sb = getSupabase(); if (sb && sb.auth && typeof sb.auth.signOut === 'function') sb.auth.signOut(); } catch (_) {}
  }

  // -------------------------------------------------------------------------
  // Option 2 — pre-logout warning. Rather than silently signing the user out at
  // 20 min, surface a non-blocking banner at ~18 min with a live countdown and a
  // "Stay signed in" button. Any real interaction (or the button) resets the
  // clock and dismisses it; if ignored, onIdleTimeout still fires at 20 min.
  // -------------------------------------------------------------------------
  function ensureWarnStyles() {
    if (document.getElementById(WARN_STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = WARN_STYLE_ID;
    st.textContent = [
      '#' + WARN_ID + ' { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%) translateY(8px); z-index: 2147483550; display: flex; align-items: center; gap: 12px; max-width: calc(100vw - 32px); padding: 12px 14px 12px 16px; border-radius: 12px; background: var(--color-surface-1, #ffffff); color: var(--color-text-primary, #111111); border: 1px solid var(--color-border-hair, rgba(127,127,127,0.35)); box-shadow: 0 12px 34px rgba(0,0,0,0.20); font: 14px var(--font-system, "IBM Plex Sans", -apple-system, "Segoe UI", Arial, sans-serif); opacity: 0; pointer-events: none; transition: opacity .18s ease, transform .18s ease; }',
      '#' + WARN_ID + '.show { opacity: 1; transform: translateX(-50%) translateY(0); pointer-events: auto; }',
      '#' + WARN_ID + ' .sl-idle-warn-ico { font-size: 18px; line-height: 1; }',
      '#' + WARN_ID + ' .sl-idle-warn-txt { font-size: 13.5px; line-height: 1.35; }',
      '#' + WARN_ID + ' .sl-idle-warn-txt strong { font-variant-numeric: tabular-nums; }',
      '#' + WARN_ID + ' .sl-idle-warn-btn { flex: 0 0 auto; padding: 8px 14px; border-radius: 8px; border: none; background: var(--color-accent, #007aff); color: #fff; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }',
      '#' + WARN_ID + ' .sl-idle-warn-btn:hover { filter: brightness(1.08); }',
      '@media (prefers-reduced-motion: reduce) { #' + WARN_ID + ' { transition: none; } }',
    ].join('\n');
    (document.head || document.documentElement).appendChild(st);
  }
  function updateIdleCountdown() {
    const remain = Math.max(0, IDLE_MS - (Date.now() - _idleLast));
    const el = document.getElementById(WARN_COUNT_ID);
    if (el) {
      const s = Math.ceil(remain / 1000), mm = Math.floor(s / 60), ss = s % 60;
      el.textContent = mm + ':' + (ss < 10 ? '0' : '') + ss;
    }
    if (remain <= 0) onIdleTimeout();   // hit zero between 10-s checks → sign out promptly at 0:00
  }
  function showIdleWarning() {
    if (_idleWarnShown) { updateIdleCountdown(); return; }
    _idleWarnShown = true;
    ensureWarnStyles();
    let el = document.getElementById(WARN_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = WARN_ID;
      el.setAttribute('role', 'alertdialog');
      el.setAttribute('aria-live', 'assertive');
      el.innerHTML =
        '<span class="sl-idle-warn-ico" aria-hidden="true">⏳</span>' +
        '<span class="sl-idle-warn-txt">You’ll be signed out in <strong id="' + WARN_COUNT_ID + '">2:00</strong> due to inactivity.</span>' +
        '<button type="button" class="sl-idle-warn-btn" id="' + WARN_BTN_ID + '">Stay signed in</button>';
      document.body.appendChild(el);
      const btn = document.getElementById(WARN_BTN_ID);
      if (btn) btn.addEventListener('click', function () { _idleBump(); });   // resets clock + hides (via _idleBump)
    }
    requestAnimationFrame(function () { try { el.classList.add('show'); } catch (_) {} });
    updateIdleCountdown();
    if (_idleCountdownTimer) { try { clearInterval(_idleCountdownTimer); } catch (_) {} }
    _idleCountdownTimer = setInterval(updateIdleCountdown, 1000);   // smooth 1-s countdown while the warning is up
  }
  function hideIdleWarning() {
    _idleWarnShown = false;
    if (_idleCountdownTimer) { try { clearInterval(_idleCountdownTimer); } catch (_) {} _idleCountdownTimer = null; }
    const el = document.getElementById(WARN_ID);
    if (el) el.classList.remove('show');
  }

  // -------------------------------------------------------------------------
  // Option 3 — long-running, user-initiated work counts as activity so the idle
  // clock doesn't sign the user out mid-job. Two ways in:
  //   • window.SafetyLabActivity.begin()/end()/ping() — explicit, for any caller
  //     (wrap an export or compute in begin()/end() to cover it too).
  //   • a fetch hook scoped to AI endpoints — covers the common "I clicked
  //     Generate and I'm reading/waiting" case with no edits to the AI code.
  // BUSY_MAX_MS caps a leaked begin()/hung request so logout can't be disabled
  // forever, and only signed-in (armed) web sessions are ever affected.
  // -------------------------------------------------------------------------
  function _activityBegin() { if (_busyCount === 0) _busySince = Date.now(); _busyCount++; _idleBump(); return true; }
  function _activityEnd() { if (_busyCount > 0) _busyCount--; if (_busyCount === 0) _idleBump(); }   // restart the full idle window after the op
  try {
    window.SafetyLabActivity = {
      begin:  function () { try { return _activityBegin(); } catch (_) { return false; } },
      end:    function () { try { _activityEnd(); } catch (_) {} },
      ping:   function () { try { _idleBump(); } catch (_) {} },
      isBusy: function () { try { return _busyActive(); } catch (_) { return false; } }
    };
  } catch (_) {}
  try {
    if (typeof window !== 'undefined' && typeof window.fetch === 'function' && !window.__slIdleFetchHook) {
      window.__slIdleFetchHook = true;
      const _origFetch = window.fetch.bind(window);
      const _isAiUrl = function (u) {
        const s = String(u || '');
        return s.indexOf('/v1/ai') !== -1 || s.indexOf('/v1/chat/completions') !== -1 || s.indexOf('/v1/embeddings') !== -1 ||
               s.indexOf('/v1/messages') !== -1 || s.indexOf('api.safetylabaero.com') !== -1 || s.indexOf('api.anthropic.com') !== -1;
      };
      window.fetch = function (input, init) {
        let counted = false;
        try {
          const url = (input && typeof input === 'object' && 'url' in input) ? input.url : input;
          if (_idleArmed && _isAiUrl(url)) { _activityBegin(); counted = true; }
        } catch (_) {}
        let p;
        try { p = _origFetch(input, init); }
        catch (e) { if (counted) { try { _activityEnd(); } catch (_) {} } throw e; }
        if (counted && p && typeof p.then === 'function') {
          const done = function () { try { _activityEnd(); } catch (_) {} };
          p.then(done, done);   // settle (response headers or network error) → release the hold
        } else if (counted) { try { _activityEnd(); } catch (_) {} }
        return p;
      };
    }
  } catch (_) {}

  function renderGate() {
    ensureStyles();
    applyThemePreference();
    document.documentElement.classList.add('sl-auth-gate-blocked');
    try { disarmIdleTimeout(); } catch (_) {}                 // gate is up = locked; stop the idle clock until next sign-in
    let gate = document.getElementById(GATE_ID);
    if (!gate) {
      gate = document.createElement('div');
      gate.id = GATE_ID;
      gate.setAttribute('role', 'dialog');
      gate.setAttribute('aria-modal', 'true');
      gate.setAttribute('aria-label', 'Sign in to Safety Lab Aero');
      document.body.appendChild(gate);
    }
    gate.innerHTML = brandPaneHTML() + formPaneHTML();
    // Wire submit
    const form = gate.querySelector('#sl-auth-form');
    if (form) form.addEventListener('submit', onSubmit);
    document.addEventListener('keydown', escGuard, true);
    // Restore the pending email into the "check your email" screen.
    try {
      const pending = sessionStorage.getItem('sl-auth-pending-email');
      if (pending) {
        const el = gate.querySelector('#sl-verify-email-display');
        if (el) el.textContent = pending;
      }
    } catch (_) {}
    // Phase 56.31 — Auth UI is now on screen; dismiss the boot splash so the
    // gate is what the user sees (rather than the loader still hovering).
    try { if (typeof window.__slDismissBootSplash === 'function') window.__slDismissBootSplash(); } catch (_) {}
    try { if (_idleLockMessage) showMessage(_idleLockMessage, 'info'); } catch (_) {}
    return gate;
  }

  function escGuard(e) {
    if (e.key === 'Escape' && document.getElementById(GATE_ID)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function setMode(mode) {
    _mode = mode;
    renderGate();
  }
  function backToSignIn() { setMode('signin'); }

  function showMessage(text, kind) {
    const el = document.querySelector('#' + GATE_ID + ' #sl-msg');
    if (!el) return;
    el.textContent = text;
    el.className = 'sl-msg show ' + (kind === 'error' ? 'error' : 'success');
  }

  async function onSubmit(e) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb) { showMessage('Authentication service unavailable. Refresh and try again.', 'error'); return; }
    const emailEl = document.querySelector('#' + GATE_ID + ' #sl-email');
    const passEl  = document.querySelector('#' + GATE_ID + ' #sl-password');
    const btn     = document.querySelector('#' + GATE_ID + ' #sl-submit');
    const email = ((emailEl && emailEl.value) || '').trim().toLowerCase();
    const pass  = ((passEl  && passEl.value)  || '');
    // Phase 56.14e — set-new-password mode has no email field (the user is
    // already identified by the recovery session token), so skip email
    // validation entirely for that mode.
    if (_mode !== 'set-new-password') {
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        showMessage('Please enter a valid email address.', 'error');
        if (emailEl) emailEl.focus();
        return;
      }
    }
    if (_mode !== 'forgot' && pass.length < 8) {
      showMessage('Password must be at least 8 characters.', 'error');
      if (passEl) passEl.focus();
      return;
    }
    btn.disabled = true;
    const origLabel = btn.textContent;
    btn.textContent = 'Working…';
    try {
      if (_mode === 'set-new-password') {
        // Phase 56.14c — confirm-match + update the user\'s password against the
        // recovery session Supabase already established. Do NOT use the email
        // input here; the user is identified by the recovery session token.
        const confirmEl = document.querySelector('#' + GATE_ID + ' #sl-password-confirm');
        const confirmVal = ((confirmEl && confirmEl.value) || '');
        if (pass !== confirmVal) {
          showMessage('Passwords do not match.', 'error');
          if (confirmEl) confirmEl.focus();
          return;
        }
        const { error } = await sb.auth.updateUser({ password: pass });
        if (error) throw error;
        _passwordRecoveryActive = false;
        // Phase 56.14g — clear the recovery breadcrumb + URL marker so a
        // back-button visit or a future page-load doesn\'t re-trigger the flow.
        try {
          localStorage.removeItem('safetyLab.auth.recoveryPending');
          history.replaceState({}, '', window.location.pathname);
        } catch (_) {}
        showMessage('Password updated. Signing you in…', 'success');
        // The Supabase session from the recovery flow is still active; lift the gate.
        setTimeout(liftGate, 800);
        return;
      }
      if (_mode === 'signin') {
        const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        // Session is set; the auth state listener below will lift the gate.
        showMessage('Signed in. Loading…', 'success');
      } else if (_mode === 'signup') {
        // Sign-up is a profile: full name + organization + confirm-password, in
        // addition to email + password. (button reset handled by finally.)
        const nameEl    = document.querySelector('#' + GATE_ID + ' #sl-name');
        const orgEl     = document.querySelector('#' + GATE_ID + ' #sl-org');
        const confirmEl = document.querySelector('#' + GATE_ID + ' #sl-password-confirm');
        const fullName   = ((nameEl && nameEl.value) || '').trim();
        const org        = ((orgEl && orgEl.value) || '').trim();
        const confirmVal = ((confirmEl && confirmEl.value) || '');
        if (!fullName)           { showMessage('Please enter your full name.', 'error'); if (nameEl) nameEl.focus(); return; }
        if (!org)                { showMessage('Please enter your organization.', 'error'); if (orgEl) orgEl.focus(); return; }
        if (pass !== confirmVal) { showMessage('Passwords do not match.', 'error'); if (confirmEl) confirmEl.focus(); return; }
        const redirect = window.location.origin + window.location.pathname;
        const { data, error } = await sb.auth.signUp({
          email,
          password: pass,
          options: { emailRedirectTo: redirect, data: { full_name: fullName, org: org } },
        });
        if (error) throw error;
        // Mirror the profile into the app's local signup record (tier/UX + outreach read it).
        try {
          localStorage.setItem('safetyLab.signup.name', fullName);
          localStorage.setItem('safetyLab.signup.org', org);
        } catch (_) {}
        try { sessionStorage.setItem('sl-auth-pending-email', email); } catch (_) {}
        setMode('verify-sent');
        return;
      } else if (_mode === 'forgot') {
        // Phase 56.14g — Use a custom hash marker (#sl-recovery) that Supabase
        // preserves through the redirect, plus a localStorage breadcrumb. Either
        // signal on return tells us this is a recovery flow even if Supabase\'s
        // PASSWORD_RECOVERY event never fires.
        const redirect = window.location.origin + window.location.pathname + '#sl-recovery';
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirect });
        if (error) throw error;
        try {
          sessionStorage.setItem('sl-auth-pending-email', email);
          localStorage.setItem('safetyLab.auth.recoveryPending', String(Date.now()));
        } catch (_) {}
        setMode('reset-sent');
        return;
      }
    } catch (err) {
      console.error('[auth-gate]', err);
      const msg = (err && err.message) || 'Something went wrong. Please try again.';
      // Friendlier mapping for common Supabase errors.
      // Phase 56.14c — give the user a real next-step when sign-in fails.
      // "Invalid login credentials" can mean: wrong password, OR account doesn\'t
      // exist (e.g. signup failed earlier). The actionable message is: try the
      // Create Account tab.
      const friendly = /invalid login credentials/i.test(msg)
        ? 'Email or password is incorrect. If you have not signed up yet, switch to "Create account" above.'
        : (/email not confirmed/i.test(msg)
              ? 'Please verify your email first. Check your inbox for the activation link.'
              : (/user already registered/i.test(msg)
                  ? 'An account with this email already exists. Switch to "Sign in" above.'
                  : (/weak password|password.*8/i.test(msg)
                        ? 'Password must be at least 8 characters.'
                        : msg)));
      showMessage(friendly, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = origLabel;
    }
  }

  async function resendVerification() {
    const sb = getSupabase(); if (!sb) return;
    let email = '';
    try { email = sessionStorage.getItem('sl-auth-pending-email') || ''; } catch (_) {}
    if (!email) { setMode('signup'); return; }
    try {
      const { error } = await sb.auth.resend({ type: 'signup', email });
      if (error) throw error;
      showMessage('Verification link sent again to ' + email + '.', 'success');
    } catch (err) {
      showMessage((err && err.message) || 'Could not resend the link.', 'error');
    }
  }

  function liftGate() {
    document.removeEventListener('keydown', escGuard, true);
    document.documentElement.classList.remove('sl-auth-gate-blocked');
    const gate = document.getElementById(GATE_ID);
    if (gate && gate.parentNode) gate.parentNode.removeChild(gate);
    try { sessionStorage.removeItem('sl-auth-pending-email'); } catch (_) {}
    // Phase 56.31 — User is signed in; reveal the app shell.
    try { if (typeof window.__slDismissBootSplash === 'function') window.__slDismissBootSplash(); } catch (_) {}
    // One-time EULA acceptance gate — shows only until the account has accepted
    // the current EULA version (recorded in Supabase user_metadata).
    try {
      if (window.SafetyLab && typeof window.SafetyLab.checkEula === 'function') {
        window.SafetyLab.checkEula();
      }
    } catch (_) {}
    try { _idleLockMessage = ''; armIdleTimeout(); } catch (_) {}   // signed in → start/refresh the 20-min idle clock (every session, no exemption)
  }

  // -------------------------------------------------------------------------
  // Expose hooks for inline onclicks
  // -------------------------------------------------------------------------
  window.SafetyLab = window.SafetyLab || {};
  window.SafetyLab._authSetMode = setMode;
  window.SafetyLab._authBackToSignIn = backToSignIn;
  window.SafetyLab._authResendVerification = resendVerification;
  window.SafetyLab._authLiftGate = liftGate;

  // -------------------------------------------------------------------------
  // Main: check session, gate or lift accordingly
  // -------------------------------------------------------------------------
  async function init() {
    // Desktop (Electron) build — no hosted Supabase session exists offline. The native
    // app authorizes locally (local profile / license file), so skip the online auth gate
    // and reveal the app shell. Inert in the web build (window.__SLAB_DESKTOP__ is undefined).
    if (typeof window !== 'undefined' && window.__SLAB_DESKTOP__) { try { liftGate(); } catch (_) {} return; }
    const sb = getSupabase();
    if (!sb) { setTimeout(init, 300); return; }

    // Phase 56.14f — Install the auth-state listener BEFORE checking the session.
    // PKCE flow (which safety_lab.js uses) produces a URL like ?code=xxx for both
    // password-reset and signup-email-confirm — same URL shape, different intent.
    // We can only tell which by waiting for the PASSWORD_RECOVERY event from
    // Supabase, which fires AFTER the code is exchanged for a session.
    //
    // Strategy:
    //   - Install the listener immediately so we don't miss any event.
    //   - If the URL had a recovery-shaped signal (#type=recovery OR ?code=),
    //     hold the gate up and let the events decide. Lift only if we're
    //     confident it wasn't a recovery (timeout fallback).
    //   - Otherwise (no URL signal), check the existing session and lift or
    //     render as normal.
    // Phase 55.0.6b4 — License token lifecycle. Fetches the signed-in user's
    // license_tokens row (RLS-protected; returns 0 or 1 row) and writes the
    // token to localStorage so AiClient routes via the hosted proxy.
    async function _syncLicenseTokenFromSupabase() {
      try {
        const { data, error } = await sb.from('license_tokens').select('token,plan,expires_at').limit(1).maybeSingle();
        if (error) { console.warn('[auth-gate] license_tokens query error:', error.message || error); try { localStorage.removeItem('safetyLab.license.token'); } catch(_){} return; }
        if (data && data.token && (!data.expires_at || new Date(data.expires_at) > new Date())) {
          try { localStorage.setItem('safetyLab.license.token', String(data.token)); } catch(_){}
          // Make the client license tier authoritative from the server's purchased plan
          // (e.g. an enterprise account is uncapped; a pro-plus account keeps the standard
          // allowance) rather than trusting the local onboarding guess. setLicenseTier
          // validates the value, so an unexpected plan string is simply ignored.
          try { if (data.plan && typeof window.setLicenseTier === 'function') window.setLicenseTier(String(data.plan)); } catch(_){}
        } else { try { localStorage.removeItem('safetyLab.license.token'); } catch(_){} }
      } catch (e) { console.warn('[auth-gate] license token sync failed:', e); }
    }

    sb.auth.onAuthStateChange((event, session) => {
      try { console.log('[auth-gate] auth event:', event, 'recovery-active:', _passwordRecoveryActive, 'potentialRecovery:', _potentialRecovery); } catch (_) {}
      if (event === 'PASSWORD_RECOVERY') {
        _passwordRecoveryActive = true;
        setMode('set-new-password');
        return;
      }
      if (event === 'SIGNED_IN' && session && session.user && session.user.email) {
        // If recovery is already known active, never lift on SIGNED_IN.
        if (_passwordRecoveryActive) return;
        // If the URL had a recovery-shaped signal, wait briefly for
        // PASSWORD_RECOVERY before deciding. Supabase emits SIGNED_IN before
        // PASSWORD_RECOVERY for reset flows, so a small delay catches it.
        if (_potentialRecovery) {
          try { console.log('[auth-gate] SIGNED_IN with potential-recovery URL; waiting 1500ms for PASSWORD_RECOVERY before lifting'); } catch (_) {}
          setTimeout(() => {
            if (_passwordRecoveryActive) return; // PASSWORD_RECOVERY fired, set-new-password already shown
            try { if (typeof window.setSignupEmail === 'function') window.setSignupEmail(session.user.email); } catch (_) {}
            _syncLicenseTokenFromSupabase();
            liftGate();
            toast('Signed in as ' + session.user.email, 'success');
          }, 1500);
          return;
        }
        // Normal sign-in.
        try { if (typeof window.setSignupEmail === 'function') window.setSignupEmail(session.user.email); } catch (_) {}
        _syncLicenseTokenFromSupabase();
        liftGate();
        toast('Signed in as ' + session.user.email, 'success');
      } else if (event === 'SIGNED_OUT') {
        _passwordRecoveryActive = false;
        try { localStorage.removeItem('safetyLab.license.token'); } catch(_){}
        renderGate();
      }
    });

    // Phase 56.14g — If we have a CONFIDENT recovery signal (our own marker
    // or breadcrumb), force the set-new-password screen immediately. Don't
    // wait for the unreliable PASSWORD_RECOVERY event.
    if (_isRecovery) {
      try { console.log('[auth-gate] confident recovery signal; forcing set-new-password mode'); } catch (_) {}
      _passwordRecoveryActive = true;
      setMode('set-new-password');
      return;
    }
    // If only a soft signal (PKCE ?code= with no breadcrumb), render the gate
    // and let the listener decide via PASSWORD_RECOVERY / SIGNED_IN events.
    if (_potentialRecovery) {
      try { console.log('[auth-gate] soft potential-recovery URL detected; rendering gate and waiting for events'); } catch (_) {}
      renderGate();
      return;
    }

    // Otherwise, normal session check.
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session && session.user && session.user.email) {
        try {
          if (typeof window.setSignupEmail === 'function') window.setSignupEmail(session.user.email);
          else localStorage.setItem('safetyLab.signup.email', String(session.user.email).toLowerCase());
        } catch (_) {}
        _syncLicenseTokenFromSupabase();
        liftGate();
      } else {
        renderGate();
      }
    } catch (err) {
      console.error('[auth-gate] init', err);
      renderGate();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
