// ============================================================================
// roundtrip_proof.js — Q5: the save/load pipeline proves itself.
//
// Every persistence feature in the app — autosave, the recovery ring, the
// delete-guard undo, disk write-through, cloud projects — rides the same
// pair: _slabBuildProjectExport() to serialize, _applyProjectData() to
// restore. A store that silently falls out of that pair (a new module
// forgetting to register, an apply path that drops a field) corrupts
// QUIETLY: everything looks fine until the reload that loses work.
//
// This module makes the pipeline prove itself:
//
//   1. Serialize the live project (snapshot A).
//   2. Apply A back through _applyProjectData — the exact code path a
//      refresh, a recovery, or an undo takes.
//   3. Serialize again (snapshot C).
//   4. Deep-compare A and C and report every mismatching PATH — not a
//      boolean, the named store and field that failed to survive.
//
// Volatile metadata (_betaBuild timestamps) is excluded; everything else
// must match exactly. The proof intentionally leaves the live state as
// apply(A) — that is precisely the state the next refresh would produce,
// so any difference it creates IS the defect being reported. The recovery
// ring captures the pre-proof state first, so even a lossy pipeline can't
// destroy work while being diagnosed.
//
// Surfaces: a "Prove round-trip" action on the Thread Integrity page, the
// last result stamped into projectConfig.rtProofLast (and thence the
// evidence package), and a permanent harness test that fails the build if
// ANY store stops surviving.
// ============================================================================
(function () {
    'use strict';

    // fields that legitimately differ between two serializations
    const VOLATILE_TOP = new Set(['_betaBuild']);

    // ------------------------------------------------------------ deep diff
    // Reports up to `cap` mismatching paths between a and b.
    function deepDiff(a, b, cap) {
        const out = [];
        cap = cap || 25;
        const push = (path, va, vb) => {
            if (out.length >= cap) return;
            const show = v => {
                if (v === undefined) return '(missing)';
                try { const s = JSON.stringify(v); return s && s.length > 60 ? s.slice(0, 57) + '…' : s; }
                catch (_) { return String(v); }
            };
            out.push({ path: path || '(root)', a: show(va), b: show(vb) });
        };
        (function walk(x, y, path) {
            if (out.length >= cap) return;
            if (x === y) return;
            const tx = Object.prototype.toString.call(x), ty = Object.prototype.toString.call(y);
            if (tx !== ty) { push(path, x, y); return; }
            if (Array.isArray(x)) {
                if (x.length !== y.length) { push(path + '.length', x.length, y.length); }
                const n = Math.min(x.length, y.length);
                for (let i = 0; i < n; i++) walk(x[i], y[i], path + '[' + i + ']');
                return;
            }
            if (x && typeof x === 'object') {
                const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
                keys.forEach(k => walk(x[k], y[k], path ? path + '.' + k : k));
                return;
            }
            // primitives (incl. NaN)
            if (!(typeof x === 'number' && typeof y === 'number' && isNaN(x) && isNaN(y))) push(path, x, y);
        })(a, b, '');
        return out;
    }

    function _strip(snap) {
        const s = Object.assign({}, snap);
        VOLATILE_TOP.forEach(k => { delete s[k]; });
        return s;
    }

    // ------------------------------------------------------------ the proof
    function rtProve(opts) {
        opts = opts || {};
        if (typeof _slabBuildProjectExport !== 'function' || typeof _applyProjectData !== 'function')
            throw new Error('serializer pair unavailable');
        // guard the work: pre-proof state into the recovery ring (fire-and-forget
        // is safe — the capture reads the autosave mirror, which apply() does not
        // touch until the next autosave write)
        if (!opts.skipRing) {
            try { if (typeof window._ringCapture === 'function') window._ringCapture(); } catch (_) {}
        }
        const t0 = Date.now();
        const A = _slabBuildProjectExport();
        const aJson = JSON.stringify(A);
        _applyProjectData(JSON.parse(aJson));          // the exact refresh/undo path
        const C = _slabBuildProjectExport();
        const mismatches = deepDiff(_strip(A), _strip(C), 25);
        const result = {
            at: new Date().toISOString(),
            ok: mismatches.length === 0,
            bytes: aJson.length,
            ms: Date.now() - t0,
            mismatches,
            stores: Object.keys(A).length,
        };
        try {
            if (typeof projectConfig !== 'undefined') {
                projectConfig.rtProofLast = { at: result.at, ok: result.ok, bytes: result.bytes,
                    stores: result.stores, mismatches: mismatches.map(m => m.path) };
                if (typeof scheduleAutosave === 'function') scheduleAutosave();
            }
        } catch (_) {}
        return result;
    }

    // ------------------------------------------------------------ UI action
    window.rtProveUi = function () {
        if (!confirm('Prove the save/load round-trip?\n\nThe live project is serialized, re-applied through the exact refresh path, and re-serialized — any field that fails to survive is named. The pre-proof state is captured to the recovery ring first.')) return;
        try {
            const r = rtProve();
            if (r.ok) {
                alert('ROUND-TRIP PROVEN ✓\n\n' + r.stores + ' top-level stores · ' + Math.round(r.bytes / 1024) + ' KB · ' + r.ms + ' ms\nEvery field survived serialize → apply → serialize.');
            } else {
                alert('ROUND-TRIP FAILED — ' + r.mismatches.length + ' field(s) did not survive:\n\n' +
                    r.mismatches.slice(0, 8).map(m => '· ' + m.path + '\n    saved: ' + m.a + '\n    after: ' + m.b).join('\n') +
                    '\n\nThese fields would be lost on refresh. The pre-proof state is in the recovery ring.');
            }
            try { renderGtIntegrityPage(); } catch (_) {}
        } catch (e) { alert('Proof failed to run: ' + e.message); }
    };

    // -------------------------------------- panel on the Thread Integrity page
    function _injectProofPanel() {
        const host = document.getElementById('gt-integrity-host');
        if (!host || document.getElementById('gt-rtproof-panel')) return;
        const last = (typeof projectConfig !== 'undefined' && projectConfig.rtProofLast) || null;
        const div = document.createElement('div');
        div.id = 'gt-rtproof-panel';
        div.innerHTML = '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-top:18px;">' +
            '<div style="padding:9px 14px; border-bottom:2px solid var(--color-text-primary); display:flex; justify-content:space-between; align-items:center;">' +
            '<b>Save/load round-trip proof</b>' +
            '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px;" onclick="rtProveUi()">Prove round-trip…</button></div>' +
            '<p style="font-size:12px; color:var(--color-text-secondary); padding:8px 14px 4px;">Serialize → apply through the exact refresh path → serialize → deep-compare. A store that stops surviving is named here before it can lose work quietly. The regression suite runs the same proof on every release.</p>' +
            '<p class="u-mono" style="font-size:11px; padding:0 14px 10px;' + (last && !last.ok ? ' color:#8E2A2A; font-weight:600;' : ' color:var(--color-text-tertiary);') + '">' +
            (last
                ? ('Last proof ' + last.at.slice(0, 16).replace('T', ' ') + ' — ' +
                    (last.ok ? 'PROVEN ✓ (' + last.stores + ' stores, ' + Math.round(last.bytes / 1024) + ' KB)'
                        : 'FAILED: ' + last.mismatches.slice(0, 4).join(', ') + (last.mismatches.length > 4 ? ' +' + (last.mismatches.length - 4) : '')))
                : 'Not yet run on this project.') + '</p></div>';
        host.appendChild(div);
    }
    (function wrap() {
        if (typeof window.switchTab === 'function' && !window.switchTab._rtProofWrapped) {
            const orig = window.switchTab;
            const wrapped = function (tabId) {
                const r = orig.apply(this, arguments);
                try { if (tabId === 'gt-integrity') setTimeout(() => { _injectProofPanel(); }, 80); } catch (_) {}
                return r;
            };
            wrapped._rtProofWrapped = true;
            window.switchTab = wrapped;
        }
    })();

    // ------------------------------------------------------------ exports
    window.rtProve = rtProve;
    window._rtDeepDiff = deepDiff;
})();
