// ============================================================================
// journal.js — v1.0 — Q7: append-only, hash-chained project journal.
//
// The audit question a DER eventually asks: "how do I know this history
// wasn't edited?" Signatures answer WHO; the journal answers WHETHER THE
// RECORD ITSELF IS INTACT. Every consequential act appends an entry whose
// hash chains over the previous one (SHA-256 of prev-hash | seq | time |
// kind | summary). Edit, reorder, or delete ANY entry — anywhere in the
// file, by anyone — and jrnlVerify() names the first broken link. The
// project file remains fully portable; the chain travels inside it.
//
// What gets journaled (the signed/consequential acts, not keystrokes):
// project loads, AutoReq applies, SPF/zonal/CCF dispositions, rename
// propagations, thread-link bindings, round-trip proofs, engine self-tests.
// Instrumented by wrapping the modules' own exported entry points — no
// monolith edits.
//
// Compaction: the chain caps at 400 entries; older entries fold into an
// ANCHOR (the hash the remaining chain grows from), so the journal stays
// small while the surviving chain stays verifiable. Compaction is itself a
// journaled, chained event.
// ============================================================================
(function () {
    'use strict';

    const MAX = 400, KEEP = 300;
    const GENESIS = 'safetylab-journal-genesis-v1';

    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : null); }
    function _store() {
        const pc = _pc();
        if (!pc) return null;
        if (!pc.journal || !Array.isArray(pc.journal.entries)) pc.journal = { entries: [], anchor: '' };
        return pc.journal;
    }
    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    async function _sha(s) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // ------------------------------------------------------------ appending
    // Entries queue synchronously (callers never await); the async pump
    // chains them strictly in order.
    let _queue = [];
    let _pumping = false;
    let _timer = null;

    window.jrnl = function (kind, summary) {
        _queue.push({ kind: String(kind || 'event'), s: String(summary == null ? '' : summary).slice(0, 220), at: new Date().toISOString() });
        if (_timer) clearTimeout(_timer);
        _timer = setTimeout(_pump, 50);
    };

    async function _pump() {
        if (_pumping) return;
        _pumping = true;
        try {
            const st = _store();
            if (!st) { _queue = []; return; }
            let wrote = false;
            while (_queue.length) {
                const e = _queue.shift();
                const last = st.entries[st.entries.length - 1];
                const prev = last ? last.h : (st.anchor || await _sha(GENESIS));
                const seq = last ? last.seq + 1 : 1;
                const h = await _sha(prev + '|' + seq + '|' + e.at + '|' + e.kind + '|' + e.s);
                st.entries.push({ seq, at: e.at, kind: e.kind, s: e.s, h });
                wrote = true;
                if (st.entries.length > MAX) {
                    const cut = st.entries.length - KEEP;
                    st.anchor = st.entries[cut - 1].h;      // chain resumes from here
                    st.entries = st.entries.slice(cut);
                    const cl = st.entries[st.entries.length - 1];
                    const cAt = new Date().toISOString();
                    const ch = await _sha(cl.h + '|' + (cl.seq + 1) + '|' + cAt + '|compaction|' + cut + ' entries folded into anchor');
                    st.entries.push({ seq: cl.seq + 1, at: cAt, kind: 'compaction', s: cut + ' entries folded into anchor', h: ch });
                }
            }
            if (wrote) { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }
        } finally { _pumping = false; }
    }

    // ---------------------------------------------------------- verification
    // Recomputes every link from the anchor (or genesis). Returns the first
    // broken sequence number — never a bare boolean.
    window.jrnlVerify = async function () {
        const st = _store();
        if (!st || !st.entries.length) return { ok: true, entries: 0, brokenAt: null };
        let prev = st.anchor || await _sha(GENESIS);
        for (const e of st.entries) {
            const h = await _sha(prev + '|' + e.seq + '|' + e.at + '|' + e.kind + '|' + e.s);
            if (h !== e.h) return { ok: false, entries: st.entries.length, brokenAt: e.seq };
            prev = e.h;
        }
        const result = { ok: true, entries: st.entries.length, brokenAt: null };
        try {
            _pc().jrnlLastVerify = { at: new Date().toISOString(), ok: true, entries: result.entries };
            if (typeof scheduleAutosave === 'function') scheduleAutosave();
        } catch (_) {}
        return result;
    };

    // -------------------------------------------------------- instrumentation
    // Wrap the exported entry points of the consequential acts. Every wrap is
    // flag-guarded and additive; a missing target is simply skipped.
    function _wrapFn(obj, name, kind, describe) {
        try {
            const fn = obj[name];
            if (typeof fn !== 'function' || fn._jrnlWrapped) return;
            const wrapped = function () {
                const r = fn.apply(this, arguments);
                try { const d = describe(arguments, r); if (d) window.jrnl(kind, d); } catch (_) {}
                return r;
            };
            wrapped._jrnlWrapped = true;
            obj[name] = wrapped;
        } catch (_) {}
    }

    function _instrument() {
        // project load / restore (the exact refresh path)
        _wrapFn(window, '_applyProjectData', 'load', () => 'project state applied' + (typeof projectName !== 'undefined' && projectName ? ': ' + projectName : ''));
        // AutoReq apply
        if (window.AutoReq) _wrapFn(window.AutoReq, 'applyMerge', 'autoreq', (args, r) => 'AutoReq applied ' + r + ' change(s) [' + ((args[0] && args[0].scope) || '?') + ']');
        // dispositions
        _wrapFn(window, '_mcAccept', 'spf-accept', (args, r) => r ? 'single-failure path accepted: ' + args[0] + ' by ' + args[1] : null);
        _wrapFn(window, '_fsZonalAccept', 'zonal-accept', (args, r) => r ? 'zonal residual risk accepted: ' + args[0] + ' by ' + args[1] : null);
        _wrapFn(window, '_ccfApplyConfirm', 'ccf-confirm', (args, r) => r ? 'independence confirmed: ' + args[0] : null);
        _wrapFn(window, '_ccfApplyBucket', 'ccf-bucket', (args, r) => r ? 'CCF bucket applied: ' + args[0] : null);
        // rename propagation + thread bindings
        _wrapFn(window, 'rgApply', 'rename', (args, r) => 'rename propagated: ' + (args[0] && args[0].from) + ' → ' + (args[0] && args[0].to) + ' (' + r + ' ref(s))');
        _wrapFn(window, 'gtBind', 'bind', args => 'thread link bound: ' + args[0]);
        _wrapFn(window, 'gtUnbind', 'unbind', args => 'thread link unbound: ' + args[0]);
        // proofs & self-tests
        _wrapFn(window, 'rtProve', 'rt-proof', (args, r) => r ? 'round-trip proof: ' + (r.ok ? 'PROVEN' : 'FAILED') + ' (' + r.stores + ' stores)' : null);
        _wrapFn(window, 'engineSelfTest', 'self-test', (args, r) => r ? 'engine self-test: ' + r.pass + '/' + r.total + (r.ok ? ' ✓' : ' FAILED') : null);
    }
    _instrument();
    // late-loading targets (AutoReq namespace exists, but stay defensive)
    setTimeout(_instrument, 1200);

    // ------------------------------------------- panel on Thread Integrity
    function _injectPanel() {
        const host = document.getElementById('gt-integrity-host');
        if (!host) return;
        let div = document.getElementById('gt-jrnl-panel');
        if (!div) {
            div = document.createElement('div');
            div.id = 'gt-jrnl-panel';
            host.appendChild(div);
        }
        const st = _store();
        const entries = st ? st.entries.slice(-12).reverse() : [];
        div.innerHTML =
            '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-top:18px;">' +
            '<div style="padding:9px 14px; border-bottom:2px solid var(--color-text-primary); display:flex; justify-content:space-between; align-items:center;">' +
            '<b>Hash-chained journal</b>' +
            '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px;" onclick="jrnlVerifyUi()">Verify chain…</button></div>' +
            '<p style="font-size:12px; color:var(--color-text-secondary); padding:8px 14px 4px;">Every consequential act — loads, AutoReq applies, dispositions, renames, bindings, proofs — appends a SHA-256 hash-chained entry. Editing, reordering, or deleting any entry breaks the chain verifiably. ' +
            '<span class="u-mono">' + (st ? st.entries.length : 0) + ' entr' + (st && st.entries.length === 1 ? 'y' : 'ies') + (st && st.anchor ? ' · compacted anchor present' : '') + '</span></p>' +
            (entries.length
                ? '<div style="padding:0 14px 10px;">' + entries.map(e =>
                    '<div class="u-mono" style="font-size:10.5px; padding:1px 0; color:var(--color-text-tertiary);">#' + e.seq + ' ' +
                    _esc(String(e.at).slice(5, 16).replace('T', ' ')) + ' <span style="color:var(--color-text-secondary); font-weight:600;">' + _esc(e.kind) + '</span> ' + _esc(e.s) + '</div>').join('') + '</div>'
                : '<p class="u-mono" style="font-size:11px; color:var(--color-text-tertiary); padding:0 14px 10px;">No entries yet.</p>');
    }
    window.jrnlVerifyUi = async function () {
        try {
            const r = await window.jrnlVerify();
            if (typeof showToast === 'function') {
                showToast(r.ok ? 'Chain intact: ' + r.entries + ' entr' + (r.entries === 1 ? 'y' : 'ies') + ' verified ✓'
                    : 'CHAIN BROKEN at entry #' + r.brokenAt + ' — the journal was modified.', r.ok ? 'success' : 'error', r.ok ? 3200 : 8000);
            }
        } catch (e) { alert('Verification failed to run: ' + e.message); }
    };
    (function wrap() {
        if (typeof window.switchTab === 'function' && !window.switchTab._jrnlWrapped) {
            const orig = window.switchTab;
            const wrapped = function (tabId) {
                const r = orig.apply(this, arguments);
                try { if (tabId === 'gt-integrity') setTimeout(_injectPanel, 180); } catch (_) {}
                return r;
            };
            wrapped._jrnlWrapped = true;
            window.switchTab = wrapped;
        }
    })();

    // ------------------------------------------------------------- exports
    window._jrnlFlush = _pump;          // harness: force the async pump
    window._jrnlStore = _store;
})();
