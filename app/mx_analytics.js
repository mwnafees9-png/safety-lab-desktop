// mx_analytics.js — Phase F6: the maintainability analytics suite.
// BORN MODULAR: new file, zero monolith edits; store under
// projectConfig.mxAnalytics; wraps switchTab for its views.
//
//   PM Interval Optimizer — joins the MTTR/MDT ledger's τ intervals to the
//     CCMR not-to-exceed bounds (live BDD bisection) and the inspection
//     burden: the safety↔maintenance trade on one screen.
//   Testability & Diagnostics — λ-weighted detection coverage from the FMEA
//     (detected λ / total λ, the standard testability figure of merit);
//     undetected modes are the latent-failure feedstock.
//   LORA — level-of-repair economics: discard vs line vs shop, annual cost.

(function () {
    'use strict';

    function _store() {
        if (!projectConfig.mxAnalytics) projectConfig.mxAnalytics = { annualFH: 600, lora: [] };
        const r = projectConfig.mxAnalytics;
        if (!(r.annualFH > 0)) r.annualFH = 600;
        if (!Array.isArray(r.lora)) r.lora = [];
        return r;
    }
    function _save() { try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {} }
    function _toast(m, k, t) { try { if (typeof showToast === 'function') showToast(m, k || 'info', t || 3000); } catch (_) {} }
    async function _ask(msg, dflt) {
        try { if (typeof slPrompt === 'function') return await slPrompt(msg, dflt || ''); } catch (_) {}
        return window.prompt(msg, dflt || '');
    }
    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    function _access() { return (typeof window._ramHasAccess === 'function') ? window._ramHasAccess() : true; }
    const _gate = host => { host.innerHTML = '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-2); padding:26px 30px; max-width:640px;"><h3 style="margin:0 0 10px; border:none; padding:0;">Maintainability analytics is a Pro+ capability</h3><p style="font-size:13px; color:var(--color-text-secondary);">PM interval optimization against the CCMR bounds, testability coverage, and level-of-repair economics.</p></div>'; };
    const _chip = (l, v, warn) => '<div style="height:32px; display:inline-flex; align-items:center; padding:0 12px; border:1px solid var(--color-border-strong); font-family:var(--font-mono); font-size:12px;">' + l + ' <b style="margin-left:6px;' + (warn ? ' color:#B45309;' : '') + '">' + v + '</b></div>';

    // ====================================================== PM optimizer
    // For every ledger task with a linked event and an interval: the CCMR
    // sweep's not-to-exceed bound (τ_max at the hazard target, computed by
    // bisection through the live BDD), the safety margin, and the inspection
    // burden at the current τ vs at the bound. Nothing is auto-applied: the
    // optimizer PRESENTS the trade; the engineer moves τ with → τ, signed by
    // the act of doing it.
    function pmOptRows() {
        const tasks = (typeof window._ramStore === 'function') ? window._ramStore().tasks : [];
        let sweep = [];
        try { if (typeof ccmrLatentSweep === 'function') sweep = ccmrLatentSweep(true); } catch (_) {}
        const annualFH = _store().annualFH;
        return tasks.filter(t => t.beRef && t.interval > 0).map(t => {
            const hit = (typeof _fmesFindBe === 'function') ? _fmesFindBe(t.beRef) : null;
            const row = hit ? sweep.find(r => r.pageId === hit.page.id && (r.event === (hit.node.displayId || hit.node.name))) : null;
            const nte = row && row.nte != null && isFinite(row.nte) ? row.nte : null;
            const applied = hit && hit.node.repairModel === 'periodic' && hit.node.tau > 0 ? hit.node.tau : null;
            const margin = nte != null ? nte / t.interval : null;
            return {
                t, hit, nte, applied, margin,
                inspPerYearNow: annualFH / t.interval,
                inspPerYearAtNte: nte != null ? annualFH / nte : null,
                verdict: nte == null ? (applied ? 'no hazard bound (not on a Cat/Haz thread)' : 'apply → τ first')
                    : t.interval <= nte ? 'within bound ✓'
                    : 'EXCEEDS the hazard bound',
            };
        });
    }
    async function pmSetAnnualFH() {
        const v = parseFloat(await _ask('Annual utilization per aircraft (FH/year):', _store().annualFH));
        if (!(v > 0)) return;
        _store().annualFH = v; _save(); renderRamPmoptPage();
    }
    function renderRamPmoptPage() {
        const host = document.getElementById('ram-pmopt-host');
        if (!host) return;
        if (!_access()) { _gate(host); return; }
        const rows = pmOptRows();
        const bad = rows.filter(r => /EXCEEDS/.test(r.verdict)).length;
        let html = '<div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">' +
            _chip('Intervals under optimization', String(rows.length)) +
            _chip('Exceeding the hazard bound', String(bad), bad > 0) +
            _chip('Annual FH', String(_store().annualFH)) +
            '</div><div style="margin:0 0 10px;"><button class="btn-cyan" onclick="pmSetAnnualFH()">Set annual utilization</button> ' +
            '<span style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">NTE = largest τ keeping the linked failure condition inside its target, bisected through the live BDD (CCMR machinery)</span></div>';
        html += '<table class="data-table" style="width:100%; font-size:12.5px;"><thead><tr>' +
            '<th>Task</th><th>Event</th><th>τ current (FH)</th><th>τ applied</th><th>NTE bound (FH)</th><th>Margin</th><th>Insp/yr now</th><th>Insp/yr at NTE</th><th>Verdict</th></tr></thead><tbody>';
        if (!rows.length) html += '<tr><td colspan="9" style="color:var(--color-text-tertiary);">No optimizable intervals — ledger tasks need a linked basic event and an interval, applied with → τ so the CCMR sweep sees them.</td></tr>';
        rows.forEach(r => {
            html += '<tr><td>' + _esc(r.t.name) + '</td>' +
                '<td class="u-mono">' + (r.hit ? _esc(r.hit.node.displayId || r.t.beRef) : _esc(r.t.beRef)) + '</td>' +
                '<td class="u-mono">' + r.t.interval + '</td>' +
                '<td class="u-mono">' + (r.applied != null ? r.applied : '<span style="color:#B45309;">not applied</span>') + '</td>' +
                '<td class="u-mono">' + (r.nte != null ? Math.round(r.nte).toLocaleString() : '—') + '</td>' +
                '<td class="u-mono">' + (r.margin != null ? (r.margin >= 1 ? '×' + r.margin.toFixed(2) + ' headroom' : '×' + r.margin.toFixed(2)) : '—') + '</td>' +
                '<td class="u-mono">' + r.inspPerYearNow.toFixed(1) + '</td>' +
                '<td class="u-mono">' + (r.inspPerYearAtNte != null ? r.inspPerYearAtNte.toFixed(1) : '—') + '</td>' +
                '<td style="font-family:var(--font-mono); font-size:11px; color:' + (/EXCEEDS/.test(r.verdict) ? '#8E2A2A' : /within/.test(r.verdict) ? '#1D9E75' : 'var(--color-text-tertiary)') + ';">' + _esc(r.verdict) + '</td></tr>';
        });
        html += '</tbody></table>' +
            '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">The trade on one screen: stretching τ toward the NTE bound cuts inspections/yr but eats safety margin. The optimizer never moves τ itself — change the interval in the ledger and re-apply → τ, so every change is an act.</p>';
        host.innerHTML = html;
    }

    // ================================================ testability coverage
    // λ-weighted detection coverage per system from the FMEA: Σλ(detected
    // modes)/Σλ(all modes). Undetected modes are latent-failure feedstock —
    // cross-referenced against the CCMR candidates.
    function testabilityRows() {
        const rows = (typeof fmeaData !== 'undefined' ? fmeaData : []) || [];
        const bySys = new Map();
        rows.forEach(r => {
            if (r.fmeaType && r.fmeaType !== 'piece-part') return;
            const sysId = r.owningSystemId || '(aircraft)';
            if (!bySys.has(sysId)) bySys.set(sysId, { sysId, total: 0, detected: 0, modes: 0, undetected: [] });
            const g = bySys.get(sysId);
            const lam = parseFloat(r.rate) || 0;
            g.modes++;
            g.total += lam;
            if (String(r.detection || '').trim()) g.detected += lam;
            else g.undetected.push(r);
        });
        return [...bySys.values()].map(g => {
            const sys = ((typeof systemsData !== 'undefined' ? systemsData : []) || []).find(s => s.id === g.sysId);
            return Object.assign(g, {
                name: sys ? sys.name : g.sysId,
                coverage: g.total > 0 ? g.detected / g.total : null,
            });
        });
    }
    function renderRamTestPage() {
        const host = document.getElementById('ram-test-host');
        if (!host) return;
        if (!_access()) { _gate(host); return; }
        const rows = testabilityRows();
        const totLam = rows.reduce((a, g) => a + g.total, 0);
        const detLam = rows.reduce((a, g) => a + g.detected, 0);
        let html = '<div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">' +
            _chip('Overall λ-weighted coverage', totLam > 0 ? (detLam / totLam * 100).toFixed(1) + '%' : '—', totLam > 0 && detLam / totLam < 0.9) +
            _chip('Failure modes', String(rows.reduce((a, g) => a + g.modes, 0))) +
            _chip('Undetected modes', String(rows.reduce((a, g) => a + g.undetected.length, 0)), rows.some(g => g.undetected.length)) + '</div>';
        html += '<table class="data-table" style="width:100%; max-width:880px; font-size:12.5px;"><thead><tr>' +
            '<th>System</th><th>Modes</th><th>Σλ (/h)</th><th>Detected λ</th><th>Coverage (λ-wt)</th><th>Undetected modes</th></tr></thead><tbody>';
        if (!rows.length) html += '<tr><td colspan="6" style="color:var(--color-text-tertiary);">No piece-part FMEA rows yet — coverage computes from each mode\'s detection means and rate.</td></tr>';
        rows.forEach(g => {
            html += '<tr><td>' + _esc(g.name) + '</td><td class="u-mono">' + g.modes + '</td>' +
                '<td class="u-mono">' + (g.total > 0 ? g.total.toExponential(2) : '—') + '</td>' +
                '<td class="u-mono">' + (g.detected > 0 ? g.detected.toExponential(2) : '—') + '</td>' +
                '<td class="u-mono"' + (g.coverage != null && g.coverage < 0.9 ? ' style="color:#B45309;"' : '') + '>' + (g.coverage != null ? (g.coverage * 100).toFixed(1) + '%' : '—') + '</td>' +
                '<td style="font-size:11.5px;">' + (g.undetected.length
                    ? g.undetected.slice(0, 3).map(r => _esc((r.part || '') + ' — ' + (r.mode || ''))).join('<br>') + (g.undetected.length > 3 ? '<br>… +' + (g.undetected.length - 3) : '')
                    : '<span style="color:#1D9E75;">all detected</span>') + '</td></tr>';
        });
        html += '</tbody></table>' +
            '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">Coverage = Σλ(modes with a detection means)/Σλ(all modes) — the standard testability figure of merit, λ-weighted so a rare detected mode cannot mask a frequent undetected one. Every undetected mode is a latent-failure candidate: give it a detection means, an OP/VC failure-finding task (MSG-3), or an exposure interval the CCMR sweep can bound.</p>';
        host.innerHTML = html;
    }

    // ============================================================== LORA
    // Level of repair: annual demand × variable cost per level + amortized
    // fixed cost. Deterministic; the cheapest level wins, ties to discard.
    function loraEvaluate(c) {
        const demand = c.units * c.lambda * c.annualFH;          // failures / year (fleet)
        const levels = [
            { level: 'Discard', annual: demand * c.discardCost, fixed: 0 },
            { level: 'Line (on-aircraft LRU swap + repair)', annual: demand * c.lineCost, fixed: c.lineFixed || 0 },
            { level: 'Shop (depot, incl. shipping/spares float)', annual: demand * c.shopCost, fixed: c.shopFixed || 0 },
        ].map(l => Object.assign(l, { total: l.annual + l.fixed }));
        const best = levels.reduce((a, b) => (b.total < a.total ? b : a), levels[0]);
        return { demand, levels, best };
    }
    async function loraAddCase() {
        if (!_access()) return;
        const name = await _ask('Item (e.g. "Air data computer"):'); if (!name || !name.trim()) return;
        const lambda = parseFloat(await _ask('Item λ (per hour):', '2e-5')); if (!(lambda > 0)) return;
        const units = parseInt(await _ask('Installed units across the fleet:', '24')) || 1;
        const annualFH = parseFloat(await _ask('Annual FH per aircraft:', _store().annualFH)) || _store().annualFH;
        const discardCost = parseFloat(await _ask('Unit replacement (discard) cost:', '18000')) || 0;
        const lineCost = parseFloat(await _ask('Per-event cost at LINE (labor + parts):', '2500')) || 0;
        const lineFixed = parseFloat(await _ask('Annual fixed cost for line capability (tooling/training):', '15000')) || 0;
        const shopCost = parseFloat(await _ask('Per-event cost at SHOP (repair + shipping):', '5500')) || 0;
        const shopFixed = parseFloat(await _ask('Annual fixed cost for shop capability (test equipment amortized):', '40000')) || 0;
        _store().lora.push({ id: 'LR-' + Date.now(), name: name.trim(), lambda, units, annualFH, discardCost, lineCost, lineFixed, shopCost, shopFixed });
        _save(); renderRamLoraPage();
    }
    function loraDelete(id) {
        const s = _store();
        const i = s.lora.findIndex(x => x.id === id);
        if (i >= 0 && confirm('Remove this LORA case?')) { s.lora.splice(i, 1); _save(); renderRamLoraPage(); }
    }
    function renderRamLoraPage() {
        const host = document.getElementById('ram-lora-host');
        if (!host) return;
        if (!_access()) { _gate(host); return; }
        const S = _store();
        let html = '<div style="margin:0 0 12px;"><button class="btn-cyan" onclick="loraAddCase()">+ LORA case</button> ' +
            '<span style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">annual demand = units × λ × FH/yr · cheapest total (variable + amortized fixed) wins</span></div>';
        if (!S.lora.length) html += '<p style="color:var(--color-text-tertiary); font-size:13px;">No repair-level cases yet.</p>';
        S.lora.forEach(c => {
            const r = loraEvaluate(c);
            html += '<h3>' + _esc(c.name) + ' <a href="#" style="font-size:11px;" onclick="loraDelete(\'' + c.id + '\'); return false;">remove</a></h3>' +
                '<p style="font-size:12px; font-family:var(--font-mono); color:var(--color-text-secondary);">Fleet demand: ' + r.demand.toFixed(2) + ' events/yr (' + c.units + ' units × ' + c.lambda.toExponential(1) + ' /h × ' + c.annualFH + ' FH)</p>' +
                '<table class="data-table" style="width:100%; max-width:680px; font-size:12.5px;"><thead><tr><th>Level</th><th>Variable $/yr</th><th>Fixed $/yr</th><th>Total $/yr</th><th></th></tr></thead><tbody>' +
                r.levels.map(l => '<tr' + (l === r.best ? ' style="font-weight:600;"' : '') + '><td>' + _esc(l.level) + '</td>' +
                    '<td class="u-mono">' + Math.round(l.annual).toLocaleString() + '</td>' +
                    '<td class="u-mono">' + Math.round(l.fixed).toLocaleString() + '</td>' +
                    '<td class="u-mono">' + Math.round(l.total).toLocaleString() + '</td>' +
                    '<td>' + (l === r.best ? '<span style="color:#1D9E75; font-family:var(--font-mono); font-size:11px;">← RECOMMENDED</span>' : '') + '</td></tr>').join('') +
                '</tbody></table>';
        });
        html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">Economics only — safety-driven repair constraints (e.g. a SIL/DAL-critical unit that must return to an approved shop) override the recommendation and belong in the item\'s notes.</p>';
        host.innerHTML = html;
    }

    // ------------------------------------------------- navigation wrapper
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._mxAnalyticsWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                [['ram-pmopt', renderRamPmoptPage], ['ram-test', renderRamTestPage], ['ram-lora', renderRamLoraPage]].forEach(([id, fn]) => {
                    const v = document.getElementById('view-' + id);
                    if (v) v.style.display = (tabId === id) ? 'block' : 'none';
                    const s = document.getElementById('snav-' + id);
                    if (s) s.classList.toggle('snav-active', tabId === id);
                    if (tabId === id) fn();
                });
            } catch (_) {}
            return r;
        };
        wrapped._mxAnalyticsWrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------ exports
    window.renderRamPmoptPage = renderRamPmoptPage;
    window.renderRamTestPage = renderRamTestPage;
    window.renderRamLoraPage = renderRamLoraPage;
    window.pmSetAnnualFH = pmSetAnnualFH;
    window.loraAddCase = loraAddCase;
    window.loraDelete = loraDelete;
    window.pmOptRows = pmOptRows;
    window.testabilityRows = testabilityRows;
    window.loraEvaluate = loraEvaluate;
})();
