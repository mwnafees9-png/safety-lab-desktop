// ============================================================================
// r4761_core.js — v1.0 — R4761 Phases 0+1: if the app produces it, the app
// prints it — and everything it prints carries proof of the machine.
//
// PHASE 1 — THE ASSURANCE ATTESTATION (every report, every time):
//   Every generated report gains a closing section stating the condition of
//   the engine that produced it AT GENERATION TIME: invariant sweep posture
//   (with failing checks NAMED — a report generated over a red sweep says
//   so), engine self-test stamp, journal head (seq + SHA-256 chain head),
//   gate baseline states with their PR ids, signed-disposition ledger
//   counts, and the model schema version. Deterministic in, deliverable
//   out, attestation attached. No competitor's report can testify about
//   its own session; ours can't help it.
//
// PHASE 0 — THE COVERAGE MATRIX (the campaign's referee):
//   A machine-held register of every artifact family the app produces,
//   each mapped to its print path — a report type, a dedicated export, or
//   the evidence package. Artifacts with NO print path are entered as
//   honest GAPs, surfaced on the Document Register (Evidence Package page)
//   and swept by INV-22 (advisory): the sweep itself now nags the campaign
//   to zero. Closing a gap = shipping its print path = the fail disappears.
//
// Born-modular: wraps window.Reports.extractData and appends the attestation
// section to window.Reports.DEFAULT_TEMPLATES (the store the section editor
// and generator read). No monolith edits.
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}; }

    // ===================================================== PHASE 1 — attestation
    function r4761Assurance() {
        const rows = [];
        let summaryBits = [];
        // 1. invariant sweep — run live, name failures
        try {
            if (typeof window.invRun === 'function') {
                const iv = window.invRun();
                const hardFailing = iv.results.filter(r => !r.pass && r.sev === 'hard').map(r => r.id);
                const advFailing = iv.results.filter(r => !r.pass && r.sev !== 'hard').map(r => r.id);
                rows.push({
                    'Assurance item': 'Invariant sweep',
                    'State': iv.hardFails === 0 ? (advFailing.length ? 'PASS with advisories' : 'PASS') : 'HARD FAILURES PRESENT',
                    'Detail': iv.results.length + ' machine checks · ' + iv.hardFails + ' hard failure(s)' +
                        (hardFailing.length ? ' [' + hardFailing.join(', ') + ']' : '') +
                        ' · ' + advFailing.length + ' advisory finding(s)' + (advFailing.length ? ' [' + advFailing.join(', ') + ']' : ''),
                });
                summaryBits.push(iv.hardFails === 0
                    ? 'the full invariant sweep (' + iv.results.length + ' machine checks) passed with no hard failures'
                    : 'the invariant sweep reported ' + iv.hardFails + ' HARD failure(s) — this report was generated over a red sweep and says so');
            }
        } catch (_) { rows.push({ 'Assurance item': 'Invariant sweep', 'State': 'unavailable', 'Detail': 'sweep did not run' }); }
        // 2. engine self-test stamp
        try {
            const st = _pc().engineSelfTest;
            rows.push(st
                ? { 'Assurance item': 'Engine self-test', 'State': st.ok ? 'PASS' : 'FAIL', 'Detail': (st.passed != null ? st.passed + '/' + st.total + ' fixtures · ' : '') + 'run ' + String(st.at || '').slice(0, 19) }
                : { 'Assurance item': 'Engine self-test', 'State': 'not run this project', 'Detail': 'run it from Prove → Golden Thread Integrity for a signed stamp' });
            if (st) summaryBits.push('the computation engine self-test ' + (st.ok ? 'passed on this machine' : 'FAILED'));
        } catch (_) {}
        // 3. journal head
        try {
            const j = (typeof window._jrnlStore === 'function') ? window._jrnlStore() : null;
            const last = j && j.entries && j.entries[j.entries.length - 1];
            rows.push(last
                ? { 'Assurance item': 'Journal (hash chain)', 'State': 'seq ' + last.seq, 'Detail': 'head ' + String(last.h).slice(0, 24) + '… — every signed act since project creation is chained beneath this hash' }
                : { 'Assurance item': 'Journal (hash chain)', 'State': 'empty', 'Detail': 'no journaled acts yet' });
            if (last) summaryBits.push('the tamper-evident journal head is seq ' + last.seq + ' (' + String(last.h).slice(0, 12) + '…)');
        } catch (_) {}
        // 4. gate baselines
        try {
            const gb = _pc().gateBaselines || {};
            const states = Object.keys(gb).map(g => g + ': ' + gb[g].state + (gb[g].prId ? ' (reopened under ' + gb[g].prId + ')' : ''));
            rows.push({ 'Assurance item': 'Gate baselines', 'State': states.length ? states.length + ' gate(s) under control' : 'none baselined', 'Detail': states.join(' · ') || 'no gate has been baselined yet' });
        } catch (_) {}
        // 5. signed-disposition ledgers
        try {
            const n = o => Object.keys(o || {}).length;
            const pc = _pc();
            rows.push({
                'Assurance item': 'Signed dispositions', 'State': (n(pc.spfAccepted) + n(pc.zonalAccepted) + n(pc.ccfIndependence)) + ' on record',
                'Detail': n(pc.spfAccepted) + ' single-failure acceptance(s) · ' + n(pc.zonalAccepted) + ' zonal acceptance(s) · ' + n(pc.ccfIndependence) + ' independence confirmation(s) — each fingerprinted, each reopens on change',
            });
        } catch (_) {}
        // 6. model schema + generation stamp
        try {
            rows.push({ 'Assurance item': 'Model schema', 'State': (window.MBSA_SCHEMA && window.MBSA_SCHEMA.version) || 'n/a', 'Detail': 'schema conformance is itself a hard invariant (INV-16)' });
        } catch (_) {}
        rows.push({ 'Assurance item': 'Generated', 'State': new Date().toISOString().slice(0, 19) + 'Z', 'Detail': 'Safety Lab Aero — deterministic core; identical model state reproduces this document' });

        const summary = 'At the moment this document was generated, ' + (summaryBits.join('; ') || 'assurance state was recorded below') +
            '. The attestation below is produced by the same machinery it describes and can be re-verified by regenerating this report from the project file.';
        return { assurance_summary: summary, assurance_table: rows };
    }

    // wrap extractData — every report's data dictionary gains the tokens
    (function wrapExtract() {
        if (!window.Reports || typeof window.Reports.extractData !== 'function' || window.Reports.extractData._r4761Wrapped) return;
        const orig = window.Reports.extractData;
        const wrapped = function () {
            const data = orig.apply(this, arguments);
            try { Object.assign(data, r4761Assurance()); } catch (_) {
                data.assurance_summary = 'Assurance attestation unavailable (generation-time error).';
                data.assurance_table = [];
            }
            return data;
        };
        wrapped._r4761Wrapped = true;
        window.Reports.extractData = wrapped;
    })();

    // append the section to every built-in template (idempotent)
    const SECTION = [
        '',
        '## Assurance Attestation',
        '{{assurance_summary}}',
        '{{assurance_table}}',
    ].join('\n');
    function _stampTemplates() {
        if (!window.Reports || !window.Reports.DEFAULT_TEMPLATES) return false;
        const T = window.Reports.DEFAULT_TEMPLATES;
        Object.keys(T).forEach(k => {
            if (typeof T[k] === 'string' && T[k].indexOf('Assurance Attestation') < 0) T[k] += '\n' + SECTION;
        });
        return true;
    }
    if (!_stampTemplates()) { let tries = 20; const t = setInterval(() => { if (_stampTemplates() || --tries <= 0) clearInterval(t); }, 300); }

    // ===================================================== PHASE 0 — the matrix
    // Every artifact family the app produces → its print path. 'GAP' entries
    // are the campaign's work queue, swept by INV-22. Honesty over gloss.
    const ARTIFACTS = [
        // assessments — the report family owns them
        { id: 'afha', name: 'Aircraft FHA', via: 'report:AFHA' },
        { id: 'pasa', name: 'PASA (incl. interdependence, MAC model, MF&MS, CoFFE, IP ledger, tailoring)', via: 'report:PASA' },
        { id: 'asa', name: 'ASA (incl. CCMR roll-up, IP verification)', via: 'report:ASA' },
        { id: 'sfha', name: 'System FHA (per system)', via: 'report:SFHA' },
        { id: 'pssa', name: 'PSSA (per system, incl. latent bounds)', via: 'report:PSSA' },
        { id: 'ssa', name: 'SSA (per system, incl. FMES, CCMR, wear-out, IP ledger)', via: 'report:SSA' },
        { id: 'zsa', name: 'Zonal Safety Analysis', via: 'report:ZSA' },
        { id: 'pra', name: 'Particular Risk Analysis', via: 'report:PRA' },
        { id: 'cma', name: 'Common Mode Analysis', via: 'report:CMA' },
        { id: 'gtt', name: 'Golden Thread Trace', via: 'report:GTT' },
        // derived artifacts with report-embedded or dedicated print paths
        { id: 'fta', name: 'Fault trees (allocation + verification)', via: 'report:appendix fta + canvas PDF export' },
        { id: 'fmea', name: 'FMEA (piece-part + model-generated functional)', via: 'export:Excel/PDF + report:SSA (FMES derives)' },
        { id: 'reqs', name: 'Requirements + V&V status (aircraft + system)', via: 'export:ReqIF status-back (M8) + report sections' },
        { id: 'objectives', name: 'ARP4754B Appendix A objectives matrix', via: 'evidence package (§ objectives)' },
        { id: 'evpkg', name: 'Evidence package (invariants, self-test, journal, dispositions)', via: 'export:evidence package' },
        { id: 'mmel', name: 'MMEL / dispatch candidates (P7)', via: 'evidence package (dispatch section)' },
        { id: 'sse', name: 'Safety-significant events (P8)', via: 'export:SSE export' },
        { id: 'journal', name: 'Journal (hash-chained act history)', via: 'evidence package (§ journal) + attestation on every report' },
        // formerly the campaign queue — closed by the REG report (phase 2)
        { id: 'ram-suite', name: 'RAM suite outputs (Weibull, RBD/MC, predictions, LCC, MSG-3, spares)', via: 'report:REG §11' },
        { id: 'assumption-register', name: 'Program-wide assumption register (A1 moat view)', via: 'report:REG §2' },
        { id: 'disposition-register', name: 'Standalone disposition register (SPF / zonal / CCF, printable)', via: 'report:REG §3' },
        { id: 'pr-register', name: 'Problem report / OPR register', via: 'report:REG §4' },
        { id: 'baseline-register', name: 'Baseline & lock register with PR trail (delta report lands with L4)', via: 'report:REG §5' },
        { id: 'alias-register', name: 'Alias register (signed cross-tool identities)', via: 'report:REG §6' },
        { id: 'rename-log', name: 'Rename / identity change log (Q4)', via: 'report:REG §7' },
        { id: 'trade-studies', name: 'Trade-study sandbox trees + dispositions', via: 'report:REG §8' },
        { id: 'mac-standalone', name: 'MAC model standalone report (rules, lanes, modes, compile proofs)', via: 'report:REG §9' },
        { id: 'cca-models', name: 'ZSA zone models / PRA threat models (computed consequence)', via: 'report:REG §10' },
        // C-series lanes (each prints the day it ships — the doctrine holds)
        { id: 'do-credit', name: 'DO-178C / DO-254 development-assurance credit grid', via: 'report:REG §11a' },
        { id: 'do160', name: 'DO-160 environmental qualification ledger + PRA reconcile', via: 'report:REG §11b' },
        { id: 'ewis', name: 'EWIS separation findings (25.1709 co-routing lane)', via: 'report:REG §11c' },
        { id: 'eta', name: 'Event tree analyses (sequence-consequence outcomes)', via: 'report:REG §11d' },
    ];
    function r4761Coverage() {
        const gaps = ARTIFACTS.filter(a => a.via === 'GAP');
        return { artifacts: ARTIFACTS, total: ARTIFACTS.length, printable: ARTIFACTS.length - gaps.length, gaps };
    }

    // INV-22 — the sweep drives the campaign to zero
    (function register() {
        function reg() {
            if (typeof window.invRegister !== 'function') return false;
            window.invRegister({
                id: 'INV-22', name: 'Every artifact the app produces has a print path (R4761 coverage)', sev: 'advisory',
                run: () => {
                    const c = r4761Coverage();
                    return { checked: c.total, fails: c.gaps.map(g => 'No print path yet: ' + g.name) };
                }
            });
            return true;
        }
        if (!reg()) { let tries = 20; const t = setInterval(() => { if (reg() || --tries <= 0) clearInterval(t); }, 300); }
    })();

    // ------------------------------------------------ the Document Register
    function _renderRegister() {
        const view = document.getElementById('view-evpkg');
        if (!view) return;
        let div = document.getElementById('doc-register-panel');
        if (!div) {
            div = document.createElement('div');
            div.id = 'doc-register-panel';
            const header = view.querySelector('.header-with-export');
            if (header && header.nextSibling) view.insertBefore(div, header.nextSibling);
            else view.insertBefore(div, view.firstChild);
        }
        const c = r4761Coverage();
        div.innerHTML =
            '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); padding:10px 14px; margin:0 0 14px;">' +
            '<div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">' +
            '<b style="font-size:12.5px;">Document register — if the app produces it, the app prints it</b>' +
            '<span style="font-size:11.5px; color:var(--color-text-secondary);">' + c.printable + ' of ' + c.total + ' artifact families have a print path · ' + c.gaps.length + ' named gap(s), swept by INV-22</span></div>' +
            '<table class="data-table" style="width:100%; font-size:12px; margin-top:8px;"><thead><tr><th>Artifact family</th><th>Prints via</th></tr></thead><tbody>' +
            c.artifacts.map(a => '<tr><td>' + _esc(a.name) + '</td><td class="u-mono" style="font-size:11px;' + (a.via === 'GAP' ? ' color:var(--color-danger); font-weight:700;' : '') + '">' + _esc(a.via === 'GAP' ? 'GAP — queued in the R4761 campaign' : a.via) + '</td></tr>').join('') +
            '</tbody></table>' +
            '<div style="font-size:11px; color:var(--color-text-tertiary); margin-top:6px;">Every report generated from this project now closes with an <b>Assurance Attestation</b>: sweep posture, engine self-test, journal head, gate states, signed-disposition counts — the document testifies about the machine that produced it.</div></div>';
    }
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._r4761Wrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try { if (tabId === 'evpkg') _renderRegister(); } catch (_) {}
            return r;
        };
        wrapped._r4761Wrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------- exports
    window.r4761Assurance = r4761Assurance;
    window.r4761Coverage = r4761Coverage;
    window._r4761RenderRegister = _renderRegister;
})();
