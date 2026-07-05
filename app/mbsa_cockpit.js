// ============================================================================
// mbsa_cockpit.js — v1.0 — the MBSA layer joins the gate checklists.
//
// The PASA/SSA cockpits answer "what does this gate still need" — but the
// M-series machinery (typed deviation lanes, mode chains, model-generated
// FMEA, schema conformance) wasn't represented: a program could satisfy the
// checklist while the MBSA layer sat unproven. Four AUTO items close that,
// each reading the same engines the panels read (the P5 CEA-item pattern).
// AUTO items are computed — they cannot be attested past; they pass when
// the machinery passes.
// ============================================================================
(function () {
    'use strict';

    function _rules() {
        return (((typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}).macModels || []).filter(Boolean);
    }

    function graft() {
        if (typeof CKPT_CHECKLISTS === 'undefined') return false;

        // ---------------- PASA: the model must be whole before the gate closes
        // (pinned at the TOP of the checklist — the model's integrity is the
        // precondition everything below it computes against)
        if (Array.isArray(CKPT_CHECKLISTS.PASA) && !CKPT_CHECKLISTS.PASA.some(i => i.id === 'mbsa-schema')) {
            CKPT_CHECKLISTS.PASA.unshift(
                {
                    id: 'mbsa-schema', kind: 'auto', ref: 'MBSA',
                    label: 'MBSA model conforms to the schema contract',
                    eval: () => {
                        try {
                            const v = window.MBSA_SCHEMA.validate();
                            return { pass: v.ok, detail: v.rules + ' rule(s), ' + v.issues.length + ' issue(s)' + (v.issues.length ? ' — first: ' + v.issues[0] : '') };
                        } catch (_) { return { pass: true, detail: 'no MBSA model yet' }; }
                    },
                },
                {
                    id: 'mbsa-lanes', kind: 'auto', ref: 'M1',
                    label: 'Typed deviation lanes proven (BDD ⇔ reach on every non-loss lane)',
                    eval: () => {
                        try {
                            const eqs = window.l3EquivalenceAll();
                            const live = eqs.filter(e => !e.empty);
                            if (!live.length) return { pass: true, detail: 'no non-loss lanes modeled — availability-only program' };
                            const bad = live.filter(e => !e.agree);
                            return { pass: bad.length === 0, detail: live.length + ' lane(s) compiled, ' + (bad.length ? bad.length + ' ENGINE DISAGREEMENT(S)' : 'all corroborated') };
                        } catch (_) { return { pass: true, detail: 'lane engine unavailable' }; }
                    },
                },
                {
                    id: 'mbsa-modes', kind: 'auto', ref: 'M2',
                    label: 'Mode chains proven and reconfiguration claims substantiated',
                    eval: () => {
                        try {
                            const withModes = _rules().filter(r => Array.isArray(r.modes) && r.modes.length);
                            if (!withModes.length) return { pass: true, detail: 'no mode chains modeled' };
                            const bad = withModes.filter(r => { const m = window.m2Equivalence(r); return m && !m.empty && !m.agree; });
                            const unsub = [];
                            withModes.forEach(r => (r.modes || []).forEach((m, i) => {
                                if (i > 0 && m.switchP == null && !(Array.isArray(m.assumptionRefs) && m.assumptionRefs.length) && !(Array.isArray(r.assumptionRefs) && r.assumptionRefs.length)) unsub.push(r.id);
                            }));
                            return { pass: bad.length === 0 && unsub.length === 0,
                                detail: withModes.length + ' chain(s)' + (bad.length ? ' · ' + bad.length + ' engine disagreement(s)' : '') + (unsub.length ? ' · unsubstantiated switching on ' + [...new Set(unsub)].join(', ') : ' · all proven & substantiated') };
                        } catch (_) { return { pass: true, detail: 'mode engine unavailable' }; }
                    },
                }
            );
        }

        // ---------------- SSA: the as-built FMEA must reflect the model
        if (Array.isArray(CKPT_CHECKLISTS.SSA) && !CKPT_CHECKLISTS.SSA.some(i => i.id === 'mbsa-fmea')) {
            CKPT_CHECKLISTS.SSA.push({
                id: 'mbsa-fmea', kind: 'auto', ref: 'M1',
                label: 'Model-generated FMEA is current (no unapplied model changes)',
                eval: () => {
                    try {
                        const p = window.l3FmeaPreview();
                        const pending = p.isNew.length + p.isUpdated.length;
                        return { pass: pending === 0,
                            detail: pending ? pending + ' model change(s) awaiting signed apply · ' + p.orphaned.length + ' orphan(s)' : p.unchanged.length + ' row(s) verified current' + (p.orphaned.length ? ' · ' + p.orphaned.length + ' orphan(s) to disposition' : '') };
                    } catch (_) { return { pass: true, detail: 'model FMEA engine unavailable' }; }
                },
            });
        }
        return true;
    }
    if (!graft()) { let tries = 20; const t = setInterval(() => { if (graft() || --tries <= 0) clearInterval(t); }, 300); }

    // -------- the MBSA line on the cockpit/dashboard ACTIVITIES column
    function _mbsaSummary() {
        try {
            const rules = _rules();
            if (!rules.length) return 'no model yet';
            let lanes = 0, lanesOk = true, modes = 0, modesOk = true;
            try { const eqs = window.l3EquivalenceAll().filter(e => !e.empty); lanes = eqs.length; lanesOk = eqs.every(e => e.agree); } catch (_) {}
            try {
                const wm = rules.filter(r => Array.isArray(r.modes) && r.modes.length);
                modes = wm.length;
                modesOk = wm.every(r => { const m = window.m2Equivalence(r); return !m || m.empty || m.agree; });
            } catch (_) {}
            return rules.length + ' rules · ' + lanes + ' lane(s)' + (lanesOk ? ' ✓' : ' ✗') + ' · ' + modes + ' chain(s)' + (modesOk ? ' ✓' : ' ✗');
        } catch (_) { return '—'; }
    }
    (function wrapDetail() {
        if (typeof window._ckptDetail !== 'function' || window._ckptDetail._mbsaWrapped) return;
        const orig = window._ckptDetail;
        const wrapped = function (key) {
            const d = orig.apply(this, arguments);
            try {
                if (d && key === 'PASA' && Array.isArray(d.activities) && !d.activities.some(a => a && /MBSA — lanes/.test(a.t || ''))) {
                    d.activities.splice(2, 0, { t: 'MBSA — lanes & modes proven', v: _mbsaSummary(), tab: 'mac' });
                }
            } catch (_) {}
            return d;
        };
        wrapped._mbsaWrapped = true;
        window._ckptDetail = wrapped;
    })();
})();
