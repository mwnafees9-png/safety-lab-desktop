// ============================================================================
// theme_mid.js — v1.0 — DUSK: the tri-state theme cycle. light → mid → dark.
//
// The mid mode is graphite slate — neither paper nor night. Mechanically it is
// body.theme-dark + body.theme-mid: every dark-mode structural rule and every
// isDark JS check keeps working, and the theme-mid var block (Phase H4 CSS)
// lifts the palette from ink-navy to slate.
//
// The toggle becomes three-position: sun left, dusk centered (◐), moon right.
// Persisted as localStorage 'safetyLab.theme' = 'light' | 'mid' | 'dark'.
// The monolith's initThemeFromStorage treats 'mid' as not-dark (light), so
// this module re-applies the stored mode after it — no monolith edits.
//
// Born-modular: replaces window.toggleThemeEngine (top-level monolith function
// — bare call sites, incl. the checkbox onchange, resolve through the global
// binding, the scheduleAutosave precedent). Flag-guarded.
// ============================================================================
(function () {
    'use strict';

    const KEY = 'safetyLab.theme';
    const CYCLE = { light: 'mid', mid: 'dark', dark: 'light' };

    function _mode() {
        const b = document.body;
        if (b.classList.contains('theme-mid')) return 'mid';
        if (b.classList.contains('theme-dark')) return 'dark';
        return 'light';
    }

    function _apply(mode, persist) {
        if (mode !== 'light' && mode !== 'mid' && mode !== 'dark') mode = 'light';
        const b = document.body;
        b.classList.toggle('theme-dark', mode !== 'light');   // mid rides on dark
        b.classList.toggle('theme-mid',  mode === 'mid');
        b.classList.toggle('theme-light', mode === 'light');
        const sw = document.getElementById('theme-switch');
        if (sw) {
            sw.checked = (mode === 'dark');
            const label = sw.closest('.ds-switch');
            if (label) {
                label.classList.toggle('mode-mid', mode === 'mid');
                label.title = mode === 'light' ? 'Theme: light — click for dusk'
                            : mode === 'mid'   ? 'Theme: dusk — click for dark'
                                               : 'Theme: dark — click for light';
            }
        }
        if (persist) { try { localStorage.setItem(KEY, mode); } catch (_) {} }
        try { if (typeof d3 !== 'undefined' && typeof updateD3 === 'function') updateD3(); } catch (_) {}
        return mode;
    }

    (function wrap() {
        if (typeof window.toggleThemeEngine === 'function' && window.toggleThemeEngine._midWrapped) return;
        const cycler = function () { _apply(CYCLE[_mode()] || 'light', true); };
        cycler._midWrapped = true;
        window.toggleThemeEngine = cycler;
    })();

    // Re-apply the persisted mode after the monolith's init (which maps 'mid'
    // to light because it only knows two states).
    function _init() {
        let pref = 'light';
        try { pref = localStorage.getItem(KEY) || 'light'; } catch (_) {}
        _apply(pref, false);
    }
    try {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
        else _init();
    } catch (_) {}

    window.themeMidApply = _apply;   // exposed for tests + programmatic set
    window.themeMidMode = _mode;
})();
