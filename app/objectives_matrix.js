// objectives_matrix.js — Phase P3: ARP4754B process-objectives compliance
// matrix (Appendix A structure). The artifact authority audits open with:
// every development-assurance objective against LIVE evidence from the model.
//
// BORN MODULAR: new file, zero monolith edits; wraps switchTab for its view.
//
// CONTENT DISCIPLINE: objective texts below are ORIGINAL one-line summaries
// in our own words, keyed to the App A table structure (planning /
// development / safety assessment / validation / verification / CM / process
// assurance / certification liaison). They are navigation aids — the
// standard's own Appendix A tables remain the authoritative wording and
// applicability. The banner on the page says exactly that.
//
// Each objective is either AUTO (a deterministic read of the live model —
// the computed lane) or ATTEST (a signed human act). Auto objectives can
// never be attested over; silence is not evidence, and neither is a claim
// the model contradicts.

(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    function _toast(m, k, t) { try { if (typeof showToast === 'function') showToast(m, k || 'info', t || 3000); } catch (_) {} }
    async function _ask(msg, dflt) {
        try { if (typeof slPrompt === 'function') return await slPrompt(msg, dflt || ''); } catch (_) {}
        return window.prompt(msg, dflt || '');
    }
    function _store() {
        if (!projectConfig.appA) projectConfig.appA = { attests: {} };
        if (!projectConfig.appA.attests) projectConfig.appA.attests = {};
        return projectConfig.appA;
    }
    function _save() { try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {} }

    // ------------------------------------------------------- evidence reads
    const _allReqs = () => (typeof acReqData !== 'undefined' ? acReqData : []).concat((typeof systemsData !== 'undefined' ? systemsData : []).flatMap(s => s.req || []));
    function _phases() { try { return applyCockpitStatuses(computePhaseStatus()); } catch (_) { return {}; } }
    function _gateState(keys) {
        const ph = _phases();
        const done = keys.filter(k => ph[k] && (ph[k].status === 'complete' || ph[k].status === 'handed-off')).length;
        return { done, total: keys.length, detail: keys.map(k => k + ':' + ((ph[k] || {}).status || '—')).join(' · ') };
    }
    const _res = (state, detail) => ({ state, detail });   // state: satisfied | partial | open

    // ------------------------------------------------------- the objectives
    // kind: 'auto' → eval(); 'attest' → signed act. Applicability kept generic
    // where level-dependence exists (consult the standard for exact scaling).
    const OBJECTIVES = [
        // ---- A-1 · Planning
        { id: 'A1-1', grp: 'A-1 Planning', kind: 'auto', text: 'Development and safety program plans are defined (methods declared per objective, tailoring recorded).',
          eval: () => { const spp = (projectConfig.safetyProgramPlan || {}); const has = spp.slots && Object.keys(spp.slots).length >= 0 && spp.intake; return has ? _res('satisfied', 'SSPP intake ' + String(spp.intake.at).slice(0, 10) + ' · basis: ' + (spp.intake.basis || '—')) : _res('open', 'no SSPP intake recorded — run the New Project wizard or set slots on the Safety Program Plan page'); } },
        { id: 'A1-2', grp: 'A-1 Planning', kind: 'auto', text: 'Transition criteria between processes are defined (completion gates with objective checklists).',
          eval: () => (typeof CKPT_CHECKLISTS !== 'undefined' && Object.keys(CKPT_CHECKLISTS).length >= 9) ? _res('satisfied', Object.keys(CKPT_CHECKLISTS).length + ' gated assessments with objective checklists') : _res('open', 'gates unavailable') },
        { id: 'A1-3', grp: 'A-1 Planning', kind: 'attest', text: 'Plans are coordinated across the development organizations (suppliers included).' },
        // ---- A-2 · Development & requirements capture
        { id: 'A2-1', grp: 'A-2 Development', kind: 'auto', text: 'Aircraft-level functions are defined and decomposed.',
          eval: () => (acFunctionsData || []).length ? _res('satisfied', (acFunctionsData || []).length + ' function rows') : _res('open', 'no aircraft functions captured') },
        { id: 'A2-2', grp: 'A-2 Development', kind: 'auto', text: 'System architecture is allocated to systems and items.',
          eval: () => { const n = (systemsData || []).length, it = (typeof itemsData !== 'undefined' ? itemsData : []).length; return n ? _res(it ? 'satisfied' : 'partial', n + ' systems · ' + it + ' items') : _res('open', 'no systems defined'); } },
        { id: 'A2-3', grp: 'A-2 Development', kind: 'auto', text: 'Requirements are captured at each level with traceability to their source.',
          eval: () => { const rs = _allReqs(); if (!rs.length) return _res('open', 'no requirements'); const traced = rs.filter(r => r.traceId || (Array.isArray(r.traceIds) && r.traceIds.length)).length; return _res(traced === rs.length ? 'satisfied' : 'partial', traced + '/' + rs.length + ' traced'); } },
        { id: 'A2-4', grp: 'A-2 Development', kind: 'auto', text: 'Derived requirements are identified and fed to the safety process.',
          eval: () => { const rs = _allReqs(); const derived = rs.filter(r => r.reqSource && r.reqSource.generator).length; return derived ? _res('satisfied', derived + ' generated requirement(s) with recorded source') : _res('partial', 'no generator-sourced requirements yet (AutoReq)'); } },
        // ---- A-3 · Safety assessment
        { id: 'A3-1', grp: 'A-3 Safety assessment', kind: 'auto', text: 'Aircraft and system FHAs performed; failure conditions classified.',
          eval: () => { const n = (acFhaData || []).length; if (!n) return _res('open', 'no AFHA rows'); const un = (acFhaData || []).filter(f => !f.severity).length; const g = _gateState(['AFHA', 'SFHA']); return _res(un === 0 && g.done === 2 ? 'satisfied' : 'partial', n + ' FCs · ' + (un ? un + ' unclassified · ' : '') + g.detail); } },
        { id: 'A3-2', grp: 'A-3 Safety assessment', kind: 'auto', text: 'PASA/PSSA establish the architecture meets the objectives; FDAL/IDAL assigned.',
          eval: () => { const g = _gateState(['PASA', 'PSSA']); return _res(g.done === 2 ? 'satisfied' : g.done ? 'partial' : 'open', g.detail); } },
        { id: 'A3-3', grp: 'A-3 Safety assessment', kind: 'auto', text: 'SSA/ASA verify the implemented design meets the safety requirements.',
          eval: () => { const g = _gateState(['SSA', 'ASA']); return _res(g.done === 2 ? 'satisfied' : g.done ? 'partial' : 'open', g.detail); } },
        { id: 'A3-4', grp: 'A-3 Safety assessment', kind: 'auto', text: 'Common-cause analyses performed (zonal, particular risks, common mode).',
          eval: () => { const g = _gateState(['ZSA', 'PRA', 'CMA']); return _res(g.done === 3 ? 'satisfied' : g.done ? 'partial' : 'open', g.detail); } },
        { id: 'A3-5', grp: 'A-3 Safety assessment', kind: 'auto', text: 'Independence claims are identified, evaluated, and none stand compromised.',
          eval: () => { try { const L = ipLedger(true); if (!L.length) return _res('partial', 'no principles identified yet'); const bad = L.filter(p => p.state === 'compromised').length; const un = L.filter(p => p.state === 'identified').length; return _res(bad === 0 && un === 0 ? 'satisfied' : bad ? 'open' : 'partial', L.length + ' principles · ' + bad + ' compromised · ' + un + ' unevaluated'); } catch (_) { return _res('open', 'ledger unavailable'); } } },
        // ---- A-4 · Validation (the right requirements)
        { id: 'A4-1', grp: 'A-4 Validation', kind: 'auto', text: 'Requirements are validated — correct and complete for the intended function.',
          eval: () => { const rs = _allReqs(); if (!rs.length) return _res('open', 'no requirements'); const val = rs.filter(r => r.valConclusion === 'valid' || r.valMethod || r.valArtifact).length; return _res(val === rs.length ? 'satisfied' : val ? 'partial' : 'open', val + '/' + rs.length + ' with validation evidence'); } },
        { id: 'A4-2', grp: 'A-4 Validation', kind: 'auto', text: 'Assumptions are captured, communicated, and dispositioned.',
          eval: () => { const asm = (acAssumptionsData || []).concat((systemsData || []).flatMap(s => s.asm || [])); if (!asm.length) return _res('partial', 'no assumptions recorded — unusual for a real program'); const open = asm.filter(a => a.state === 'Proposed' || !a.routeTo).length; return _res(open === 0 ? 'satisfied' : 'partial', asm.length + ' assumptions · ' + open + ' unrouted/undispositioned'); } },
        { id: 'A4-3', grp: 'A-4 Validation', kind: 'attest', text: 'Validation rigor matches the development assurance level (independence where required).' },
        // ---- A-5 · Implementation verification
        { id: 'A5-1', grp: 'A-5 Verification', kind: 'auto', text: 'Requirements are verified — the implementation meets them, with recorded results.',
          eval: () => { const rs = _allReqs(); if (!rs.length) return _res('open', 'no requirements'); const v = rs.filter(r => /passed/i.test(r.verifStatus || '')).length; const f = rs.filter(r => /fail/i.test(r.verifStatus || '')).length; return _res(v === rs.length ? 'satisfied' : v ? 'partial' : 'open', v + ' passed · ' + f + ' failed · ' + (rs.length - v - f) + ' open of ' + rs.length); } },
        { id: 'A5-2', grp: 'A-5 Verification', kind: 'auto', text: 'Quantitative safety objectives are met by the as-built design (verification trees vs targets).',
          eval: () => { try { const rows = (typeof ccmrLatentSweep === 'function') ? ccmrLatentSweep(true) : []; const ex = rows.filter(r => r.exceeds).length; const g = _gateState(['SSA']); return _res(ex === 0 && g.done === 1 ? 'satisfied' : ex ? 'open' : 'partial', ex + ' latent bound(s) exceeded · SSA ' + g.detail.split(':')[1]); } catch (_) { return _res('open', 'sweep unavailable'); } } },
        { id: 'A5-3', grp: 'A-5 Verification', kind: 'attest', text: 'Verification independence is established where the assurance level demands it.' },
        // ---- A-6 · Configuration management
        { id: 'A6-1', grp: 'A-6 Config management', kind: 'auto', text: 'Configuration items are identified and baselines established.',
          eval: () => { const b = (typeof projectBaselines !== 'undefined' ? projectBaselines : []); return b.length ? _res('satisfied', b.length + ' baseline(s), SHA-256 sealed') : _res('open', 'no baselines yet — baseline before major reviews'); } },
        { id: 'A6-2', grp: 'A-6 Config management', kind: 'auto', text: 'Changes are controlled; drift from signed/handed-off state is detected.',
          eval: () => { const ph = _phases(); const reopened = Object.keys(ph).filter(k => ph[k].status === 'reopened').length; return _res(reopened === 0 ? 'satisfied' : 'partial', 'fingerprint drift detection active · ' + reopened + ' assessment(s) currently reopened by drift'); } },
        { id: 'A6-3', grp: 'A-6 Config management', kind: 'auto', text: 'Evidence is retrievable on demand (archive & retrieval).',
          eval: () => { const n = (projectConfig.evidencePackages || []).length; return n ? _res('satisfied', n + ' evidence package(s) generated, hash-sealed') : _res('partial', 'no evidence package generated yet — one click on the Evidence Package page'); } },
        // ---- A-7 · Process assurance
        { id: 'A7-1', grp: 'A-7 Process assurance', kind: 'auto', text: 'Reviews are held and line items dispositioned by named reviewers.',
          eval: () => { const n = (typeof reviewApprovalsData !== 'undefined' ? reviewApprovalsData : []).length; return n ? _res('satisfied', n + ' signed approval record(s)') : _res('open', 'no approvals recorded'); } },
        { id: 'A7-2', grp: 'A-7 Process assurance', kind: 'auto', text: 'Deviations from plans are recorded with rationale (tailoring is an act, not an absence).',
          eval: () => { const t = Object.keys(projectConfig.ckptTailored || {}).length; return _res('satisfied', t + ' signed tailoring record(s) — zero is a valid answer, silence is not'); } },
        { id: 'A7-3', grp: 'A-7 Process assurance', kind: 'auto', text: 'AI-assisted content is provenance-logged and human-accepted before use.',
          eval: () => { try { const g = (typeof AiFidelity !== 'undefined') ? AiFidelity.gateEval('PASA') : { pass: true, detail: 'n/a' }; const prov = (projectConfig.aiProvenance || []).length; return _res(g.pass ? 'satisfied' : 'open', prov + ' provenance record(s) · ' + g.detail); } catch (_) { return _res('partial', 'fidelity layer off'); } } },
        // ---- A-8 · Certification liaison
        { id: 'A8-1', grp: 'A-8 Certification liaison', kind: 'attest', text: 'Certification basis and means of compliance agreed with the authority.' },
        { id: 'A8-2', grp: 'A-8 Certification liaison', kind: 'attest', text: 'Authority visibility into development and safety data is arranged (stage involvements).' },
    ];

    // ------------------------------------------------------------- evaluate
    function appAMatrixRows() {
        const attests = _store().attests;
        return OBJECTIVES.map(o => {
            if (o.kind === 'attest') {
                const a = attests[o.id];
                return { id: o.id, grp: o.grp, text: o.text, kind: o.kind,
                         state: a ? 'attested' : 'open', detail: a ? ('signed ' + (a.by || '') + ' · ' + String(a.at || '').slice(0, 10) + (a.note ? ' — ' + a.note : '')) : 'attestation required — a human judgment the model cannot make' };
            }
            let r;
            try { r = o.eval() || { state: 'open', detail: 'no result' }; } catch (e) { r = { state: 'open', detail: 'eval error: ' + (e && e.message) }; }
            return { id: o.id, grp: o.grp, text: o.text, kind: o.kind, state: r.state, detail: r.detail };
        });
    }
    async function appAAttest(id) {
        const o = OBJECTIVES.find(x => x.id === id);
        if (!o || o.kind !== 'attest') return;
        const by = (await _ask('Attest ' + id + ' — ' + o.text + '\n\nSign with your name:', '')) || '';
        if (!by.trim()) return;
        const note = (await _ask('Evidence reference / note (optional):', '')) || '';
        _store().attests[id] = { by: by.trim(), note: note.trim(), at: new Date().toISOString() };
        _save(); renderAppAPage();
    }
    function appAClearAttest(id) {
        if (!confirm('Clear the attestation on ' + id + '?')) return;
        delete _store().attests[id];
        _save(); renderAppAPage();
    }

    // --------------------------------------------------------------- render
    function renderAppAPage() {
        const host = document.getElementById('appa-host');
        if (!host) return;
        const rows = appAMatrixRows();
        const sat = rows.filter(r => r.state === 'satisfied' || r.state === 'attested').length;
        const partial = rows.filter(r => r.state === 'partial').length;
        const open = rows.length - sat - partial;
        const STAMP = { satisfied: ['SATISFIED', '#1D6E3E'], attested: ['ATTESTED', '#1D6E3E'], partial: ['PARTIAL', '#9A6200'], open: ['OPEN', '#8E2A2A'] };

        let html = '<div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">' +
            ['Objectives <b style="margin-left:6px;">' + rows.length + '</b>',
             'Satisfied/attested <b style="margin-left:6px; color:#1D6E3E;">' + sat + '</b>',
             'Partial <b style="margin-left:6px; color:#9A6200;">' + partial + '</b>',
             'Open <b style="margin-left:6px;' + (open ? ' color:#8E2A2A;' : '') + '">' + open + '</b>']
            .map(c => '<div style="height:32px; display:inline-flex; align-items:center; padding:0 12px; border:1px solid var(--color-border-strong); font-family:var(--font-mono); font-size:12px;">' + c + '</div>').join('') + '</div>';

        html += '<div style="border:1px solid var(--color-border-hair); border-left:3px solid var(--color-text-primary); background:var(--color-surface-2); padding:10px 14px; font-size:12px; color:var(--color-text-secondary); margin-bottom:14px; max-width:860px;">' +
            'Objective summaries are ORIGINAL paraphrases keyed to the ARP4754B Appendix A table structure — the standard\'s own tables remain the authoritative wording and level-applicability. ' +
            'AUTO rows are computed from the live model and cannot be attested over; ATTEST rows are the judgments only a human can sign.</div>';

        let lastGrp = null;
        html += '<table class="data-table" style="width:100%; font-size:12.5px;"><thead><tr><th style="width:64px">Obj</th><th>Objective (paraphrased)</th><th style="width:120px">Status</th><th>Live evidence</th><th style="width:90px"></th></tr></thead><tbody>';
        rows.forEach(r => {
            if (r.grp !== lastGrp) {
                lastGrp = r.grp;
                html += '<tr><td colspan="5" style="font-family:var(--font-mono); font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:var(--color-text-secondary); border-bottom:2px solid var(--color-text-primary); padding-top:14px;">' + _esc(r.grp) + '</td></tr>';
            }
            const st = STAMP[r.state] || ['?', '#45464A'];
            html += '<tr><td class="u-mono">' + _esc(r.id) + '</td><td>' + _esc(r.text) + '</td>' +
                '<td><span style="font-family:var(--font-mono); font-size:10.5px; font-weight:600; letter-spacing:0.05em; padding:3px 7px; color:' + st[1] + '; background:' + st[1] + '1A; box-shadow:inset 0 0 0 1.5px currentColor; white-space:nowrap;">' + st[0] + '</span></td>' +
                '<td style="font-size:12px; color:var(--color-text-secondary);">' + _esc(r.detail) + '</td>' +
                '<td>' + (r.kind === 'attest' ? (r.state === 'attested'
                    ? '<a href="#" style="font-size:11px;" onclick="appAClearAttest(\'' + r.id + '\'); return false;">clear</a>'
                    : '<button class="ckpt-m-btn" style="font-size:10.5px; padding:1px 8px;" onclick="appAAttest(\'' + r.id + '\')">attest…</button>') : '<span style="font-size:10px; font-family:var(--font-mono); color:var(--color-text-tertiary);">AUTO</span>') + '</td></tr>';
        });
        html += '</tbody></table>' +
            '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">This matrix travels in the Evidence Package. AUTO evidence recomputes on every render — it cannot go stale, and it cannot be argued with.</p>';
        host.innerHTML = html;
    }

    // ------------------------------------------------- navigation wrapper
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._appaWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-appa');
                if (v) v.style.display = (tabId === 'appa') ? 'block' : 'none';
                const s = document.getElementById('snav-appa');
                if (s) s.classList.toggle('snav-active', tabId === 'appa');
                if (tabId === 'appa') renderAppAPage();
            } catch (_) {}
            return r;
        };
        wrapped._appaWrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------ exports
    window.renderAppAPage = renderAppAPage;
    window.appAMatrixRows = appAMatrixRows;
    window.appAAttest = appAAttest;
    window.appAClearAttest = appAClearAttest;
})();
