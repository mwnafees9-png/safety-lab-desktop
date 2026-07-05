// ============================================================================
// r4761_registers.js — v1.0 — R4761 Phases 2+3: the last ten gaps close, and
// released means released.
//
// PHASE 2 — ONE REPORT, TEN REGISTERS:
//   New report type 'REG' — "Program Registers & Ledgers" — added to the E1
//   family through the same window.Reports registry the section editor and
//   generators already read. Ten sections, one per formerly-unprintable
//   artifact family: assumptions, signed dispositions, problem reports,
//   baselines & locks, aliases, rename log, trade studies, the MAC model
//   itself, the CCA computed models, and the RAM suite. Every row is read
//   live from the same stores the engines compute against — the register
//   IS the model, printed. Plus: the GTT template joins the window store,
//   so the Golden Thread report finally carries the Assurance Attestation.
//
// PHASE 3 — RELEASED = LOCKED:
//   Every report's attestation gains a RELEASE STATE row derived from the
//   gate baselines (lock_enforce): a report for a baselined gate prints as
//   RELEASED (locked; reopen only via Problem Report); a reopened gate
//   prints the PR id it is open under; everything else is a WORKING COPY.
//   The document's release standing is computed, never asserted.
//
// With this module loaded, INV-22 (artifact→print coverage) sweeps to zero:
// if the app produces it, the app prints it. Campaign closed.
// ============================================================================
(function () {
    'use strict';

    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}; }
    function _sysName(id) {
        const s = ((typeof systemsData !== 'undefined' ? systemsData : []) || []).find(x => x && x.id === id);
        return s ? (s.name || s.id) : (id || '');
    }
    function _d(v) { return v ? String(v).slice(0, 10) : ''; }
    function _safe(fn, fb) { try { return fn(); } catch (_) { return fb; } }

    // ===================================================== register builders
    function regAssumptions() {
        const rows = [];
        _safe(() => window.asmAll(), []).forEach(a => {
            let used = 0;
            try { used = (window.asmWhereUsed(a).length || 0); } catch (_) {}
            rows.push({
                'ID': a.asmId || '', 'Scope': a.scope || (a.systemId ? _sysName(a.systemId) : 'aircraft'),
                'Statement': (a.text || a.statement || '').slice(0, 160),
                'State': a.state || '', 'Load-bearing uses': used,
            });
        });
        return rows;
    }

    function regDispositions() {
        const rows = [];
        _safe(() => window.mcSpfList(), []).forEach(s => rows.push({
            'Kind': 'Single-failure', 'Subject': s.name || s.key, 'State': s.state || 'open',
            'Signed by': (s.rec && s.rec.by) || '', 'Date': _d(s.rec && s.rec.at),
            'Basis': ((s.rec && s.rec.basis) || '').slice(0, 120),
        }));
        _safe(() => window.fsZonalFindings(), []).forEach(z => rows.push({
            'Kind': 'Zonal', 'Subject': z.zone + ' → ' + z.fcId, 'State': z.state || 'open',
            'Signed by': (z.rec && z.rec.by) || '', 'Date': _d(z.rec && z.rec.at),
            'Basis': ((z.rec && z.rec.basis) || '').slice(0, 120),
        }));
        _safe(() => window.ccfPairs(), []).forEach(p => rows.push({
            'Kind': 'CCF independence', 'Subject': (p.a.name || '') + ' / ' + (p.b.name || ''), 'State': p.state,
            'Signed by': (p.rec && p.rec.by) || '', 'Date': _d(p.rec && p.rec.at),
            'Basis': p.state === 'bucketed' ? ('CCF group "' + p.group + '" β=' + p.beta) : ((p.rec && p.rec.note) || '').slice(0, 120),
        }));
        return rows;
    }

    function regProblemReports() {
        return _safe(() => window.prRows(), []).map(p => ({
            'PR': p.prId || p.id || '', 'Title': (p.title || p.summary || '').slice(0, 90),
            'State': p.state || '', 'Safety-related': p.safetyRelated ? 'yes' : 'no',
            'Raised by': p.by || p.raisedBy || '', 'Date': _d(p.at || p.openedAt),
        }));
    }

    function regBaselines() {
        const rows = [];
        const bl = _pc().gateBaselines || {};
        Object.keys(bl).forEach(g => rows.push({
            'Item': 'Gate baseline — ' + g, 'State': bl[g].state,
            'By': bl[g].by || '', 'Date': _d(bl[g].at),
            'PR': bl[g].prId || '—',
        }));
        // workspace user locks
        _safe(() => {
            ((typeof systemsData !== 'undefined' ? systemsData : []) || []).forEach(s => {
                if (s.lock) rows.push({ 'Item': 'Workspace lock — ' + (s.name || s.id), 'State': 'locked', 'By': s.lock.by || '', 'Date': _d(s.lock.at), 'PR': '—' });
            });
            const ac = _pc().acWorkspace;
            if (ac && ac.lock) rows.push({ 'Item': 'Workspace lock — aircraft', 'State': 'locked', 'By': ac.lock.by || '', 'Date': _d(ac.lock.at), 'PR': '—' });
        }, null);
        // L5 — break-glass takeovers are never silent: they print here
        (_pc().lockTakeovers || []).forEach(t => rows.push({
            'Item': 'BREAK-GLASS takeover — ' + (t.area || t.scope), 'State': 'custody transferred',
            'By': (t.fromName || t.from || '?') + ' → ' + (t.toName || t.to || '?') + ' (' + (t.reason || '').slice(0, 60) + ')',
            'Date': _d(t.at), 'PR': '—',
        }));
        return rows;
    }

    function regAliases() {
        const rows = [];
        (((typeof systemsData !== 'undefined' ? systemsData : []) || [])).forEach(s => {
            (s.aliases || []).forEach(a => rows.push({
                'System': s.name || s.id, 'Alias': a.t, 'Signed by': a.by || '', 'Date': _d(a.at),
            }));
        });
        return rows;
    }

    function regRenameLog() {
        return (_pc().renameLog || []).map(r => ({
            'Kind': r.kind || '', 'From': (r.from || '').slice(0, 60), 'To': (r.to || '').slice(0, 60),
            'By': r.by || '', 'Date': _d(r.at),
        }));
    }

    function regTradeStudies() {
        const rows = [];
        (((typeof ftaPages !== 'undefined' ? ftaPages : []) || [])).forEach(p => {
            if (!p || p.treeLevel !== 'standalone') return;
            rows.push({
                'Trade tree': p.name || p.id, 'System': _sysName(p.systemId),
                'Linked FC': Array.isArray(p.linkedFhaIds) ? p.linkedFhaIds.join(', ') : (p.linkedFhaId || ''),
                'Status': 'sandbox — outside certification roll-up (promotable)',
            });
        });
        // signed route dispositions stamped on FCs by the 1309 flow
        (((typeof systemsData !== 'undefined' ? systemsData : []) || [])).forEach(s => {
            (s.fha || []).forEach(f => {
                if (f && /route accepted per the 1309 chart/.test(f.comments || ''))
                    rows.push({ 'Trade tree': '(disposition) ' + (f.fcId || ''), 'System': s.name || s.id, 'Linked FC': f.fcId || '', 'Status': (f.comments || '').split('·').pop().trim().slice(0, 110) });
            });
        });
        return rows;
    }

    function regMacModel() {
        const rows = [];
        (_pc().macModels || []).forEach(r => {
            if (!r) return;
            let compile = '';
            try { compile = (typeof macTreeStatus === 'function') ? macTreeStatus(r) : ''; } catch (_) {}
            let eq = [];
            _safe(() => window.l3EquivalenceAll(), []).forEach(e => { if (e.rule === r.id && !e.empty) eq.push(e.lane + (e.agree ? ' ✓' : ' ✗')); });
            _safe(() => { const m = window.m2Equivalence(r); if (m && !m.empty) eq.push('modes ' + (m.agree ? '✓' : '✗')); }, null);
            rows.push({
                'Rule': r.id, 'Function': r.subId, 'Level': 'L' + (r.level || 0),
                'Lanes': (r.lanes || ['loss']).join(', '),
                'Flows': (r.flows || []).length, 'Modes': (r.modes || []).length,
                'Compile': compile, 'Engine agreement': eq.join(' · ') || 'loss-lane arithmetic',
                'Substantiation': (r.substantiation && r.substantiation.kind) || '',
            });
        });
        return rows;
    }

    function regCcaModels() {
        const rows = [];
        _safe(() => {
            (((typeof zsaData !== 'undefined' ? zsaData : []) || [])).forEach(z => {
                const m = window.zsaZoneModel(z.zoneId);
                if (!m) return;
                rows.push({
                    'Model': 'ZSA — ' + z.zoneId, 'Computed worst': m.computedWorst || '—',
                    'Elicited': z.severity || '—', 'Reconcile': m.reconcile || '',
                    'Findings': (m.findings || []).length,
                });
            });
        }, null);
        _safe(() => {
            (((typeof praData !== 'undefined' ? praData : []) || [])).forEach(p => {
                const m = window.praDynamicModel(p.praId || p.internalId);
                if (!m) return;
                rows.push({
                    'Model': 'PRA — ' + (p.threat || p.praId), 'Computed worst': (m.tripped && m.tripped[0] && m.tripped[0].severity) || '—',
                    'Elicited': p.csfl || '—', 'Reconcile': m.retained ? 'retained via signed acceptance' : (m.tripped && m.tripped.length ? 'UNRETAINED Cat trip' : 'no trip'),
                    'Findings': (m.tripped || []).length,
                });
            });
        }, null);
        return rows;
    }

    function regRamSuite() {
        const rows = [];
        const pc = _pc();
        const add = (name, n, note) => rows.push({ 'Suite output': name, 'Rows': n, 'Note': note });
        _safe(() => { const r = pc.ram || {}; add('Derived maintenance tasks', (r.tasks || []).length, 'F9 deterministic derivation'); add('Derived spares', (r.spares || []).length, 'fleet + utilization driven'); add('Reliability allocation', (r.alloc || []).length, 'top-down from safety targets'); }, null);
        _safe(() => add('MSG-3 analyses', ((pc.msg3 || {}).rows || (pc.msg3 || {}).tasks || []).length, 'systems + structures + zonal + L/HIRF'), null);
        _safe(() => add('MMEL / dispatch items', ((pc.mmel || {}).items || []).length, 'BDD residual-proven (MC-03)'), null);
        _safe(() => add('RBD Monte Carlo scenarios', ((pc.rbdMc || {}).scenarios || (pc.rbdMc || {}).list || []).length, 'seeded — reproducible by seed'), null);
        _safe(() => { const ev = window.ramThreadEvidence ? window.ramThreadEvidence() : null; if (ev && ev.length != null) add('RAM thread evidence rows', ev.length, 'traceability-matrix RAM chains'); }, null);
        return rows;
    }

    // ===================================================== the REG report
    const REG_TEMPLATE = [
        '# Program Registers & Ledgers',
        '**Project:** {{project_name}}  ',
        '**Aircraft:** {{aircraft_name}}  ',
        '**Certification Basis:** {{cert_basis}}  ',
        '**Date:** {{date}}',
        '',
        '## 1. Purpose',
        'This report prints every program-level register and ledger the workspace maintains: the machine-held records that certification reviews ask for and single-analysis reports do not carry. Every row is read live from the project model at generation time — the register is the model, printed.',
        '',
        '## 2. Assumption register (program-wide)',
        'Every assumption with its validation state and its load-bearing use count (where-used across analyses, dispositions and model rules).',
        '{{reg_assumptions}}',
        '',
        '## 3. Signed disposition register',
        'Single-failure acceptances, zonal acceptances, and CCF independence confirmations — each signed, dated, fingerprinted, and reopened automatically when its subject changes.',
        '{{reg_dispositions}}',
        '',
        '## 4. Problem report register',
        '{{reg_pr}}',
        '',
        '## 5. Baseline & lock register',
        'Gate baselines with their reopening PRs, and active workspace locks.',
        '{{reg_baselines}}',
        '',
        '## 6. Alias register',
        'Signed cross-tool identities (Jama / Cameo / ATA shorthand → system). User-entered and signed only; nothing derived.',
        '{{reg_alias}}',
        '',
        '## 7. Rename / identity change log',
        '{{reg_rename}}',
        '',
        '## 8. Trade-study register',
        'Sandbox trade trees (outside certification roll-up) and signed 1309-chart route dispositions.',
        '{{reg_trades}}',
        '',
        '## 9. MAC model report',
        'Every survival rule with its lanes, flows, modes, compile state and engine-agreement posture. Model schema conformance is itself a hard invariant (INV-16).',
        '{{reg_mac}}',
        '',
        '## 10. CCA computed models',
        'Zone models and dynamic threat models: computed consequence vs elicited severity, reconciliation state, retention.',
        '{{reg_cca}}',
        '',
        '## 11. RAM suite outputs',
        '{{reg_ram}}',
        '',
        '## Assurance Attestation',
        '{{assurance_summary}}',
        '{{assurance_table}}',
    ].join('\n');

    // v1 GTT template lives in a closure the window store never received —
    // add it here (with the attestation) so the Golden Thread report joins
    // the family and finally testifies about its own session.
    const GTT_TEMPLATE = [
        '# Golden Thread Trace Report',
        '**Project:** {{project_name}}  ',
        '**Aircraft:** {{aircraft_name}}  ',
        '**Scope:** {{gt_scope}}  ',
        '**Certification Basis:** {{cert_basis}}  ',
        '**Date:** {{date}}',
        '',
        '## 1. Purpose',
        'This report lays out the golden thread for {{gt_scope}} — tracing each failure condition from its aircraft function and system, through the fault tree, the common-cause analyses that test its independence, the derived safety requirement, and its verification.',
        '',
        '## 2. Trace matrix',
        '{{goldenthread_table}}',
        '',
        '## 3. Open items',
        '{{goldenthread_gaps}}',
        '',
        '## Assurance Attestation',
        '{{assurance_summary}}',
        '{{assurance_table}}',
    ].join('\n');

    function _install() {
        if (!window.Reports || !window.Reports.REPORT_DEFS) return false;
        const defs = window.Reports.REPORT_DEFS;
        if (!defs.REG) defs.REG = { name: 'Program Registers & Ledgers', scope: 'aircraft', allowedAppendices: [] };
        if (window.Reports.DEFAULT_TEMPLATES) {
            if (!window.Reports.DEFAULT_TEMPLATES.REG) window.Reports.DEFAULT_TEMPLATES.REG = REG_TEMPLATE;
            if (!window.Reports.DEFAULT_TEMPLATES.GTT) window.Reports.DEFAULT_TEMPLATES.GTT = GTT_TEMPLATE;
        }
        return true;
    }
    if (!_install()) { let tries = 20; const t = setInterval(() => { if (_install() || --tries <= 0) clearInterval(t); }, 300); }

    // ============================== extractData wrap: REG data + release state
    const GATE_FOR = { AFHA: 'AFHA', PASA: 'PASA', ASA: 'ASA', SFHA: 'SFHA', PSSA: 'PSSA', SSA: 'SSA' };
    function _releaseRow(reportType) {
        const gate = GATE_FOR[reportType];
        if (!gate) return { 'Assurance item': 'Release state', 'State': 'WORKING COPY', 'Detail': 'This report type is not gate-controlled; it reflects the live model at generation time.' };
        const bl = (_pc().gateBaselines || {})[gate];
        if (!bl) return { 'Assurance item': 'Release state', 'State': 'WORKING COPY', 'Detail': gate + ' has not been baselined — content may change without a Problem Report.' };
        if (bl.state === 'locked') return { 'Assurance item': 'Release state', 'State': 'RELEASED', 'Detail': gate + ' baselined by ' + (bl.by || '?') + ' on ' + _d(bl.at) + ' — locked; content can change only through a Problem Report reopen.' };
        return { 'Assurance item': 'Release state', 'State': 'REOPENED under ' + (bl.prId || 'PR'), 'Detail': gate + ' baseline reopened — WORKING COPY until re-baselined; changes are being tracked under ' + (bl.prId || 'a Problem Report') + '.' };
    }

    (function wrapExtract() {
        if (!window.Reports || typeof window.Reports.extractData !== 'function' || window.Reports.extractData._regWrapped) return;
        const orig = window.Reports.extractData;
        const wrapped = function (reportType, opts) {
            if (reportType === 'REG') {
                _install();
                const a = _safe(() => window.r4761Assurance(), { assurance_summary: '', assurance_table: [] });
                return {
                    project_name: _safe(() => projectName, 'Project'), aircraft_name: _safe(() => projectName, 'Aircraft'),
                    cert_basis: '', date: new Date().toISOString().slice(0, 10),
                    reg_assumptions: regAssumptions(), reg_dispositions: regDispositions(),
                    reg_pr: regProblemReports(), reg_baselines: regBaselines(),
                    reg_alias: regAliases(), reg_rename: regRenameLog(),
                    reg_trades: regTradeStudies(), reg_mac: regMacModel(),
                    reg_cca: regCcaModels(), reg_ram: regRamSuite(),
                    assurance_summary: a.assurance_summary, assurance_table: a.assurance_table,
                };
            }
            const data = orig.apply(this, arguments);
            try { if (Array.isArray(data.assurance_table)) data.assurance_table.unshift(_releaseRow(reportType)); } catch (_) {}
            return data;
        };
        wrapped._regWrapped = true;
        window.Reports.extractData = wrapped;
    })();

    // ------------------------------------------------ UI: generate from evpkg
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._regWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                if (tabId === 'evpkg') {
                    const panel = document.getElementById('doc-register-panel');
                    if (panel && !document.getElementById('reg-gen-btn')) {
                        const btn = document.createElement('button');
                        btn.id = 'reg-gen-btn';
                        btn.className = 'ckpt-m-btn ckpt-m-btn-primary';
                        btn.style.cssText = 'font-size:11.5px; padding:3px 12px; margin:0 14px 10px;';
                        btn.textContent = 'Generate Registers & Ledgers report…';
                        btn.onclick = function () { try { window.Reports.open('REG'); } catch (_) {} };
                        panel.firstChild && panel.firstChild.appendChild
                            ? panel.firstChild.appendChild(btn) : panel.appendChild(btn);
                    }
                }
            } catch (_) {}
            return r;
        };
        wrapped._regWrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------- exports
    window.r4761Registers = {
        assumptions: regAssumptions, dispositions: regDispositions, problemReports: regProblemReports,
        baselines: regBaselines, aliases: regAliases, renameLog: regRenameLog,
        trades: regTradeStudies, mac: regMacModel, cca: regCcaModels, ram: regRamSuite,
        releaseRow: _releaseRow,
    };
})();
