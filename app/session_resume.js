// ============================================================================
// session_resume.js — two persistence upgrades:
//
// 1. AUTOSAVE RECOVERY RING. The stock autosave is a single slot: a bad
//    state that autosaves overwrites the only good copy. This module keeps
//    the last 5 GENERATIONS in IndexedDB (throttled — a new generation at
//    most every 5 minutes, plus the first write of each session), each with
//    a timestamp and size. A "Recovery ring" panel on the Thread Integrity
//    page lists them; restoring goes through the same _applyProjectData
//    path the app's own recovery uses. The live single-slot autosave is
//    untouched — the ring is history, not a replacement.
//
// 2. SESSION RESUME. Refresh already restores the DATA (checkAutosaveRecovery
//    at boot); this restores the PLACE: the active tab, and for system
//    workspaces the active system + sub-tab, are remembered in localStorage
//    on every navigation and re-entered once boot recovery has landed. A
//    fresh profile (no saved tab / no data) keeps the normal first-run flow.
//
// Born modular: wraps _writeAutosave, switchTab, switchWorkspaceTab; appends
// a panel to the Thread Integrity render. Zero monolith edits.
// ============================================================================
(function () {
    'use strict';

    const RING_SLOTS = 5;
    const RING_MIN_GAP_MS = 5 * 60 * 1000;   // one generation per 5 min max
    const RING_KEY = i => 'safetyLab.autosave.ring.' + i;
    const RING_META_KEY = 'safetyLab.autosave.ringMeta';
    const UI_TAB_KEY = 'safetyLab.ui.lastTab';
    const UI_SYS_KEY = 'safetyLab.ui.lastSystem';
    const UI_WS_KEY = 'safetyLab.ui.lastWsTab';

    const _ls = {
        get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } },
        set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} },
    };
    // the resume target is what the USER last saw — captured once at load,
    // before the monolith's boot recovery performs its own programmatic
    // switches (which flow through our recorder and would overwrite it)
    const BOOT_TARGET = _ls.get('safetyLab.ui.lastTab');
    const BOOT_SYS = _ls.get('safetyLab.ui.lastSystem');
    const BOOT_WS = _ls.get('safetyLab.ui.lastWsTab');
    const _sldb = () => (typeof SLDB !== 'undefined' && SLDB && SLDB.available && SLDB.available()) ? SLDB : null;

    // ------------------------------------------------------- ring (pure core)
    // meta = [{ slot, ts, size, name }] newest-first; returns the slot the next
    // generation should occupy (oldest slot, or the next free one).
    function ringNextSlot(meta) {
        if (!Array.isArray(meta) || !meta.length) return 0;
        if (meta.length < RING_SLOTS) {
            const used = new Set(meta.map(m => m.slot));
            for (let i = 0; i < RING_SLOTS; i++) if (!used.has(i)) return i;
        }
        return meta.reduce((a, b) => (a.ts <= b.ts ? a : b)).slot;   // oldest
    }
    function ringDue(meta, now) {
        if (!Array.isArray(meta) || !meta.length) return true;
        const newest = meta.reduce((a, b) => (a.ts >= b.ts ? a : b));
        return (now - newest.ts) >= RING_MIN_GAP_MS;
    }

    let _sessionRingDone = false;
    async function _ringCapture() {
        const db = _sldb();
        if (!db) return;
        let meta = [];
        try { meta = (await db.get(RING_META_KEY)) || []; if (typeof meta === 'string') meta = JSON.parse(meta); } catch (_) { meta = []; }
        const now = Date.now();
        if (_sessionRingDone && !ringDue(meta, now)) return;
        // the payload the autosave just wrote: prefer the fresh localStorage
        // mirror; fall back to re-serializing (oversized projects)
        let payload = _ls.get('safetyLab.autosave.v1');
        if (!payload) {
            try { payload = JSON.stringify(_slabBuildProjectExport()); } catch (_) { return; }
        }
        const slot = ringNextSlot(meta);
        try {
            const stored = (typeof _maybeCompress === 'function') ? await _maybeCompress(payload) : payload;
            await db.set(RING_KEY(slot), stored);
            meta = meta.filter(m => m.slot !== slot);
            meta.push({ slot, ts: now, size: payload.length,
                name: (typeof projectName !== 'undefined' && projectName) || 'Untitled' });
            meta.sort((a, b) => b.ts - a.ts);
            await db.set(RING_META_KEY, meta);
            _sessionRingDone = true;
        } catch (e) { console.warn('[recovery-ring] capture failed:', e); }
    }

    window.ringRestore = async function (slot) {
        const db = _sldb();
        if (!db) { alert('IndexedDB unavailable — the ring needs it.'); return; }
        if (!confirm('Restore this autosave generation? The CURRENT state is captured to the ring first, so this is reversible.')) return;
        try {
            // capture "now" before overwriting it — restoring must never destroy
            _sessionRingDone = false;
            await _ringCapture();
            let p = await db.get(RING_KEY(slot));
            if (typeof _maybeDecompress === 'function') p = await _maybeDecompress(p);
            if (!p) { alert('That generation is empty.'); return; }
            _applyProjectData(JSON.parse(p));
            try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
            try { if (typeof showToast === 'function') showToast('Generation restored — current state was ringed first.', 'info', 4000); } catch (_) {}
            try { renderGtIntegrityPage(); } catch (_) {}
        } catch (e) { alert('Restore failed: ' + e.message); }
    };

    // wrap the autosave write — the ring rides the app's own save cadence
    (function wrapWrite() {
        if (typeof window._writeAutosave !== 'function' || window._writeAutosave._ringWrapped) return;
        const orig = window._writeAutosave;
        const wrapped = function () {
            const r = orig.apply(this, arguments);
            try { setTimeout(() => { _ringCapture(); }, 250); } catch (_) {}   // off the hot path
            return r;
        };
        wrapped._ringWrapped = true;
        window._writeAutosave = wrapped;
    })();

    // ------------------------------------------- recovery panel (integrity pg)
    async function _injectRingPanel() {
        const host = document.getElementById('gt-integrity-host');
        if (!host || document.getElementById('gt-ring-panel')) return;
        const db = _sldb();
        let meta = [];
        try { meta = db ? ((await db.get(RING_META_KEY)) || []) : []; if (typeof meta === 'string') meta = JSON.parse(meta); } catch (_) {}
        const div = document.createElement('div');
        div.id = 'gt-ring-panel';
        const fmt = ts => new Date(ts).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
        div.innerHTML = '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-top:18px;">' +
            '<div style="padding:9px 14px; border-bottom:2px solid var(--color-text-primary);"><b>Autosave recovery ring</b> ' +
            '<span class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary);">last ' + RING_SLOTS + ' generations (≥5 min apart) — a bad save can no longer destroy the only good copy</span></div>' +
            (meta.length
                ? '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr><th>Generation</th><th>Project</th><th>Size</th><th></th></tr></thead><tbody>' +
                    meta.map((m, i) => '<tr><td class="u-mono">' + fmt(m.ts) + (i === 0 ? ' <span style="font-size:9.5px; color:#1D6E3E; font-weight:700;">NEWEST</span>' : '') + '</td>' +
                        '<td>' + (m.name || '—') + '</td><td class="u-mono" style="font-size:11px;">' + Math.round(m.size / 1024) + ' KB</td>' +
                        '<td><button class="ckpt-m-btn" style="font-size:10.5px; padding:1px 8px;" onclick="ringRestore(' + m.slot + ')">restore…</button></td></tr>').join('') +
                    '</tbody></table>'
                : '<p style="padding:10px 14px; font-size:12px; color:var(--color-text-tertiary);">No generations yet — the first fills on the next autosave.</p>') +
            '<p style="font-size:10.5px; color:var(--color-text-tertiary); font-family:var(--font-mono); padding:0 14px 10px;">Restoring first captures the CURRENT state into the ring, so a restore is itself reversible. The live single-slot autosave is unchanged — the ring is history.</p></div>';
        host.appendChild(div);
    }
    (function wrapIntegrityRender() {
        if (typeof window.renderGtIntegrityPage === 'function' && !window.renderGtIntegrityPage._ringWrapped) {
            const orig = window.renderGtIntegrityPage;
            const wrapped = function () { const r = orig.apply(this, arguments); try { _injectRingPanel(); } catch (_) {} return r; };
            wrapped._ringWrapped = true;
            window.renderGtIntegrityPage = wrapped;
        }
        // gt_integrity's nav wrapper calls its INTERNAL render — hook switchTab
        // (we load later, so we sit outermost) to land the panel after it
        if (typeof window.switchTab === 'function' && !window.switchTab._ringWrapped) {
            const orig = window.switchTab;
            const wrapped = function (tabId) {
                const r = orig.apply(this, arguments);
                try { if (tabId === 'gt-integrity') setTimeout(() => { _injectRingPanel(); }, 50); } catch (_) {}
                return r;
            };
            wrapped._ringWrapped = true;
            window.switchTab = wrapped;
        }
    })();

    // --------------------------------------------------------- session resume
    // record the place on every navigation
    (function wrapNavRecord() {
        if (typeof window.switchTab === 'function' && !window.switchTab._resumeWrapped) {
            const orig = window.switchTab;
            const wrapped = function (tabId) {
                const r = orig.apply(this, arguments);
                try {
                    if (tabId && !window._slResumeInFlight) {
                        _ls.set(UI_TAB_KEY, String(tabId));
                        if (typeof activeSystemId !== 'undefined' && activeSystemId) _ls.set(UI_SYS_KEY, String(activeSystemId));
                    }
                } catch (_) {}
                return r;
            };
            wrapped._resumeWrapped = true;
            window.switchTab = wrapped;
        }
        if (typeof window.switchWorkspaceTab === 'function' && !window.switchWorkspaceTab._resumeWrapped) {
            const orig = window.switchWorkspaceTab;
            const wrapped = function (subTab) {
                const r = orig.apply(this, arguments);
                try { if (subTab && !window._slResumeInFlight) _ls.set(UI_WS_KEY, String(subTab)); } catch (_) {}
                return r;
            };
            wrapped._resumeWrapped = true;
            window.switchWorkspaceTab = wrapped;
        }
    })();

    // decision core (pure, testable): should we resume, and to where?
    function resumeTarget(savedTab, hasData) {
        if (!savedTab || savedTab === 'dashboard') return null;   // nothing to do
        if (!hasData) return null;                                // fresh profile — keep first-run flow
        return savedTab;
    }

    // re-enter the place once boot recovery has landed the data
    function _attemptResume() {
        const savedTab = BOOT_TARGET;
        const hasData = (typeof acFhaData !== 'undefined' && acFhaData.length > 0) ||
            (typeof systemsData !== 'undefined' && systemsData.length > 0) ||
            (typeof itemsData !== 'undefined' && itemsData.length > 0);
        const target = resumeTarget(savedTab, hasData);
        if (!target) return false;
        try {
            window._slResumeInFlight = true;   // don't re-record while resuming
            if (target === 'sys-workspace') {
                const sysId = BOOT_SYS;
                if (sysId && typeof openSystemWorkspace === 'function' &&
                    (systemsData || []).some(s => s.id === sysId)) {
                    openSystemWorkspace(sysId);
                    const ws = BOOT_WS;
                    if (ws && typeof switchWorkspaceTab === 'function') switchWorkspaceTab(ws);
                } else { switchTab('dashboard'); }
            } else {
                switchTab(target);
            }
            return true;
        } catch (e) { console.warn('[session-resume]', e); return false; }
        finally { window._slResumeInFlight = false; }
    }

    // boot recovery (checkAutosaveRecovery) is async — poll for the data to
    // land, then resume; give up quietly after 8s (fresh profile / no save)
    (function scheduleResume() {
        if (typeof window === 'undefined' || !BOOT_TARGET) return;
        let tries = 0;
        const tick = () => {
            tries++;
            const hasData = (typeof acFhaData !== 'undefined' && acFhaData.length > 0) ||
                (typeof systemsData !== 'undefined' && systemsData.length > 0);
            if (hasData) {
                _attemptResume();
                // the monolith's own recovery (Phase 53.47) restores ITS last
                // monolith-tab shortly after data lands and can override us —
                // re-assert once after it settles, then leave the user alone
                setTimeout(() => {
                    try {
                        const target = BOOT_TARGET;
                        if (!target || target === 'dashboard') return;
                        const vis = document.querySelector('[id^="view-"]:not([style*="none"])');
                        const cur = vis ? vis.id.replace(/^view-/, '') : '';
                        if (cur !== target && target !== 'sys-workspace') {
                            window._slResumeInFlight = true;
                            try { switchTab(target); } finally { window._slResumeInFlight = false; }
                        }
                    } catch (_) {}
                }, 2200);
                return;
            }
            if (tries < 40) setTimeout(tick, 200);   // up to 8s
        };
        // start once the DOM (and the monolith's boot sequence) is in place
        if (document.readyState === 'complete') setTimeout(tick, 600);
        else window.addEventListener('load', () => setTimeout(tick, 600));
    })();

    // ------------------------------------------------------------ exports
    window._ringNextSlot = ringNextSlot;
    window._ringDue = ringDue;
    window._resumeTarget = resumeTarget;
    window._ringCapture = _ringCapture;
})();
