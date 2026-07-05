// ============================================================================
// ai_loader.js — v1.2 — O1: the AI lane loads on demand, not on boot.
//
// ai_assistant.js (612KB) + fta_kb_data.js (73KB) + ai_fidelity.js (30KB)
// were parsed on every boot for every user — ~190KB of transfer and the
// second-largest parse cost in the app — while the AI lane is opt-in and
// every consumer already guards with `window.SafetyLabAI && …`.
//
// Now: a 2KB loader boots instead. The lane loads (in order — fidelity must
// wrap the assistant's provider export) on the FIRST AI intent: the AI tab,
// the ANEM chat, or an AI action button. Users with AI enabled
// (safetyLab.ai.enabled) get a background load at idle, so their
// availability-gated buttons render exactly as before. Users who never
// touch AI never pay for it. Deterministic core unaffected — it never
// depended on this lane and still doesn't.
// ============================================================================
(function () {
    'use strict';

    const FILES = ['fta_kb_data.js?v=1.0', 'ai_assistant.js?v=65.13', 'ai_fidelity.js?v=65.20', 'ai_consistency.js?v=1.2'];
    let _loading = null;

    window.slLoadAI = function () {
        // the REAL lane exposes openChat; the tier-gated stub carries only
        // {enabled, enable} — never mistake the stub for a loaded module
        // (that was the silent-dead-button bug).
        if (window.SafetyLabAI && typeof SafetyLabAI.openChat === 'function') return Promise.resolve();
        if (window.SafetyLabAI && SafetyLabAI.enabled === false) return Promise.resolve();   // gated: reloading scripts won't change the verdict
        if (_loading) return _loading;
        _loading = FILES.reduce((p, f) => p.then(() => new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = f;
            s.onload = res;
            s.onerror = () => rej(new Error('failed to load ' + f));
            document.head.appendChild(s);
        })), Promise.resolve()).then(() => {
            try { if (typeof showToast === 'function' && !window._slAiIdleLoad) showToast('AI module loaded.', 'info', 1500); } catch (_) {}
        }).catch(e => { _loading = null; throw e; });
        return _loading;
    };

    // ANEM chat + AI action buttons route through these.
    window.slOpenAnem = function () {
        window.slLoadAI().then(() => {
            if (window.SafetyLabAI && typeof SafetyLabAI.openChat === 'function') { SafetyLabAI.openChat(); return; }
            // gated stub: say so instead of dying silently
            try {
                if (typeof showToast === 'function') showToast('The AI assistant is a Pro+ feature. Opening AI settings — check your tier or enable AI for this browser.', 'warning', 5200);
                if (typeof switchTab === 'function') switchTab('ai');
            } catch (_) {}
        }).catch(() => { try { alert('AI module could not be loaded.'); } catch (_) {} });
    };
    window.slAiRun = function (fn) {
        window.slLoadAI().then(() => {
            try { window.SafetyLabAI[fn](); }
            catch (e) { try { alert('AI module not ready — enable AI (Pro+) first.'); } catch (_) {} }
        }).catch(() => { try { alert('AI module could not be loaded.'); } catch (_) {} });
    };

    // The AI tab: show the shell immediately, re-dispatch once the lane is in
    // so the module's own nav wrapper renders its page.
    (function wrap() {
        if (typeof window.switchTab !== 'function' || window.switchTab._aiLoaderWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            if (tabId === 'ai' && !window.SafetyLabAI && typeof document !== 'undefined') {
                window.slLoadAI().then(() => { try { window.switchTab('ai'); } catch (_) {} }).catch(() => {});
            }
            return orig.apply(this, arguments);
        };
        wrapped._aiLoaderWrapped = true;
        window.switchTab = wrapped;
    })();

    // AI-enabled users: background load at idle — zero behavior change for them.
    try {
        const enabled = (typeof localStorage !== 'undefined' && localStorage.getItem('safetyLab.ai.enabled')) ||
            (typeof location !== 'undefined' && /[?&]ai=1/.test(location.search));
        if (enabled && typeof window !== 'undefined' && typeof document !== 'undefined') {
            const kick = () => { window._slAiIdleLoad = true; window.slLoadAI().catch(() => {}).then(() => { window._slAiIdleLoad = false; }); };
            if ('requestIdleCallback' in window) requestIdleCallback(kick, { timeout: 4000 });
            else setTimeout(kick, 2500);
        }
    } catch (_) {}
})();
