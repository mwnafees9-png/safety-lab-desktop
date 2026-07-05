// ============================================================================
// activity_ticker.js — v1.2 — the live activity ticker: who did what, when.
//
// A fixed strip pinned to the BOTTOM of the screen on every tab, merged from
// the two act streams the app already keeps: the hash-chained JOURNAL (every
// signed engineering act — accepts, baselines, seals, imports, syncs) and the
// workspace CHANGE LOG (locks, unlocks, takeovers, edits — with explicit user
// identity). Latest act inline; click to expand the last fifteen. Newest
// first, relative timestamps, refreshed live (on every autosave tick and on
// a 20-second heartbeat).
//
// Read-only by construction: the ticker renders the records; it can neither
// create nor edit them. The journal's hash chain stays the authority — this
// is its front window.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}; }

    // pull a signer out of a journal summary ("… — signed J. Okafor", "by R. Váldez …")
    function _who(s) {
        const m = /(?:signed|by)\s+([A-Za-zÀ-ž][\w.'À-ž-]*(?:\s+[A-Za-zÀ-ž][\w.'À-ž-]*){0,2})/.exec(s || '');
        return m ? m[1].replace(/[.,;:]$/, '') : '';
    }
    function _rel(ts) {
        const d = Date.now() - ts;
        if (d < 60e3) return 'just now';
        if (d < 3600e3) return Math.floor(d / 60e3) + 'm ago';
        if (d < 86400e3) return Math.floor(d / 3600e3) + 'h ago';
        return Math.floor(d / 86400e3) + 'd ago';
    }

    function tickerRows(limit) {
        const rows = [];
        // journal acts (engineering acts, hash-chained)
        try {
            const st = (typeof window._jrnlStore === 'function') ? window._jrnlStore() : null;
            (st && st.entries || []).forEach(e => {
                if (e.kind === 'compaction') return;
                const t = Date.parse(e.at) || 0;
                rows.push({ ts: t, who: _who(e.s) || 'engine', what: e.s, kind: e.kind, src: 'journal' });
            });
        } catch (_) {}
        // workspace change log (locks/unlocks/takeovers/edits with identity)
        try {
            (_pc().changeLog || []).forEach(c => {
                rows.push({ ts: c.ts || 0, who: c.name || c.by || '?', what: (c.action ? '[' + c.action + '] ' : '') + (c.summary || ''), kind: 'ws-' + (c.action || 'edit'), src: 'changelog' });
            });
        } catch (_) {}
        rows.sort((a, b) => b.ts - a.ts);
        return rows.slice(0, limit || 20);
    }

    const KIND_ICON = {
        'baseline': '🧊', 'baseline-seal': '🔏', 'baseline-reopen': '🔓', 'baseline-surgical': '🔬',
        'baseline-impact': '⚠️', 'baseline-delta': '📜', 'baseline-order': '↕️',
        'lock-takeover': '🔨', 'ws-lock': '🔒', 'ws-unlock': '🔓', 'ws-takeover': '🔨',
        'spf-accept': '✍', 'zonal-accept': '✍', 'ccf-confirm': '✍', 'ccf-bucket': 'β',
        'l3-fmea': '⚙️', 'l3-flow': '🔀', 'l3-lane': '🔀', 'm2-mode': '🔁',
        'alias-add': '🔤', 'alias-remove': '🔤', 'bridge-check': '📡', 'bridge-sync': '📡',
        'xmi-import': '📦', 'status-back': '📤', 'eta': '🌲', 'do-credit': '📐', 'do160-claim': '🌡',
        'tree-created': '🌲', 'trade-tree': '🧪', 'fc-route': '🧭', 'rename': '✏️',
        'mod-assess': '🧮', 'mod-advance': '🛠️', 'mod-delete': '✕',
    };

    // Fixed strip pinned to the BOTTOM of the screen, on every tab: the latest
    // act inline, click to expand the last fifteen. Clears the sidebar rail.
    let _expanded = false;
    function _row(r, full) {
        return '<div style="display:flex; gap:10px; align-items:baseline; padding:' + (full ? '4px 14px' : '0') + '; font-size:12px;' + (full ? ' border-top:1px solid var(--color-border-hair);' : ' flex:1; overflow:hidden;') + '">' +
            '<span style="width:18px; text-align:center; flex:0 0 18px;">' + (KIND_ICON[r.kind] || '·') + '</span>' +
            '<b style="white-space:nowrap; color:var(--color-text-primary);">' + _esc(r.who) + '</b>' +
            '<span style="flex:1; color:var(--color-text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + _esc(r.what) + '">' + _esc(r.what) + '</span>' +
            '<span class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary); white-space:nowrap;">' + _esc(r.ts ? _rel(r.ts) : '') + '</span></div>';
    }
    function _render() {
        if (typeof document === 'undefined' || !document.body) return;
        let bar = document.getElementById('activity-ticker-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'activity-ticker-bar';
            bar.style.cssText = 'position:fixed; bottom:0; right:0; z-index:1400;' +
                'background:var(--color-surface-2, var(--color-surface-1)); border-top:2px solid var(--color-accent, #007AFF);' +
                'box-shadow:0 -3px 14px rgba(0,0,0,0.22); font-family:var(--font-system);';
            document.body.appendChild(bar);
            document.body.style.paddingBottom = '34px';   // content never hides under the strip
        }
        // clear the sidebar rail (264px expanded / 60px collapsed / 0 classic)
        const b = document.body;
        bar.style.left = b.classList.contains('nav-sidebar') ? (b.classList.contains('nav-rail') ? '60px' : '264px') : '0';
        const rows = tickerRows(15);
        const latest = rows[0];
        bar.innerHTML =
            '<div style="display:flex; align-items:center; gap:10px; height:30px; padding:0 130px 0 14px; cursor:pointer;" onclick="window._tickerToggle()">' +   // right padding clears the Feedback pill
            '<span style="width:7px; height:7px; border-radius:50%; background:var(--color-success); flex:0 0 7px; box-shadow:0 0 6px var(--color-success);"></span>' +
            '<span style="font-size:10px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; color:var(--color-accent, #007AFF); white-space:nowrap;">Activity</span>' +
            (latest ? _row(latest, false) : '<span style="font-size:12px; color:var(--color-text-tertiary);">no recorded acts yet</span>') +
            '<span class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary);">' + (_expanded ? '▾' : '▴') + ' ' + rows.length + '</span></div>' +
            (_expanded
                ? '<div style="max-height:240px; overflow:auto; border-top:1px solid var(--color-border-strong);">' + rows.map(r => _row(r, true)).join('') + '</div>'
                : '');
    }
    window._tickerToggle = function () { _expanded = !_expanded; _render(); };

    // live refresh: dashboard entry, autosave tick, and a heartbeat while visible
    (function wrapNav() {
        if (typeof window.switchTab === 'function' && !window.switchTab._tickWrapped) {
            const orig = window.switchTab;
            const wrapped = function (tabId) {
                const r = orig.apply(this, arguments);
                try { if (tabId === 'dashboard') setTimeout(_render, 150); } catch (_) {}
                return r;
            };
            wrapped._tickWrapped = true;
            window.switchTab = wrapped;
        }
        if (typeof window.scheduleAutosave === 'function' && !window.scheduleAutosave._tickWrapped) {
            const orig2 = window.scheduleAutosave;
            const wrapped2 = function () {
                try { setTimeout(_render, 400); } catch (_) {}
                return orig2.apply(this, arguments);
            };
            wrapped2._tickWrapped = true;
            window.scheduleAutosave = wrapped2;
        }
        try { setInterval(_render, 20000); } catch (_) {}
        try {
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(_render, 800));
            else setTimeout(_render, 800);
        } catch (_) {}
    })();

    window.tickerRows = tickerRows;
    window._tickerRender = _render;
})();
