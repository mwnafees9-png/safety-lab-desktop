// ============================================================================
// ram_cockpit.js — the seventh dashboard card: RAM program posture.
//
// Deliberately NOT a clone of the six assessment cockpits. Those model gated
// hand-offs (inputs → activities → checklist → baseline & hand off). R&M is
// a CONTINUOUS program — prediction → FRACAS loop → MSG-3 → dispatch — that
// never hands off; it FEEDS the gates. So this card renders program posture
// and, in place of a hand-off gate, a "feeds the gates" strip whose most
// important line is the challenge detector: a FRACAS field finding on a
// basic event that sits in a HANDED-OFF tree means service data is
// challenging a rate the certification argument already used — visible from
// the dashboard, where a DER looks first.
//
// Pro+ only (matches the RAM nav gating). All numbers come from the live
// modules (ramFieldRows, ccmrLatentSweep, ramDispatchStats, msg3 stores) —
// zero new math, zero new state. Born modular: wraps renderProcessStrip.
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function _access() {
        try { return typeof window._ramHasAccess === 'function' ? window._ramHasAccess() : true; } catch (_) { return true; }
    }

    // Which assessment does a tree page belong to? (for the challenge detector)
    function _pageGate(page) {
        if (!page) return null;
        if (page.verifies || page.mode === 'bottom-up') return 'SSA';
        return page.treeLevel === 'aircraft' ? 'PASA' : 'PSSA';
    }

    // ------------------------------------------------------------- posture
    function ramCockpitPosture() {
        const p = { coverage: {}, fracas: {}, latents: {}, dispatch: {}, msg3: {}, challenges: [], feeds: {} };

        // coverage: items vs ledger tasks vs failure rates
        const items = (typeof itemsData !== 'undefined' && itemsData) || [];
        const tasks = (typeof projectConfig !== 'undefined' && projectConfig.ram && projectConfig.ram.tasks) || [];
        p.coverage.items = items.length;
        p.coverage.withTask = items.filter(i =>
            tasks.some(t => t.itemId === i.itemId || (t.name || '').includes(i.name))).length;
        p.coverage.tasks = tasks.length;
        p.coverage.withMttr = tasks.filter(t => t.activeRepair > 0 || t.mttr > 0).length;

        // FRACAS verdicts
        try {
            const rows = (typeof window.ramFieldRows === 'function') ? window.ramFieldRows() : [];
            p.fracas = { total: rows.length,
                verified: rows.filter(x => x.verdict === 'verified').length,
                findings: rows.filter(x => x.verdict === 'finding').length,
                inconclusive: rows.filter(x => x.verdict === 'inconclusive' || x.verdict === 'point-above').length };
            // the challenge detector: a finding whose basic event lives in a
            // handed-off tree challenges a rate the argument already used
            let phases = null;
            try { phases = (typeof applyCockpitStatuses === 'function' && typeof computePhaseStatus === 'function')
                ? applyCockpitStatuses(computePhaseStatus()) : null; } catch (_) {}
            rows.filter(x => x.verdict === 'finding').forEach(x => {
                const hit = x.hit || ((typeof _fmesFindBe === 'function') ? _fmesFindBe(x.f && x.f.beRef) : null);
                if (!hit || !hit.page) return;
                const gate = _pageGate(hit.page);
                const status = phases && phases[gate] && phases[gate].status;
                if (status === 'handed-off' || status === 'reopened')
                    p.challenges.push({ beRef: (x.f && x.f.beRef) || '?', name: (hit.node && hit.node.name) || '',
                        page: hit.page.name || hit.page.id, gate, status,
                        predicted: x.predicted, observed: x.point });
            });
        } catch (_) { p.fracas = { total: 0, verified: 0, findings: 0, inconclusive: 0 }; }

        // latents vs not-to-exceed
        try {
            const lat = (typeof ccmrLatentSweep === 'function') ? ccmrLatentSweep(true) : [];
            p.latents = { total: lat.length, exceeds: lat.filter(r => r.exceeds).length };
        } catch (_) { p.latents = { total: 0, exceeds: 0 }; }

        // dispatch reliability
        try {
            const d = (typeof window.ramDispatchStats === 'function') ? window.ramDispatchStats() : null;
            p.dispatch = d || { cycles: 0, interruptions: 0, dr: null };
        } catch (_) { p.dispatch = { cycles: 0, interruptions: 0, dr: null }; }

        // MSG-3 family completeness
        try {
            const m = (typeof projectConfig !== 'undefined' && projectConfig.msg3) || { msis: [] };
            const x = (typeof projectConfig !== 'undefined' && projectConfig.msg3x) || { ssis: [], zonesDone: {}, lhirf: [] };
            const zones = (typeof window.msg3xZonalRows === 'function') ? window.msg3xZonalRows() : [];
            p.msg3 = {
                msis: (m.msis || []).length,
                ssis: (x.ssis || []).length,
                zones: zones.length,
                zonesPushed: Object.keys(x.zonesDone || {}).length,
                lhirf: (x.lhirf || []).length,
                lhirfOwed: (x.lhirf || []).filter(f => !f.accepted).length,
            };
        } catch (_) { p.msg3 = { msis: 0, ssis: 0, zones: 0, zonesPushed: 0, lhirf: 0, lhirfOwed: 0 }; }

        // feeds-the-gates strip: what RAM currently contributes
        try {
            p.feeds.taus = tasks.filter(t => t.msg3 || t.msg3x || t.origin).length;
            p.feeds.mmel = ((typeof projectConfig !== 'undefined' && projectConfig.mmel && projectConfig.mmel.items) || []).length;
            p.feeds.evidence = (typeof window.ramThreadEvidence === 'function') ? 'wired' : 'off';
        } catch (_) {}

        // card status: honest, program-shaped (not the hand-off vocabulary)
        p.status = p.challenges.length ? 'challenge'
            : (p.latents.exceeds || p.fracas.findings) ? 'attention'
            : (p.coverage.tasks || p.fracas.total || p.msg3.msis || p.msg3.ssis) ? 'running'
            : 'empty';
        return p;
    }

    // ---------------------------------------------------------------- card
    const _STATUS = {
        challenge: { label: 'FINDING vs HANDED-OFF GATE', chip: 'reopened' },
        attention: { label: 'Findings under watch', chip: 'in-progress' },
        running: { label: 'Program running', chip: 'complete' },
        empty: { label: 'Not started', chip: 'not-started' },
    };

    function _injectCard() {
        const host = document.getElementById('dash-process-strip');
        if (!host || document.getElementById('ram-ckpt-card')) return;
        if (!_access()) return;   // Pro+ only, like the nav
        const p = ramCockpitPosture();
        const st = _STATUS[p.status];
        const chip = '<span class="ckpt-chip ckpt-chip-' + st.chip + '">' + _esc(st.label) + '</span>';
        const stat = (label, val, warn) =>
            '<span class="u-mono" style="font-size:10.5px; margin-right:10px;' + (warn ? ' color:#8E2A2A; font-weight:700;' : ' color:var(--color-text-secondary);') + '">' +
            label + ' <b>' + val + '</b></span>';

        const div = document.createElement('div');
        div.id = 'ram-ckpt-card';
        div.innerHTML =
            '<div class="ckpt-row-label">R&amp;M program — continuous track (feeds the gates)</div>' +
            '<div class="ckpt-card" tabindex="0" role="button" onclick="openRamCockpitModal()" ' +
            'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault(); this.click();}" ' +
            'title="Reliability & maintainability posture — prediction, FRACAS, MSG-3, dispatch. Never hands off; it feeds SSA/ASA.">' +
            '<div class="ckpt-head"><span class="ckpt-designation">RAM</span>' + chip + '</div>' +
            '<div class="ckpt-name">Reliability &amp; Maintainability</div>' +
            '<div style="margin-top:6px; line-height:1.9;">' +
            stat('tasks', p.coverage.tasks) +
            stat('FRACAS', p.fracas.verified + '✓ ' + p.fracas.findings + '✗ ' + p.fracas.inconclusive + '…', p.fracas.findings > 0) +
            stat('latents', p.latents.total + (p.latents.exceeds ? ' (' + p.latents.exceeds + ' exceed)' : ''), p.latents.exceeds > 0) +
            stat('MSG-3', p.msg3.msis + '+' + p.msg3.ssis + ' · zones ' + p.msg3.zonesPushed + '/' + p.msg3.zones) +
            (p.dispatch.dr != null ? stat('DR', p.dispatch.dr.toFixed(2) + '%') : '') +
            (p.challenges.length ? stat('⚠ gate challenges', p.challenges.length, true) : '') +
            '</div></div>';
        host.appendChild(div);
    }

    // --------------------------------------------------------------- modal
    window.openRamCockpitModal = function () {
        const old = document.getElementById('ram-ckpt-modal');
        if (old) old.remove();
        const p = ramCockpitPosture();
        const sec = (title, body) => '<div style="margin-bottom:16px;"><div style="font-weight:700; font-size:13px; border-bottom:2px solid var(--color-text-primary); padding-bottom:4px; margin-bottom:8px;">' + title + '</div>' + body + '</div>';
        const row = (l, v, warn) => '<div style="display:flex; justify-content:space-between; font-size:12.5px; padding:3px 0;' + (warn ? ' color:#8E2A2A; font-weight:600;' : '') + '"><span>' + l + '</span><span class="u-mono">' + v + '</span></div>';

        let challenges = '';
        if (p.challenges.length) {
            challenges = sec('⚠ Field findings challenging handed-off gates',
                '<p style="font-size:12px; color:var(--color-text-secondary); margin:0 0 8px;">Service data disputes a failure rate a handed-off argument used. The gate\'s evidence stands on a number the field is contradicting — reopen or defend.</p>' +
                '<table class="data-table" style="width:100%; font-size:11.5px;"><thead><tr><th>Event</th><th>Tree</th><th>Gate</th><th>Predicted MTBF</th><th>Observed</th></tr></thead><tbody>' +
                p.challenges.map(c => '<tr><td class="u-mono">' + _esc(c.beRef) + ' ' + _esc(c.name) + '</td><td>' + _esc(c.page) + '</td>' +
                    '<td class="u-mono">' + _esc(c.gate) + ' (' + _esc(c.status) + ')</td>' +
                    '<td class="u-mono">' + (c.predicted ? Math.round(c.predicted) + ' h' : '—') + '</td>' +
                    '<td class="u-mono" style="color:#8E2A2A;">' + (c.observed ? Math.round(c.observed) + ' h' : '—') + '</td></tr>').join('') +
                '</tbody></table>');
        }

        const div = document.createElement('div');
        div.id = 'ram-ckpt-modal';
        div.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:9000; display:flex; align-items:center; justify-content:center;';
        div.innerHTML = '<div style="background:var(--color-surface-0, #fff); max-width:760px; width:92%; max-height:82vh; overflow:auto; padding:22px 26px; border:1px solid var(--color-border-strong); box-shadow:0 18px 60px rgba(0,0,0,0.3);">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">' +
            '<b style="font-size:16px;">R&amp;M Program Posture</b>' +
            '<button onclick="document.getElementById(\'ram-ckpt-modal\').remove()" style="border:none; background:none; font-size:20px; cursor:pointer;">✕</button></div>' +
            challenges +
            sec('Coverage (the input tray)',
                row('Items / LRUs in the model', p.coverage.items) +
                row('… with a maintenance task', p.coverage.withTask) +
                row('Ledger tasks (incl. derived + MSG-3 pushes)', p.coverage.tasks) +
                row('… with MTTR recorded', p.coverage.withMttr)) +
            sec('FRACAS (the statistical loop)',
                row('Field records', p.fracas.total) +
                row('Verified (LCB clears prediction)', p.fracas.verified) +
                row('Findings (below prediction)', p.fracas.findings, p.fracas.findings > 0) +
                row('Inconclusive — keep accumulating', p.fracas.inconclusive)) +
            sec('Latents & dispatch',
                row('Latent events under inspection', p.latents.total) +
                row('Intervals exceeding not-to-exceed', p.latents.exceeds, p.latents.exceeds > 0) +
                row('Dispatch reliability', p.dispatch.dr != null ? p.dispatch.dr.toFixed(2) + '% over ' + p.dispatch.cycles + ' cycles' : 'no records')) +
            sec('MSG-3 family',
                row('System MSIs analyzed', p.msg3.msis) +
                row('Structural SSIs rated', p.msg3.ssis) +
                row('Zones pushed to ledger', p.msg3.zonesPushed + ' / ' + p.msg3.zones) +
                row('L/HIRF features (acceptance owed)', p.msg3.lhirf + ' (' + p.msg3.lhirfOwed + ' owed)', p.msg3.lhirfOwed > 0)) +
            sec('Feeds the gates',
                row('Tasks with provenance (τ → CCMR, MSG-3, derived)', p.feeds.taus) +
                row('MMEL items on the dispatch analysis', p.feeds.mmel) +
                row('Golden-thread R&M evidence column', p.feeds.evidence)) +
            '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">R&amp;M never hands off — it feeds the gates. The one alarm that matters most here: a field finding on a rate a handed-off tree used. That is service data challenging the certification argument, and it surfaces on this card first.</p>' +
            '</div>';
        div.onclick = e => { if (e.target === div) div.remove(); };
        document.body.appendChild(div);
    };

    // ------------------------------------------- wrap the dashboard render
    (function wrap() {
        if (typeof window.renderProcessStrip === 'function' && !window.renderProcessStrip._ramCkptWrapped) {
            const orig = window.renderProcessStrip;
            const wrapped = function () { const r = orig.apply(this, arguments); try { _injectCard(); } catch (_) {} return r; };
            wrapped._ramCkptWrapped = true;
            window.renderProcessStrip = wrapped;
        }
        // dashboard may already be rendered at load — inject once now
        try { _injectCard(); } catch (_) {}
    })();

    // ------------------------------------------------------------ exports
    window.ramCockpitPosture = ramCockpitPosture;
    window._ramCkptInject = _injectCard;
})();
