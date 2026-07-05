// ============================================================================
// rel_frameworks.js — Phases R3 + R5 + R6:
//   R3 — prediction-framework breadth: Telcordia-style and FIDES-style
//        model STRUCTURES alongside the existing MIL-HDBK-217F library.
//   R5 — storage / nonoperating failure rates with duty-cycle composition.
//   R6 — accelerated-test planning: Arrhenius and inverse-power-law
//        acceleration factors, environment K-factor conversion.
//
// INTELLECTUAL-PROPERTY POSITION (deliberate, stated in the UI): Telcordia
// SR-332 and the FIDES Guide are licensed documents. This module ships their
// model SHAPES — the factor algebra — with every base rate and factor value
// ENTERED BY THE USER from their own licensed copy. Nothing proprietary is
// reproduced. The MIL-HDBK sources already in the Component Library are
// U.S.-government publications and remain the shipped defaults.
//
// Math (all public-domain formulas, held in the regression suite):
//   Telcordia-style Method-I shape:  λ = λ_base · π_Q · π_S · π_T
//   FIDES-style shape:               λ = (Σ physical contributions) · Π_PM · Π_process
//   Duty-cycle composition (R5):     λ_eff = d·λ_op + (1−d)·K_no·λ_op
//   Arrhenius (R6):                  AF = exp[(Ea/k)(1/T_use − 1/T_test)], k = 8.617e-5 eV/K
//   Inverse power law (R6):          AF = (S_test/S_use)^n
//   Test compression:                t_test = t_field / AF
//
// Born modular: page 'rel-frameworks', state under projectConfig.relFw.
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const BOLTZ = 8.617e-5;   // eV/K

    // ---------------------------------------------------------- R6 math
    function arrheniusAF(eaEv, tUseC, tTestC) {
        if (!(eaEv > 0)) return null;
        const Tu = tUseC + 273.15, Tt = tTestC + 273.15;
        if (!(Tu > 0) || !(Tt > 0)) return null;
        return Math.exp((eaEv / BOLTZ) * (1 / Tu - 1 / Tt));
    }
    function iplAF(sUse, sTest, n) {
        if (!(sUse > 0) || !(sTest > 0) || !(n > 0)) return null;
        return Math.pow(sTest / sUse, n);
    }

    // ---------------------------------------------------------- R5 math
    function dutyEffLambda(lambdaOp, duty, kNonop) {
        if (!(lambdaOp > 0)) return null;
        const d = Math.min(1, Math.max(0, duty == null ? 1 : duty));
        const k = kNonop == null ? 0 : Math.max(0, kNonop);
        return d * lambdaOp + (1 - d) * k * lambdaOp;
    }

    // ---------------------------------------------------------- R3 math
    function telcordiaStyle(base, piQ, piS, piT) {
        if (!(base > 0)) return null;
        return base * (piQ > 0 ? piQ : 1) * (piS > 0 ? piS : 1) * (piT > 0 ? piT : 1);
    }
    function fidesStyle(contribs, piPM, piProcess) {
        const sum = (contribs || []).filter(c => c > 0).reduce((a, c) => a + c, 0);
        if (!(sum > 0)) return null;
        return sum * (piPM > 0 ? piPM : 1) * (piProcess > 0 ? piProcess : 1);
    }

    // ------------------------------------------------------------- store
    function _store() {
        if (typeof projectConfig === 'undefined') return { entries: [], accel: [] };
        if (!projectConfig.relFw) projectConfig.relFw = { entries: [], accel: [] };
        const s = projectConfig.relFw;
        if (!Array.isArray(s.entries)) s.entries = [];
        if (!Array.isArray(s.accel)) s.accel = [];
        return s;
    }
    const _save = () => { try { if (typeof saveState === 'function') saveState(); } catch (_) {} };

    // ------------------------------------------------------------ actions
    window.relFwAdd = async function () {
        const kind = window.prompt('Framework — type "telcordia" (λ·πQ·πS·πT shape), "fides" (Σphysical·Πprocess shape), or "duty" (operating/storage composition):', 'telcordia');
        if (!kind) return;
        const k = kind.trim().toLowerCase();
        const name = window.prompt('Component / item name:', '');
        if (!name || !name.trim()) return;
        const e = { id: 'FW-' + Date.now(), kind: k, name: name.trim() };
        if (k === 'telcordia') {
            e.base = parseFloat(window.prompt('Base failure rate λ_base (/h) — from YOUR licensed SR-332 tables:', '1e-7'));
            e.piQ = parseFloat(window.prompt('Quality factor π_Q:', '1'));
            e.piS = parseFloat(window.prompt('Stress factor π_S:', '1'));
            e.piT = parseFloat(window.prompt('Temperature factor π_T:', '1'));
        } else if (k === 'fides') {
            const cs = window.prompt('Physical contributions (/h, comma-separated — thermal, mechanical, humidity, … from YOUR FIDES guide):', '2e-8, 1e-8, 5e-9');
            if (!cs) return;
            e.contribs = cs.split(',').map(x => parseFloat(x)).filter(x => x > 0);
            e.piPM = parseFloat(window.prompt('Part-manufacturing factor Π_PM:', '1'));
            e.piProcess = parseFloat(window.prompt('Process factor Π_process:', '1'));
        } else if (k === 'duty') {
            e.lambdaOp = parseFloat(window.prompt('Operating failure rate λ_op (/h):', '5e-6'));
            e.duty = parseFloat(window.prompt('Duty cycle d (fraction of calendar time operating, 0–1):', '0.4'));
            e.kNonop = parseFloat(window.prompt('Nonoperating ratio K (λ_storage = K·λ_op; program-specific, typically ≪ 1):', '0.03'));
        } else { alert('Unknown framework.'); return; }
        _store().entries.push(e);
        _save(); renderRelFwPage();
    };
    window.relFwAccelAdd = function () {
        const name = window.prompt('Test-plan name:', 'FCC thermal accelerated life test');
        if (!name || !name.trim()) return;
        const e = { id: 'AC-' + Date.now(), name: name.trim() };
        e.ea = parseFloat(window.prompt('Activation energy Ea (eV) — failure-mechanism specific:', '0.7'));
        e.tUse = parseFloat(window.prompt('Use temperature (°C):', '40'));
        e.tTest = parseFloat(window.prompt('Test temperature (°C):', '85'));
        const v = window.prompt('Optional second stress — inverse power law: enter "S_use, S_test, n" (blank to skip):', '');
        if (v && v.trim()) {
            const p = v.split(',').map(x => parseFloat(x));
            if (p.length === 3 && p.every(x => x > 0)) { e.sUse = p[0]; e.sTest = p[1]; e.n = p[2]; }
        }
        e.fieldHours = parseFloat(window.prompt('Field hours to demonstrate:', '100000'));
        _store().accel.push(e);
        _save(); renderRelFwPage();
    };
    window.relFwDelete = function (id) {
        const s = _store();
        ['entries', 'accel'].forEach(kk => {
            const i = s[kk].findIndex(x => x.id === id);
            if (i >= 0 && confirm('Remove this row?')) { s[kk].splice(i, 1); _save(); renderRelFwPage(); }
        });
    };
    // push a computed rate into the component library (single truth for trees)
    window.relFwPush = function (id) {
        const e = _store().entries.find(x => x.id === id);
        if (!e) return;
        const lam = _entryLambda(e);
        if (!(lam > 0)) return;
        const key = window.prompt('Component-library key to create/update:', 'FW-' + e.name.replace(/[^\w]+/g, '-').toUpperCase().slice(0, 18));
        if (!key || !key.trim()) return;
        if (!projectConfig.customLibrary) projectConfig.customLibrary = {};
        projectConfig.customLibrary[key.trim()] = {
            name: e.name, lambda: lam,
            group: e.kind === 'fides' ? 'FIDES-shape (user factors)' : e.kind === 'duty' ? 'Duty-composed' : 'Telcordia-shape (user factors)',
            source: 'rel_frameworks — user-entered factors, formula-only framework', category: 'framework',
        };
        _save();
        alert('Pushed λ = ' + lam.toExponential(3) + '/h to the component library as "' + key.trim() + '".');
    };

    function _entryLambda(e) {
        if (e.kind === 'telcordia') return telcordiaStyle(e.base, e.piQ, e.piS, e.piT);
        if (e.kind === 'fides') return fidesStyle(e.contribs, e.piPM, e.piProcess);
        if (e.kind === 'duty') return dutyEffLambda(e.lambdaOp, e.duty, e.kNonop);
        return null;
    }

    // ---------------------------------------------------------------- page
    function renderRelFwPage() {
        const host = document.getElementById('rel-frameworks-host');
        if (!host) return;
        const s = _store();
        let html = '<div style="border:1px solid var(--color-border-hair); border-left:3px solid #9A6200; background:var(--color-surface-1); padding:10px 14px; margin-bottom:14px; font-size:12px; color:var(--color-text-secondary);">' +
            '<b>Licensing position:</b> Telcordia SR-332 and the FIDES Guide are licensed documents. This page ships their factor <i>algebra</i> only — every base rate and factor value comes from your own licensed copy. ' +
            'MIL-HDBK sources (U.S.-government publications) remain the shipped defaults in the Component Library.</div>';

        html += '<div style="margin-bottom:12px;"><button class="btn-cyan" style="font-size:12.5px; padding:7px 14px;" onclick="relFwAdd()">+ Framework entry</button> ' +
            '<button class="ckpt-m-btn" style="font-size:12px; padding:6px 12px;" onclick="relFwAccelAdd()">+ Accelerated-test plan</button></div>';

        if (s.entries.length) {
            html += '<b style="font-size:13px;">Prediction entries (R3 · R5)</b>' +
                '<table class="data-table" style="width:100%; font-size:12px; margin:6px 0 18px;"><thead><tr><th></th><th>Item</th><th>Shape</th><th>Inputs</th><th>λ (/h)</th><th></th></tr></thead><tbody>' +
                s.entries.map(e => {
                    const lam = _entryLambda(e);
                    const inputs = e.kind === 'telcordia' ? 'λ_base ' + Number(e.base).toExponential(1) + ' · πQ ' + e.piQ + ' · πS ' + e.piS + ' · πT ' + e.piT
                        : e.kind === 'fides' ? 'Σ(' + (e.contribs || []).map(c => Number(c).toExponential(1)).join('+') + ') · Π_PM ' + e.piPM + ' · Π_proc ' + e.piProcess
                        : 'λ_op ' + Number(e.lambdaOp).toExponential(1) + ' · d ' + e.duty + ' · K_nonop ' + e.kNonop;
                    return '<tr><td><a href="#" onclick="relFwDelete(\'' + e.id + '\'); return false;" style="color:#8E2A2A; font-size:11px;">✕</a></td>' +
                        '<td><b>' + _esc(e.name) + '</b></td><td class="u-mono" style="font-size:11px;">' + e.kind + '</td>' +
                        '<td class="u-mono" style="font-size:10.5px;">' + _esc(inputs) + '</td>' +
                        '<td class="u-mono"><b>' + (lam ? lam.toExponential(3) : '—') + '</b></td>' +
                        '<td><button class="ckpt-m-btn" style="font-size:10px; padding:1px 7px;" onclick="relFwPush(\'' + e.id + '\')">→ library</button></td></tr>';
                }).join('') + '</tbody></table>';
        }

        if (s.accel.length) {
            html += '<b style="font-size:13px;">Accelerated-test plans (R6)</b>' +
                '<table class="data-table" style="width:100%; font-size:12px; margin-top:6px;"><thead><tr><th></th><th>Plan</th><th>Arrhenius AF</th><th>IPL AF</th><th>Total AF</th><th>Field hours</th><th>Test hours needed</th></tr></thead><tbody>' +
                s.accel.map(e => {
                    const afA = arrheniusAF(e.ea, e.tUse, e.tTest);
                    const afI = (e.sUse && e.sTest && e.n) ? iplAF(e.sUse, e.sTest, e.n) : null;
                    const af = (afA || 1) * (afI || 1);
                    return '<tr><td><a href="#" onclick="relFwDelete(\'' + e.id + '\'); return false;" style="color:#8E2A2A; font-size:11px;">✕</a></td>' +
                        '<td><b>' + _esc(e.name) + '</b><br><span class="u-mono" style="font-size:10px; color:var(--color-text-tertiary);">Ea ' + e.ea + ' eV · ' + e.tUse + '→' + e.tTest + ' °C' + (afI ? ' · IPL (' + e.sUse + '→' + e.sTest + ')^' + e.n : '') + '</span></td>' +
                        '<td class="u-mono">' + (afA ? afA.toFixed(2) : '—') + '</td>' +
                        '<td class="u-mono">' + (afI ? afI.toFixed(2) : '—') + '</td>' +
                        '<td class="u-mono"><b>' + af.toFixed(2) + '</b></td>' +
                        '<td class="u-mono">' + (e.fieldHours ? e.fieldHours.toLocaleString() : '—') + '</td>' +
                        '<td class="u-mono"><b>' + (e.fieldHours && af > 1 ? Math.ceil(e.fieldHours / af).toLocaleString() : '—') + '</b></td></tr>';
                }).join('') + '</tbody></table>' +
                '<p style="font-size:10.5px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:6px;">AF is mechanism-specific: an Ea chosen for one failure mechanism says nothing about another. Compression only holds while the accelerated stress excites the SAME mechanism — overstress that changes the mechanism invalidates the plan.</p>';
        }

        if (!s.entries.length && !s.accel.length)
            html += '<p style="color:var(--color-text-tertiary); font-size:13px;">No entries yet. Framework entries compute λ from your licensed factor tables and push into the Component Library; accelerated-test plans convert field hours to test hours via Arrhenius / inverse-power-law acceleration.</p>';

        host.innerHTML = html;
    }

    // ------------------------------------------------- navigation wrapper
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._relFwWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-rel-frameworks');
                if (v) v.style.display = (tabId === 'rel-frameworks') ? 'block' : 'none';
                const s = document.getElementById('snav-rel-frameworks');
                if (s) s.classList.toggle('snav-active', tabId === 'rel-frameworks');
                if (tabId === 'rel-frameworks') renderRelFwPage();
            } catch (_) {}
            return r;
        };
        wrapped._relFwWrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------ exports
    window.arrheniusAF = arrheniusAF;
    window.iplAF = iplAF;
    window.dutyEffLambda = dutyEffLambda;
    window.telcordiaStyle = telcordiaStyle;
    window.fidesStyle = fidesStyle;
    window.renderRelFwPage = renderRelFwPage;
})();
