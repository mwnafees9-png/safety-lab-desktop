// ============================================================================
// ckpt_captions.js — v1.0 — H5: cockpit clause captions are COMPUTED.
//
// The gate cockpit clause lines carried hardcoded counts ("Completion
// checklist — ARP4761A B.5 (13 items)") — coincidentally correct until the
// MBSA items were grafted onto PASA/SSA, after which the caption lied while
// the "N of M satisfied" tally (computed from the live checklist) told the
// truth. This wrap rewrites the parenthetical from the checklist the page
// actually evaluates, so the caption can never drift from the list again.
//
// BORN MODULAR: wraps window._ckptDetail (outermost — after the MBSA graft's
// own wrap, so grafted items are already in CKPT_CHECKLISTS when we count).
// ============================================================================
(function () {
    'use strict';

    function _count(key) {
        try {
            // the evaluated checklist is the authority (includes grafted AUTO items)
            if (typeof window.evalCkptChecklist === 'function') {
                const cl = window.evalCkptChecklist(key);
                if (cl && Array.isArray(cl.items) && cl.items.length) return cl.items.length;
            }
        } catch (_) {}
        try {
            if (typeof CKPT_CHECKLISTS !== 'undefined' && Array.isArray(CKPT_CHECKLISTS[key])) return CKPT_CHECKLISTS[key].length;
        } catch (_) {}
        return null;
    }

    function _wrap() {
        if (typeof window._ckptDetail !== 'function' || window._ckptDetail._capWrapped) return false;
        const orig = window._ckptDetail;
        const wrapped = function (key) {
            const d = orig.apply(this, arguments);
            try {
                if (d && typeof d.clause === 'string' && /\(\d+ items\)/.test(d.clause)) {
                    const n = _count(key);
                    if (n) d.clause = d.clause.replace(/\(\d+ items\)/, '(' + n + ' items)');
                }
            } catch (_) {}
            return d;
        };
        wrapped._capWrapped = true;
        window._ckptDetail = wrapped;
        return true;
    }
    // load order: run after mbsa_cockpit's graft/wrap (retry until the monolith surface exists)
    if (!_wrap()) { let tries = 20; const t = setInterval(() => { if (_wrap() || --tries <= 0) clearInterval(t); }, 300); }
})();
