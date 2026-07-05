/**
 * Safety Lab Aero — Feedback client module (Phase 55.0.7)
 * ============================================================================
 * Drop this into safety_lab.js (paste at the end, or include as a separate
 * <script> tag after safety_lab.js). It:
 *
 *   1. Exposes window.SafetyLab.feedback.open() — opens a modal where the
 *      user picks category, optional 1-5 rating, and types a message.
 *   2. On submit, POSTs to the notify-feedback Supabase Edge Function with
 *      the current user's session access token.
 *   3. Auto-attaches a click handler to the existing in-app Feedback button
 *      (Phase 42.4) — works with any of: #sl-feedback-btn, [data-action="feedback"],
 *      a.feedback-link, .sl-feedback. Adjust SELECTORS below if your button
 *      uses a different ID/class.
 *
 * Dependencies (all already present in the app):
 *   - Supabase JS client at window.SafetyLab._supabaseClient (set in Phase 55.0.3)
 *   - showToast(message, kind) helper for user-facing toasts (Phase 5.1)
 *   - SAFETY_LAB_VERSION constant for the build_id field
 *
 * If any of those names differ in your code, see the FALLBACKS section below.
 * ============================================================================
 */
(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------
  // The Edge Function URL. SUPABASE_URL is the same one used elsewhere in the
  // app — replace this if your code stores it under a different name.
  const SUPABASE_URL =
    (typeof window !== 'undefined' && window.__SLAB_SUPABASE_URL__) ||   // on-prem / self-hosted override (desktop preload)
    (window.SafetyLab && window.SafetyLab.SUPABASE_URL) ||
    'https://fhrqkhdrwbfnizkepkch.supabase.co';
  const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/notify-feedback`;

  // Selectors that auto-open the feedback modal when clicked.
  const SELECTORS = [
    '#sl-feedback-btn',
    '[data-action="feedback"]',
    'a.feedback-link',
    '.sl-feedback',
    '#feedback-btn',
  ];

  // -------------------------------------------------------------------------
  // FALLBACKS — adjust if your code uses different names
  // -------------------------------------------------------------------------
  function getSupabaseClient() {
    return (
      (window.SafetyLab && window.SafetyLab._supabaseClient) ||
      window.supabase ||
      null
    );
  }
  function toast(message, kind) {
    if (typeof window.showToast === 'function') {
      window.showToast(message, kind || 'info');
    } else {
      console.log(`[feedback toast: ${kind || 'info'}] ${message}`);
    }
  }
  function buildId() {
    return (
      window.SAFETY_LAB_VERSION ||
      window.BETA_BUILD_ID ||
      (window.SafetyLab && window.SafetyLab.BUILD_ID) ||
      'unknown-build'
    );
  }
  function activeContext() {
    // Capture lightweight context — adjust to match how your app exposes state.
    try {
      const ctx = {
        activeTab:
          (window.SafetyLab && window.SafetyLab.activeTab) ||
          document.body?.dataset?.activeTab ||
          null,
        activeProjectId:
          (window.SafetyLab && window.SafetyLab.activeProjectId) || null,
        activeWorkspaceId:
          (window.SafetyLab && window.SafetyLab.activeWorkspaceId) || null,
      };
      return ctx;
    } catch (_) {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // CSS (injected once)
  // -------------------------------------------------------------------------
  function ensureStyles() {
    if (document.getElementById('sl-feedback-styles')) return;
    const css = `
.sl-fb-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45);
  z-index: 10000; display: flex; align-items: center; justify-content: center;
  -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);
}
.sl-fb-modal {
  background: var(--sl-bg, #fff); color: var(--sl-text, #111);
  border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.35);
  width: min(560px, 92vw); max-height: 88vh; overflow: auto;
  padding: 20px 22px;
}
@media (prefers-color-scheme: dark) {
  .sl-fb-modal { background: #1c1c1e; color: #f2f2f7; }
}
.sl-fb-head { display:flex; justify-content:space-between; align-items:center; margin-bottom: 14px; }
.sl-fb-head h2 { margin:0; font-size: 18px; }
.sl-fb-close { background: none; border: none; font-size: 22px; cursor: pointer; color: inherit; opacity:0.7; }
.sl-fb-close:hover { opacity:1; }
.sl-fb-row { margin-bottom: 12px; }
.sl-fb-row label { display:block; font-size: 13px; margin-bottom: 4px; opacity:0.8; }
.sl-fb-cat { display:flex; gap:6px; flex-wrap:wrap; }
.sl-fb-cat button {
  flex: 0 0 auto; padding: 6px 12px; border-radius: 8px;
  border: 1px solid rgba(127,127,127,0.35); background: transparent;
  color: inherit; cursor: pointer; font-size: 13px;
}
.sl-fb-cat button.is-active { background: #3b82f6; color: #fff; border-color: #3b82f6; }
.sl-fb-stars { display:flex; gap:4px; }
.sl-fb-stars button {
  background:none; border:none; font-size: 22px; cursor: pointer; padding: 2px;
  opacity:0.35; color: inherit;
}
.sl-fb-stars button.is-active { opacity:1; color: #f59e0b; }
.sl-fb-textarea {
  width:100%; min-height: 120px; padding: 10px 12px; border-radius: 8px;
  border: 1px solid rgba(127,127,127,0.35); resize: vertical; font: inherit;
  background: var(--sl-input-bg, #f8f8fa); color: inherit; box-sizing: border-box;
}
@media (prefers-color-scheme: dark) { .sl-fb-textarea { background: #2c2c2e; } }
.sl-fb-foot { display:flex; justify-content:flex-end; gap:8px; margin-top: 14px; }
.sl-fb-btn {
  padding: 8px 16px; border-radius: 8px; border: 1px solid rgba(127,127,127,0.35);
  background: transparent; color: inherit; cursor: pointer; font: inherit; font-size: 14px;
}
.sl-fb-btn:disabled { opacity:0.5; cursor: not-allowed; }
.sl-fb-btn-primary { background: #3b82f6; color: #fff; border-color: #3b82f6; }
.sl-fb-btn-primary:hover:not(:disabled) { background: #2563eb; }
.sl-fb-hint { font-size: 12px; opacity:0.65; margin-top: 6px; }
`;
    const style = document.createElement('style');
    style.id = 'sl-feedback-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // -------------------------------------------------------------------------
  // Modal rendering
  // -------------------------------------------------------------------------
  let _activeBackdrop = null;

  function open(opts) {
    opts = opts || {};
    ensureStyles();
    closeModal(); // single instance at a time

    const backdrop = document.createElement('div');
    backdrop.className = 'sl-fb-backdrop';
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });

    const modal = document.createElement('div');
    modal.className = 'sl-fb-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Send feedback');

    modal.innerHTML = `
      <div class="sl-fb-head">
        <h2>Send feedback</h2>
        <button class="sl-fb-close" aria-label="Close" type="button">×</button>
      </div>
      <div class="sl-fb-row">
        <label>Category</label>
        <div class="sl-fb-cat" role="radiogroup" aria-label="Category">
          <button type="button" data-cat="general" class="is-active">General</button>
          <button type="button" data-cat="bug">Bug</button>
          <button type="button" data-cat="feature">Feature request</button>
          <button type="button" data-cat="praise">Praise</button>
          <button type="button" data-cat="other">Other</button>
        </div>
      </div>
      <div class="sl-fb-row">
        <label>Rating (optional)</label>
        <div class="sl-fb-stars" role="radiogroup" aria-label="Rating">
          <button type="button" data-r="1" aria-label="1 star">★</button>
          <button type="button" data-r="2" aria-label="2 stars">★</button>
          <button type="button" data-r="3" aria-label="3 stars">★</button>
          <button type="button" data-r="4" aria-label="4 stars">★</button>
          <button type="button" data-r="5" aria-label="5 stars">★</button>
        </div>
      </div>
      <div class="sl-fb-row">
        <label for="sl-fb-msg">Message</label>
        <textarea id="sl-fb-msg" class="sl-fb-textarea"
          placeholder="What's on your mind? Bugs, ideas, things that confused you — anything."></textarea>
        <div class="sl-fb-hint">Your email is included automatically so we can reply.</div>
      </div>
      <div class="sl-fb-foot">
        <button class="sl-fb-btn" data-act="cancel" type="button">Cancel</button>
        <button class="sl-fb-btn sl-fb-btn-primary" data-act="send" type="button">Send</button>
      </div>
    `;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    _activeBackdrop = backdrop;

    // Category buttons
    let cat = 'general';
    modal.querySelectorAll('.sl-fb-cat button').forEach((b) => {
      b.addEventListener('click', () => {
        cat = b.dataset.cat;
        modal.querySelectorAll('.sl-fb-cat button').forEach((x) => x.classList.toggle('is-active', x === b));
      });
    });

    // Star rating
    let rating = null;
    const stars = Array.from(modal.querySelectorAll('.sl-fb-stars button'));
    function paintStars(n) {
      stars.forEach((s, i) => s.classList.toggle('is-active', n != null && i < n));
    }
    stars.forEach((s, idx) => {
      s.addEventListener('click', () => {
        const newR = idx + 1;
        rating = rating === newR ? null : newR;   // click same star again to clear
        paintStars(rating);
      });
    });

    // Close, cancel
    modal.querySelector('.sl-fb-close').addEventListener('click', closeModal);
    modal.querySelector('[data-act="cancel"]').addEventListener('click', closeModal);

    // Esc to close
    function escHandler(e) {
      if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); }
    }
    document.addEventListener('keydown', escHandler);

    // Focus the textarea after a tick so iOS / Safari accept the focus
    const ta = modal.querySelector('#sl-fb-msg');
    setTimeout(() => ta.focus(), 50);

    // Send button
    const sendBtn = modal.querySelector('[data-act="send"]');
    sendBtn.addEventListener('click', async () => {
      const message = (ta.value || '').trim();
      if (!message) { toast('Please enter a message before sending.', 'warn'); ta.focus(); return; }
      if (message.length > 8000) { toast('Message too long (max 8000 chars).', 'warn'); return; }
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending…';
      try {
        const result = await submit({ category: cat, rating, message });
        if (result.ok) {
          toast('Thanks — feedback sent.', 'success');
          closeModal();
        } else {
          toast(`Could not send: ${result.error}`, 'error');
          sendBtn.disabled = false;
          sendBtn.textContent = 'Send';
        }
      } catch (e) {
        console.error('[feedback] submit error', e);
        toast(`Could not send: ${e.message || e}`, 'error');
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send';
      }
    });
  }

  function closeModal() {
    if (_activeBackdrop && _activeBackdrop.parentNode) {
      _activeBackdrop.parentNode.removeChild(_activeBackdrop);
    }
    _activeBackdrop = null;
  }

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------
  async function submit({ category, rating, message }) {
    const sb = getSupabaseClient();
    if (!sb) {
      return { ok: false, error: 'Supabase client not available — please sign in first.' };
    }
    const { data: sessionRes, error: sErr } = await sb.auth.getSession();
    if (sErr || !sessionRes?.session) {
      return { ok: false, error: 'You need to be signed in to send feedback.' };
    }
    const accessToken = sessionRes.session.access_token;

    const payload = {
      category,
      rating,
      message,
      source_url: window.location.href,
      user_agent: navigator.userAgent,
      build_id:   buildId(),
      context_json: activeContext(),
    };
    const ctx = activeContext();
    if (ctx?.activeWorkspaceId) payload.workspace_id = ctx.activeWorkspaceId;
    if (ctx?.activeProjectId)   payload.project_id   = ctx.activeProjectId;

    let res;
    try {
      res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return { ok: false, error: 'Network error: ' + (e.message || e) };
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: body.error || `HTTP ${res.status}` };
    }
    return { ok: true, feedbackId: body.feedback_id, emailStatus: body.email_status };
  }

  // -------------------------------------------------------------------------
  // Auto-attach to existing Feedback button
  // -------------------------------------------------------------------------
  function attachOnce() {
    const candidates = SELECTORS.flatMap((sel) =>
      Array.from(document.querySelectorAll(sel))
    );
    if (!candidates.length) return false;
    let attached = 0;
    candidates.forEach((el) => {
      if (el.dataset.slFeedbackAttached) return;
      el.dataset.slFeedbackAttached = '1';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        open();
      });
      attached++;
    });
    return attached > 0;
  }

  function initAutoAttach() {
    if (attachOnce()) return;
    // Buttons may be rendered after first paint — observe DOM mutations briefly.
    const obs = new MutationObserver(() => {
      if (attachOnce()) {
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    // Safety net: stop observing after 10 seconds even if no button shows up.
    setTimeout(() => obs.disconnect(), 10000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAutoAttach);
  } else {
    initAutoAttach();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  window.SafetyLab = window.SafetyLab || {};
  window.SafetyLab.feedback = { open, close: closeModal, submit };
})();
