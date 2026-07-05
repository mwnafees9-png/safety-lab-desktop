// ============================================================================
// sse_export.js — Phase P8 (gap M14): the safety-significant events list for
// in-service monitoring, in the spirit of ARP4754B/4761A §8 continued
// airworthiness support.
//
// Certification freezes an argument; service life tests it. This module
// compiles, deterministically, the list of events the operator and the
// continued-airworthiness process must WATCH, each row carrying what to
// monitor, why, and the quantitative expectation the safety case staked:
//
//   1. Severe failure conditions (Cat/Haz, aircraft + system) — occurrence
//      monitoring against the certified probability target and, where a
//      linked tree exists, the computed rate the argument achieved.
//   2. Latent failures from the CCMR sweep — the inspection is the ONLY
//      thing holding the dormancy assumption; finding rates at inspection
//      validate (or break) the assumed failure rate.
//   3. MMEL dispatch items — deferral frequency and duration vs the
//      exposure the dispatch analysis assumed.
//   4. Operational/exposure assumptions — every open or ops-validated
//      assumption whose truth is only observable in service.
//   5. FRACAS findings — components whose field MTBF sits below prediction;
//      already under statistical watch, listed so the loop is closed.
//
// Export: CSV download + evidence-package section. One auto item lands on
// the ASA checklist (the as-operated assessment owns in-service monitoring).
// Born modular: classic script, zero monolith edits, no stored state.
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const _sci = v => (v == null || !(v > 0)) ? '—' : Number(v).toExponential(2);

    function sseRows() {
        const rows = [];
        const push = (kind, id, event, monitor, expectation, source) =>
            rows.push({ kind, id, event, monitor, expectation, source });

        // ---- 1. severe failure conditions --------------------------------
        const tExp = (typeof ftaConfig === 'object' && ftaConfig && ftaConfig.exposureTime) || 1;
        const target = sev => { try { const t = typeof getSafetyTarget === 'function' ? getSafetyTarget(sev) : null; return t && t.prob > 0 ? t.prob : null; } catch (_) { return null; } };
        const linkedProb = iid => {
            try {
                const pg = ((typeof ftaPages !== 'undefined' && ftaPages) || []).find(p =>
                    p.root && String(p.linkedFhaId) === String(iid) && p.treeLevel !== 'system');
                return pg && pg.root && (pg.root.probability > 0) ? pg.root.probability : null;
            } catch (_) { return null; }
        };
        ((typeof acFhaData !== 'undefined' && acFhaData) || []).forEach(f => {
            if (f.severity !== 'Catastrophic' && f.severity !== 'Hazardous') return;
            const t = target(f.severity), p = linkedProb(f.internalId);
            push('condition', f.fcId, f.fcDesc || f.fcId,
                'occurrence of the condition (or precursors) in service',
                'certified ≤ ' + _sci(t) + '/FH' + (p ? ' · argued ' + _sci(p / tExp) + '/FH' : ''),
                'AC FHA · ' + f.severity);
        });
        ((typeof systemsData !== 'undefined' && systemsData) || []).forEach(s => (s.fha || []).forEach(f => {
            if (f.severity !== 'Catastrophic' && f.severity !== 'Hazardous') return;
            if (f.acTrace) return;   // already represented by its aircraft parent
            push('condition', f.fcId, f.fcDesc || f.fcId,
                'occurrence of the condition in service',
                'severity ' + f.severity + ' (system-level, untraced)',
                (s.name || s.id) + ' SFHA');
        }));

        // ---- 2. latent failures under inspection --------------------------
        try {
            if (typeof ccmrLatentSweep === 'function') ccmrLatentSweep(true).forEach(r => {
                push('latent', r.event || 'latent', (r.name || r.event || 'latent event') + (r.fcId ? ' — under ' + r.fcId : ''),
                    'finding rate at the assigned inspection' + (r.interval ? ' (interval ' + r.interval + ' FH' + (r.nte != null && isFinite(r.nte) ? ', NTE ' + Math.round(r.nte) + ' FH' : '') + ')' : ''),
                    'assumed λ = ' + _sci(r.lambda) + '/FH — inspection findings validate the rate' + (r.exceeds ? ' · EXCEEDS not-to-exceed' : ''),
                    'CCMR · ' + (r.system || 'Aircraft'));
            });
        } catch (_) {}

        // ---- 3. MMEL dispatch items ---------------------------------------
        try {
            const mmel = (typeof projectConfig !== 'undefined' && projectConfig.mmel && projectConfig.mmel.items) || [];
            mmel.forEach(m => {
                if (m.state === 'rejected') return;
                push('dispatch', m.id || m.item, (m.item || m.id) + ' inoperative',
                    'deferral frequency and open-deferral duration vs category ' + (m.category || '—'),
                    (m.tldMaxFH ? 'TLD budget ' + Math.round(m.tldMaxFH) + ' FH/aircraft/yr' : 'per dispatch analysis'),
                    'MMEL/TLD');
            });
        } catch (_) {}

        // ---- 4. operational / exposure assumptions ------------------------
        const asmRows = [];
        ((typeof acAssumptionsData !== 'undefined' && acAssumptionsData) || []).forEach(a => asmRows.push({ a, scope: 'Aircraft' }));
        ((typeof systemsData !== 'undefined' && systemsData) || []).forEach(s => (s.asm || []).forEach(a => asmRows.push({ a, scope: s.name || s.id })));
        asmRows.forEach(({ a, scope }) => {
            const ops = /ops|operat|exposure|fleet|service|AFM|route/i.test((a.valStrategy || '') + ' ' + (a.routeTo || ''));
            const open = (a.state || 'proposed') !== 'Validated' && (a.state || '') !== 'validated';
            if (!ops && !open) return;
            push('assumption', a.asmId || 'ASM', a.text,
                'continued validity in service' + (ops ? ' (operationally validated)' : ' (still open at certification)'),
                a.valStrategy || 'validation strategy unrecorded',
                scope + ' assumptions');
        });

        // ---- 5. FRACAS findings -------------------------------------------
        try {
            if (typeof window.ramFieldRows === 'function') window.ramFieldRows().forEach(x => {
                if (x.verdict !== 'finding') return;
                push('fracas', (x.f && (x.f.beRef || x.f.id)) || 'field', ((x.hit && x.hit.node && x.hit.node.name) || x.f.beRef || 'component') + ' — field MTBF below prediction',
                    'continued field-hour accumulation + corrective-action closure',
                    'predicted ' + Math.round(x.predicted || 0) + ' h · observed ' + (x.point ? Math.round(x.point) : '—') + ' h',
                    'FRACAS');
            });
        } catch (_) {}

        return rows;
    }

    // ------------------------------------------------------------- export
    function sseCsv() {
        const rows = sseRows();
        const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
        const head = ['Kind', 'ID', 'Event', 'What to monitor', 'Expectation staked by the safety case', 'Source'];
        return [head.map(q).join(',')].concat(rows.map(r =>
            [r.kind, r.id, r.event, r.monitor, r.expectation, r.source].map(q).join(','))).join('\n');
    }

    function sseDownload() {
        try {
            const name = ((typeof projectName !== 'undefined' && projectName) || 'project').replace(/[^\w-]+/g, '_');
            const blob = new Blob(['﻿' + sseCsv()], { type: 'text/csv;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = name + '_safety_significant_events.csv';
            document.body.appendChild(a); a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
        } catch (e) { alert('Export failed: ' + e.message); }
    }

    // ---------------------------------------------------------------- page
    const _KIND_STYLE = { condition: ['#8E2A2A', 'rgba(255,59,48,0.10)'], latent: ['#9A6200', 'rgba(255,149,0,0.11)'],
        dispatch: ['#0A63CC', 'rgba(10,99,204,0.10)'], assumption: ['#7c3aed', 'rgba(124,58,237,0.10)'], fracas: ['#4A6741', 'rgba(74,103,65,0.12)'] };

    function renderSsePage() {
        const host = document.getElementById('sse-host');
        if (!host) return;
        const rows = sseRows();
        const byKind = {};
        rows.forEach(r => { byKind[r.kind] = (byKind[r.kind] || 0) + 1; });

        let html = '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">' +
            '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
            Object.keys(_KIND_STYLE).map(k => {
                const [fg, bg] = _KIND_STYLE[k];
                return '<span class="u-mono" style="font-size:11px; padding:3px 10px; border-radius:var(--r-full); color:' + fg + '; background:' + bg + ';">' + k + ' ' + (byKind[k] || 0) + '</span>';
            }).join('') + '</div>' +
            '<button class="btn-cyan" style="font-size:12.5px; padding:7px 14px;" onclick="sseDownload()">⇩ Export CSV</button></div>';

        if (!rows.length) {
            html += '<p style="color:var(--color-text-tertiary); font-size:13px;">Nothing to monitor yet — the list populates from severe FCs, CCMR latents, MMEL items, open assumptions, and FRACAS findings.</p>';
        } else {
            html += '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr><th>Kind</th><th>ID</th><th>Event</th><th>What to monitor</th><th>Expectation staked</th><th>Source</th></tr></thead><tbody>' +
                rows.map(r => {
                    const [fg, bg] = _KIND_STYLE[r.kind] || ['var(--color-text-secondary)', 'var(--color-surface-2)'];
                    return '<tr><td><span style="display:inline-block; padding:2px 8px; font-size:10px; font-weight:600; text-transform:uppercase; border-radius:var(--r-full); color:' + fg + '; background:' + bg + ';">' + r.kind + '</span></td>' +
                        '<td class="u-mono" style="font-size:11px;">' + _esc(r.id) + '</td>' +
                        '<td style="max-width:280px;">' + _esc(r.event) + '</td>' +
                        '<td style="font-size:11.5px; color:var(--color-text-secondary);">' + _esc(r.monitor) + '</td>' +
                        '<td class="u-mono" style="font-size:10.5px;">' + _esc(r.expectation) + '</td>' +
                        '<td style="font-size:11px; color:var(--color-text-tertiary);">' + _esc(r.source) + '</td></tr>';
                }).join('') + '</tbody></table>';
        }
        html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">Every row is derived live from the model — severe conditions carry the target the certification staked, latents carry the λ the inspection must validate, ' +
            'dispatch items carry the TLD budget, assumptions carry their validation strategy, FRACAS findings carry the prediction under challenge. The safety case does not end at certification; this is its watch list.</p>';
        host.innerHTML = html;
    }

    // ----------------------------------------- runtime graft: the ASA gate
    (function graftGate() {
        try {
            if (typeof CKPT_CHECKLISTS === 'undefined' || !Array.isArray(CKPT_CHECKLISTS.ASA)) return;
            if (CKPT_CHECKLISTS.ASA.some(i => i.id === 'sse')) return;
            CKPT_CHECKLISTS.ASA.push({
                id: 'sse', kind: 'auto', ref: '§8',
                label: 'In-service monitoring list covers every severe condition',
                eval: () => {
                    const rows = sseRows();
                    const conds = rows.filter(r => r.kind === 'condition').length;
                    const severe = ((typeof acFhaData !== 'undefined' && acFhaData) || []).filter(f => f.severity === 'Catastrophic' || f.severity === 'Hazardous').length;
                    return { pass: severe > 0 && conds >= severe,
                        detail: conds + ' condition(s) on the watch list · ' + rows.length + ' rows total' };
                },
            });
        } catch (_) {}
    })();

    // ------------------------------------------------- navigation wrapper
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._sseWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-sse');
                if (v) v.style.display = (tabId === 'sse') ? 'block' : 'none';
                const s = document.getElementById('snav-sse');
                if (s) s.classList.toggle('snav-active', tabId === 'sse');
                if (tabId === 'sse') renderSsePage();
            } catch (_) {}
            return r;
        };
        wrapped._sseWrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------ exports
    window.sseRows = sseRows;
    window.sseCsv = sseCsv;
    window.sseDownload = sseDownload;
    window.renderSsePage = renderSsePage;
})();
