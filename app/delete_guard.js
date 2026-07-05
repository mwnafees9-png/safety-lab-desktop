// ============================================================================
// delete_guard.js — referential integrity at the WRITE, not just the sweep.
//
// The Thread Integrity page detects a broken edge after the fact. This guard
// prevents the break at the moment it would happen: every delete entry point
// is wrapped so that deleting an artifact
//
//   1. snapshots the full project (the monolith's own serializer — the same
//      payload a save produces, so the restore path is battle-tested),
//   2. lets the original delete run (including its own confirm, if any),
//   3. re-runs the integrity sweep and diffs it against the pre-delete state,
//   4. if the deletion created NEW dangling references or NEW orphans, shows
//      exactly what broke — named edges, not a count — and offers to undo.
//      Undo restores the snapshot through _applyProjectData.
//
// The sweep is the oracle, so this works for every artifact type with ZERO
// per-type referrer logic — anything gtIntegrity can see, the guard protects.
// Deletion of a referenced artifact becomes a reviewed act, matching how the
// mod-impact wizard treats model changes.
//
// Also grafts the enforcement gate: an auto item on the SSA checklist —
// "golden thread carries no dangling references" — so pristineness is not
// merely visible but REQUIRED before the verification gate hands off.
//
// Born modular: wraps window delete functions at load (flag _delGuardWrapped
// on each); zero monolith edits.
// ============================================================================
(function () {
    'use strict';

    // the sweep diff: what is broken AFTER that was not broken BEFORE
    function _keyD(x) { return x.where + '→' + x.ref + '→' + x.detail; }
    function _keyO(x) { return x.where + '·' + x.ref; }
    function gtDiff(before, after) {
        const bd = new Set(before.dangling.map(_keyD));
        const bo = new Set(before.orphans.map(_keyO));
        return {
            newDangling: after.dangling.filter(x => !bd.has(_keyD(x))),
            newOrphans: after.orphans.filter(x => !bo.has(_keyO(x))),
        };
    }

    function _snapshot() {
        try {
            if (typeof _slabBuildProjectExport === 'function')
                return JSON.stringify(_slabBuildProjectExport());
        } catch (_) {}
        return null;
    }
    function _restore(snap) {
        try {
            if (snap && typeof _applyProjectData === 'function') {
                _applyProjectData(JSON.parse(snap));
                try { if (typeof saveState === 'function') saveState(); } catch (_) {}
                return true;
            }
        } catch (e) { console.warn('[delete-guard] restore failed:', e); }
        return false;
    }

    function _guard(fnName) {
        const orig = window[fnName];
        if (typeof orig !== 'function' || orig._delGuardWrapped) return;
        const wrapped = function () {
            let before = null, snap = null;
            try { before = gtIntegrity(); snap = _snapshot(); } catch (_) {}
            const r = orig.apply(this, arguments);
            try {
                if (before && snap) {
                    const after = gtIntegrity();
                    const d = gtDiff(before, after);
                    const broke = d.newDangling.length + d.newOrphans.length;
                    if (broke > 0) {
                        const lines = d.newDangling.slice(0, 6).map(x => '· DANGLING: ' + x.where + ' → ' + x.ref + ' (' + x.detail + ')')
                            .concat(d.newOrphans.slice(0, 4).map(x => '· ORPHANED: ' + x.where + ' ' + x.ref + ' — ' + x.detail));
                        const keep = confirm(
                            'This deletion broke ' + broke + ' golden-thread edge(s):\n\n' +
                            lines.join('\n') + (broke > lines.length ? '\n· … ' + (broke - lines.length) + ' more' : '') +
                            '\n\nOK = keep the deletion (breaks stay visible on Thread Integrity)\nCancel = UNDO the deletion');
                        if (!keep) {
                            if (_restore(snap)) {
                                try { if (typeof showToast === 'function') showToast('Deletion undone — the thread is intact.', 'info', 3500); } catch (_) {}
                            } else {
                                alert('Undo failed — check Thread Integrity for the broken edges.');
                            }
                        }
                    }
                }
            } catch (e) { console.warn('[delete-guard]', fnName, e); }
            return r;
        };
        wrapped._delGuardWrapped = true;
        window[fnName] = wrapped;
    }

    // every delete entry point the app exposes; absent names are skipped, and
    // new modules' deletes can be added here without touching anything else
    const GUARDED = [
        'deleteACFunction', 'deleteSysFunction', 'deleteACFCIM', 'deleteSysFCIM',
        'deleteACFHA', 'deleteACReq', 'deleteSysReq', 'deleteItem',
        'deletePRA', 'deleteZSA', 'deleteCMA', 'deleteRouting', 'deleteResource',
        'deleteFMEA',
    ];
    GUARDED.forEach(_guard);

    // ------------------------- enforcement gate: SSA demands a clean thread
    (function graftGate() {
        try {
            if (typeof CKPT_CHECKLISTS === 'undefined' || !Array.isArray(CKPT_CHECKLISTS.SSA)) return;
            if (CKPT_CHECKLISTS.SSA.some(i => i.id === 'gti')) return;
            CKPT_CHECKLISTS.SSA.push({
                id: 'gti', kind: 'auto', ref: 'GT',
                label: 'Golden thread carries no dangling references',
                eval: () => {
                    const r = gtIntegrity();
                    return { pass: r.dangling.length === 0,
                        detail: r.dangling.length ? r.dangling.length + ' dangling reference(s) — Thread Integrity page'
                            : r.checked + ' edges checked' + (r.fragile.length ? ' · ' + r.fragile.length + ' text edge(s) unbound (advisory)' : ' · clean') };
                },
            });
        } catch (_) {}
    })();

    // ------------------------------------------------------------ exports
    window._gtDiff = gtDiff;
    window._delGuardList = GUARDED.filter(n => typeof window[n] === 'function' && window[n]._delGuardWrapped);
})();
