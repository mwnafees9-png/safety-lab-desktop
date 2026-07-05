// ============================================================================
// lcc_module.js — Phase R4: life-cycle cost on the reliability data the
// program already maintains. The point of an LCC module inside a safety
// tool: the λ, MTTR and spares numbers driving the safety case are the SAME
// numbers that drive support cost — one model, two consequences, and a
// design change that buys reliability shows its payback here.
//
// Model (deterministic, per-item over the support period):
//   failures/yr        = λ_eff · annual FH · fleet
//   repair labor cost  = failures/yr · MTTR · labor rate
//   material cost      = failures/yr · repair material cost
//   downtime cost      = failures/yr · MDT · downtime rate  (opportunity)
//   spares holding     = sparesLevel(λ·FH·fleet·turnaround) units · unit cost
//   NPV over Y years at discount d: annuity factor A = (1 − (1+d)^−Y)/d
//     (verified: d=5%, Y=20 → A = 12.4622103425)
//
// Inputs come from the maintenance ledger (MTTR/MDT), the component library
// (λ), and the RAM settings page (annual FH, fleet, rates). Costs the model
// does not know are entered per item and stored under projectConfig.lcc.
//
// Born modular: page 'lcc'.
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function _store() {
        if (typeof projectConfig === 'undefined') return { items: [], params: {} };
        if (!projectConfig.lcc) projectConfig.lcc = { items: [], params: { years: 20, discount: 0.05, laborRate: 120, downtimeRate: 2500, turnaroundDays: 30 } };
        const s = projectConfig.lcc;
        if (!Array.isArray(s.items)) s.items = [];
        if (!s.params) s.params = { years: 20, discount: 0.05, laborRate: 120, downtimeRate: 2500, turnaroundDays: 30 };
        return s;
    }
    const _save = () => { try { if (typeof saveState === 'function') saveState(); } catch (_) {} };

    function _settings() {
        const rs = (typeof projectConfig !== 'undefined' && projectConfig.ramSettings) || {};
        const mx = (typeof projectConfig !== 'undefined' && projectConfig.mxAnalytics) || {};
        return { annualFH: rs.annualFH || mx.annualFH || 600, fleet: rs.fleet || 1 };
    }

    function annuity(discount, years) {
        if (!(years > 0)) return 0;
        if (!(discount > 0)) return years;
        return (1 - Math.pow(1 + discount, -years)) / discount;
    }

    // one item's yearly + NPV costs
    function lccItem(it, params, env) {
        const lam = it.lambda > 0 ? it.lambda : null;
        if (!lam) return null;
        const failYr = lam * env.annualFH * env.fleet;
        const labor = failYr * (it.mttr || 0) * params.laborRate;
        const material = failYr * (it.materialCost || 0);
        const downtime = failYr * (it.mdt || it.mttr || 0) * params.downtimeRate;
        // spares: expected demand over turnaround pipeline at 95% fill
        let spares = 0, sparesUnits = 0;
        if (it.unitCost > 0 && typeof window.sparesLevel === 'function') {
            const demand = lam * env.annualFH * env.fleet * (params.turnaroundDays / 365);
            try { const sl = window.sparesLevel(demand, 0.95); sparesUnits = (sl && sl.s != null) ? sl.s : (typeof sl === 'number' ? sl : 0); } catch (_) {}
            spares = sparesUnits * it.unitCost;
        }
        const yearly = labor + material + downtime;
        const A = annuity(params.discount, params.years);
        return { failYr, labor, material, downtime, yearly, sparesUnits, spares,
            npv: yearly * A + spares + (it.acquisition || 0),
            acquisition: it.acquisition || 0 };
    }

    function lccTotals() {
        const s = _store();
        const env = _settings();
        const rows = s.items.map(it => ({ it, c: lccItem(it, s.params, env) })).filter(x => x.c);
        const sum = k => rows.reduce((a, x) => a + x.c[k], 0);
        return { rows, env, params: s.params,
            totals: { yearly: sum('yearly'), npv: sum('npv'), spares: sum('spares'), acquisition: sum('acquisition') } };
    }

    // ------------------------------------------------------------ actions
    window.lccAdd = function () {
        // offer ledger/library items
        const lib = (typeof projectConfig !== 'undefined' && projectConfig.customLibrary) || {};
        const name = window.prompt('Item name (free text, or a component-library key: ' + Object.keys(lib).slice(0, 4).join(', ') + '…):', '');
        if (!name || !name.trim()) return;
        const it = { id: 'LCC-' + Date.now(), name: name.trim() };
        const libHit = lib[name.trim()];
        it.lambda = libHit && libHit.lambda > 0 ? libHit.lambda : parseFloat(window.prompt('Failure rate λ (/FH):', '5e-6'));
        if (libHit) it.name = libHit.name;
        it.mttr = parseFloat(window.prompt('MTTR (h):', '2')) || 0;
        it.mdt = parseFloat(window.prompt('MDT incl. logistics (h; blank = MTTR):', '')) || 0;
        it.acquisition = parseFloat(window.prompt('Acquisition cost per shipset ($):', '50000')) || 0;
        it.unitCost = parseFloat(window.prompt('Spare unit cost ($):', '25000')) || 0;
        it.materialCost = parseFloat(window.prompt('Repair material cost per event ($):', '3000')) || 0;
        _store().items.push(it);
        _save(); renderLccPage();
    };
    window.lccDelete = function (id) {
        const s = _store();
        const i = s.items.findIndex(x => x.id === id);
        if (i >= 0 && confirm('Remove this LCC item?')) { s.items.splice(i, 1); _save(); renderLccPage(); }
    };
    window.lccParams = function () {
        const s = _store();
        const p = s.params;
        p.years = parseFloat(window.prompt('Support period (years):', String(p.years))) || p.years;
        p.discount = parseFloat(window.prompt('Discount rate (fraction, e.g. 0.05):', String(p.discount)));
        if (!(p.discount >= 0)) p.discount = 0.05;
        p.laborRate = parseFloat(window.prompt('Labor rate ($/h):', String(p.laborRate))) || p.laborRate;
        p.downtimeRate = parseFloat(window.prompt('Downtime cost ($/h out of service):', String(p.downtimeRate))) || p.downtimeRate;
        p.turnaroundDays = parseFloat(window.prompt('Spares turnaround (days):', String(p.turnaroundDays))) || p.turnaroundDays;
        _save(); renderLccPage();
    };

    // ---------------------------------------------------------------- page
    const _$ = v => '$' + Math.round(v).toLocaleString();

    function renderLccPage() {
        const host = document.getElementById('lcc-host');
        if (!host) return;
        const { rows, env, params, totals } = lccTotals();
        let html = '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">' +
            '<div><button class="btn-cyan" style="font-size:12.5px; padding:7px 14px;" onclick="lccAdd()">+ LCC item</button> ' +
            '<button class="ckpt-m-btn" style="font-size:12px; padding:6px 12px;" onclick="lccParams()">parameters…</button></div>' +
            '<span class="u-mono" style="font-size:11px; color:var(--color-text-tertiary);">' + env.annualFH + ' FH/yr · fleet ' + env.fleet + ' · ' + params.years + ' yr @ ' + (params.discount * 100).toFixed(1) + '% · annuity ' + annuity(params.discount, params.years).toFixed(4) + '</span></div>';

        if (!rows.length) {
            html += '<p style="color:var(--color-text-tertiary); font-size:13px;">No items yet. Add by component-library key (λ auto-fills) or free text. The λ and MTTR here are the safety case\'s own numbers — a reliability improvement shows its support-cost payback on this page.</p>';
        } else {
            html += '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr><th></th><th>Item</th><th>λ (/FH)</th><th>Fail/yr (fleet)</th>' +
                '<th>Labor/yr</th><th>Material/yr</th><th>Downtime/yr</th><th>Spares (units)</th><th>Acq.</th><th>NPV ' + params.years + 'y</th></tr></thead><tbody>' +
                rows.map(({ it, c }) => '<tr><td><a href="#" onclick="lccDelete(\'' + it.id + '\'); return false;" style="color:#8E2A2A; font-size:11px;">✕</a></td>' +
                    '<td><b>' + _esc(it.name) + '</b></td>' +
                    '<td class="u-mono" style="font-size:11px;">' + Number(it.lambda).toExponential(1) + '</td>' +
                    '<td class="u-mono">' + c.failYr.toFixed(3) + '</td>' +
                    '<td class="u-mono">' + _$(c.labor) + '</td><td class="u-mono">' + _$(c.material) + '</td><td class="u-mono">' + _$(c.downtime) + '</td>' +
                    '<td class="u-mono">' + _$(c.spares) + ' (' + c.sparesUnits + ')</td>' +
                    '<td class="u-mono">' + _$(c.acquisition) + '</td>' +
                    '<td class="u-mono"><b>' + _$(c.npv) + '</b></td></tr>').join('') +
                '</tbody><tfoot><tr style="border-top:2px solid var(--color-text-primary); font-weight:700;"><td></td><td>Program total</td><td></td><td></td>' +
                '<td colspan="3" class="u-mono">' + _$(totals.yearly) + ' /yr recurring</td>' +
                '<td class="u-mono">' + _$(totals.spares) + '</td><td class="u-mono">' + _$(totals.acquisition) + '</td>' +
                '<td class="u-mono">' + _$(totals.npv) + '</td></tr></tfoot></table>';
        }
        html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">NPV = yearly recurring × annuity + spares holding + acquisition. Spares stock at 95% fill over the turnaround pipeline (Poisson). ' +
            'This page is a decision aid, not an accounting system — its power is that λ and MTTR are the safety model\'s own numbers, so design trades price themselves.</p>';
        host.innerHTML = html;
    }

    // ------------------------------------------------- navigation wrapper
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._lccWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-lcc');
                if (v) v.style.display = (tabId === 'lcc') ? 'block' : 'none';
                const s = document.getElementById('snav-lcc');
                if (s) s.classList.toggle('snav-active', tabId === 'lcc');
                if (tabId === 'lcc') renderLccPage();
            } catch (_) {}
            return r;
        };
        wrapped._lccWrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------ exports
    window.lccAnnuity = annuity;
    window.lccItemCost = lccItem;
    window.lccTotals = lccTotals;
    window.renderLccPage = renderLccPage;
})();
