// ============================================================================
// tab_guard.js — v1.0 — Q9: concurrent-tab overwrite protection.
//
// The last hole in the persistence spine: the app open in two tabs was
// silent last-writer-wins — whichever tab autosaved last clobbered the
// other's work, invisibly. This module closes it with a WRITE LEASE:
//
//   · One tab holds the lease (localStorage token + 5s heartbeat, 12s TTL,
//     BroadcastChannel for instant notification). Focusing a tab acquires
//     the lease when it is free, stale, or already ours.
//   · A tab WITHOUT the lease keeps working in memory but its autosave
//     writes are SUSPENDED — a persistent banner says so honestly and
//     offers one-click takeover. Nothing is silently half-saved.
//   · Every guarded write bumps a GENERATION counter. A tab acquiring the
//     lease after being suspended compares generations: if the project
//     advanced elsewhere, a modal offers the newer state (recommended) or
//     keeping this tab's state — with the recovery ring holding history
//     either way. The user decides; the tool never merges silently.
//
// Wrap order matters: this module loads AFTER session_resume, so the lease
// guard is OUTERMOST — a suspended tab writes neither the autosave nor the
// recovery ring (no interleaved ring pollution from a background tab).
// ============================================================================
(function () {
    'use strict';

    const LEASE_KEY = 'safetyLab.tabLease.v1';
    const GEN_KEY = 'safetyLab.autosave.gen.v1';
    const LEASE_TTL = 12000;      // ms — foreign lease older than this is stale
    const HEARTBEAT = 5000;       // ms — holder refresh cadence

    const TAB_ID = 'tab-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
    let _suppressed = 0;
    let _lastSeenGen = null;

    function _ls() { try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch (_) { return null; } }
    function _readLease() {
        const ls = _ls();
        if (!ls) return null;
        try { return JSON.parse(ls.getItem(LEASE_KEY) || 'null'); } catch (_) { return null; }
    }
    function _readGen() {
        const ls = _ls();
        if (!ls) return 0;
        const n = parseInt(ls.getItem(GEN_KEY) || '0', 10);
        return isFinite(n) ? n : 0;
    }
    function _bumpGen() {
        const ls = _ls();
        if (!ls) return 0;
        const n = _readGen() + 1;
        try { ls.setItem(GEN_KEY, String(n)); } catch (_) {}
        _lastSeenGen = n;
        return n;
    }

    // ------------------------------------------------------------ the lease
    function tgHasLease() {
        const l = _readLease();
        return !!(l && l.tabId === TAB_ID && (Date.now() - l.at) < LEASE_TTL * 2);
    }
    function _writeLease() {
        const ls = _ls();
        if (!ls) return;
        try { ls.setItem(LEASE_KEY, JSON.stringify({ tabId: TAB_ID, at: Date.now() })); } catch (_) {}
    }
    let _bc = null;
    try { if (typeof BroadcastChannel !== 'undefined') _bc = new BroadcastChannel('safetylab-tabs'); } catch (_) {}
    if (_bc) _bc.onmessage = e => {
        try {
            if (e.data && e.data.type === 'lease-taken' && e.data.tabId !== TAB_ID) _renderBanner();
        } catch (_) {}
    };

    // acquire → { ok, conflict } — conflict means the project advanced in
    // another tab while this one was suspended; the caller decides.
    function tgAcquire(force) {
        const l = _readLease();
        const foreignFresh = l && l.tabId !== TAB_ID && (Date.now() - l.at) < LEASE_TTL;
        if (foreignFresh && !force) { _renderBanner(); return { ok: false, conflict: false }; }
        const genNow = _readGen();
        const conflict = _lastSeenGen != null && genNow > _lastSeenGen;
        _writeLease();
        try { if (_bc) _bc.postMessage({ type: 'lease-taken', tabId: TAB_ID }); } catch (_) {}
        _renderBanner();
        if (!conflict) _lastSeenGen = genNow;
        return { ok: true, conflict };
    }
    function tgRelease() {
        const l = _readLease();
        if (l && l.tabId === TAB_ID) { try { _ls().removeItem(LEASE_KEY); } catch (_) {} }
    }

    // ------------------------------------------------------- the write guard
    (function wrap() {
        if (typeof window._writeAutosave !== 'function' || window._writeAutosave._tgWrapped) return;
        const orig = window._writeAutosave;
        const wrapped = function () {
            if (!tgHasLease()) {
                // one attempt to self-heal: maybe the other tab closed
                const l = _readLease();
                const foreignFresh = l && l.tabId !== TAB_ID && (Date.now() - l.at) < LEASE_TTL;
                if (!foreignFresh) { tgAcquire(false); }
                if (!tgHasLease()) { _suppressed++; _renderBanner(); return; }   // suspended — write nothing
            }
            _writeLease();          // refresh with the write
            _bumpGen();
            return orig.apply(this, arguments);
        };
        wrapped._tgWrapped = true;
        window._writeAutosave = wrapped;
    })();

    // ------------------------------------------------------------ banner UI
    function _renderBanner() {
        if (typeof document === 'undefined' || !document.body) return;
        let el = document.getElementById('tg-banner');
        const suspended = !tgHasLease() && !!_readLease() && _readLease().tabId !== TAB_ID;
        if (!suspended) { if (el) el.remove(); return; }
        if (!el) {
            el = document.createElement('div');
            el.id = 'tg-banner';
            el.style.cssText = 'position:fixed; top:10px; left:50%; transform:translateX(-50%); z-index:3000;' +
                'background:#8E2A2A; color:#fff; font-size:12.5px; font-weight:600; padding:8px 18px;' +
                'border-radius:var(--r-full, 999px); box-shadow:var(--shadow-xl, 0 8px 24px rgba(0,0,0,.35)); cursor:pointer;';
            el.onclick = function () { window.tgTakeOver(); };
            document.body.appendChild(el);
        }
        el.textContent = '⚠ This project is active in another tab — saving is paused here. Click to make THIS tab active.';
    }

    window.tgTakeOver = function () {
        const r = tgAcquire(true);
        if (!r.conflict) {
            try { if (typeof showToast === 'function') showToast('This tab now owns saving.', 'success', 2500); } catch (_) {}
            return;
        }
        _showConflictModal();
    };

    // ------------------------------------------------------ conflict modal
    function _showConflictModal() {
        if (typeof document === 'undefined') return;
        let modal = document.getElementById('tg-conflict-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'tg-conflict-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML =
                '<div class="modal-content" style="max-width: 560px;">' +
                '<div class="modal-header"><h2>Project Changed in Another Tab</h2></div>' +
                '<div class="modal-body" style="padding: 18px 22px;">' +
                '<p style="font-size:13px; color:var(--color-text-secondary); margin:0 0 14px;">While this tab was inactive, the project was saved from another tab. Choose which state this tab should continue from — the other lives on in the recovery ring either way.</p>' +
                '<div style="display:flex; gap:10px; justify-content:flex-end;">' +
                '<button class="ckpt-m-btn" style="font-size:13px; padding:6px 16px;" onclick="_tgLoadNewest()">Load the newer state (recommended)</button>' +
                '<button class="ckpt-m-btn" style="font-size:13px; padding:6px 16px; opacity:0.75;" onclick="_tgKeepMine()">Keep this tab’s state</button>' +
                '</div></div></div>';
            document.body.appendChild(modal);
        }
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);
    }
    function _closeConflict() {
        const modal = document.getElementById('tg-conflict-modal');
        if (!modal) return;
        modal.classList.remove('show');
        setTimeout(() => { modal.style.display = 'none'; }, 250);
    }
    window._tgLoadNewest = function () {
        _closeConflict();
        try {
            const raw = _ls() && _ls().getItem('safetyLab.autosave.v1');
            const payload = raw ? JSON.parse(raw) : null;
            const data = payload && (payload.data || payload);
            if (data && typeof _applyProjectData === 'function') {
                _applyProjectData(data);
                _lastSeenGen = _readGen();
                try { if (typeof showToast === 'function') showToast('Loaded the newer state from the other tab. This tab now owns saving.', 'success', 3500); } catch (_) {}
                return;
            }
        } catch (_) {}
        try { if (typeof showToast === 'function') showToast('Could not read the newer autosave — keeping this tab’s state. The recovery ring holds history.', 'warning', 4500); } catch (_) {}
        _lastSeenGen = _readGen();
    };
    window._tgKeepMine = function () {
        _closeConflict();
        _lastSeenGen = _readGen();   // accept divergence knowingly; next save overwrites
        try { if (typeof showToast === 'function') showToast('Keeping this tab’s state — it becomes the saved state on the next autosave. The other version remains in the recovery ring.', 'info', 4500); } catch (_) {}
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
    };

    // -------------------------------------------------------- lifecycle
    if (typeof window !== 'undefined') {
        try {
            window.addEventListener('focus', () => { const r = tgAcquire(false); if (r.ok && r.conflict) _showConflictModal(); });
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') { const r = tgAcquire(false); if (r.ok && r.conflict) _showConflictModal(); }
            });
            window.addEventListener('pagehide', () => { try { tgRelease(); } catch (_) {} });
        } catch (_) {}
        // boot: take the lease if available (single-tab case = instant)
        setTimeout(() => { try { const r = tgAcquire(false); if (r.ok && r.conflict) _showConflictModal(); } catch (_) {} }, 400);
        setInterval(() => { try { if (tgHasLease()) _writeLease(); } catch (_) {} }, HEARTBEAT);
    }

    // ------------------------------------------------------------- exports
    window.tgTabId = TAB_ID;
    window.tgHasLease = tgHasLease;
    window.tgAcquire = tgAcquire;
    window.tgRelease = tgRelease;
    window._tgSuppressed = () => _suppressed;
    window._tgLeaseKey = LEASE_KEY;
    window._tgGenKey = GEN_KEY;
})();
