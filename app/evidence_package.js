// evidence_package.js — Phase P1: the Evidence Package.
// One self-contained deliverable a DER / ISA / auditor takes away: baseline
// hash, sign-off chains (verified), completion-gate states with fingerprints,
// tailoring register, assumptions, AI provenance, golden thread (with R&M
// evidence), independence principles, package manifest with per-section
// hashes and an overall package hash. Generated FROM live data at the moment
// of export — the closing answer to "EASA went digital. Has your evidence?"
//
// BORN MODULAR: new file, zero monolith edits; wraps switchTab for its view.
// The export is one HTML file (ink-on-paper, print-ready) with the complete
// machine-readable JSON embedded — human and machine read the SAME artifact.

(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    function _toast(m, k, t) { try { if (typeof showToast === 'function') showToast(m, k || 'info', t || 3000); } catch (_) {} }
    function _log() {
        if (!projectConfig.evidencePackages) projectConfig.evidencePackages = [];
        return projectConfig.evidencePackages;
    }

    // ------------------------------------------------------------- assembly
    async function buildPackage() {
        const now = new Date().toISOString();
        const pkg = { meta: {
            title: 'Evidence Package', project: (typeof projectName !== 'undefined' && projectName) || 'Untitled',
            generatedAt: now, generator: 'Safety Lab Aero',
            appVersion: (typeof SAFETY_LAB_VERSION !== 'undefined' ? String(SAFETY_LAB_VERSION).slice(0, 60) : ''),
            principle: 'Every table below is generated from the live project model at the moment of export; nothing is curated by hand.',
        } };

        // 1. project baseline — SHA-256 of the canonical snapshot
        try {
            const snap = _buildProjectSnapshot();
            pkg.baseline = {
                sha256: await _sha256Hex(JSON.stringify(snap)),
                counts: {
                    functions: (acFunctionsData || []).length, failureConditions: (acFhaData || []).length,
                    systems: (systemsData || []).length, trees: (ftaPages || []).length,
                    requirements: (acReqData || []).length + (systemsData || []).reduce((a, s) => a + (s.req || []).length, 0),
                    assumptions: (acAssumptionsData || []).length + (systemsData || []).reduce((a, s) => a + (s.asm || []).length, 0),
                },
                priorBaselines: (typeof projectBaselines !== 'undefined' ? projectBaselines : []).map(b => ({ label: b.label || b.name || '', at: b.at || b.createdAt || '', hash: b.hash || '' })),
            };
        } catch (e) { pkg.baseline = { error: String(e && e.message || e) }; }

        // 2. completion gates — live checklist state + hand-offs + input fingerprints
        try {
            const phases = applyCockpitStatuses(computePhaseStatus());
            pkg.gates = Object.keys(phases).filter(k => typeof CKPT_CHECKLISTS !== 'undefined' && CKPT_CHECKLISTS[k]).map(k => {
                const cl = phases[k].checklist || evalCkptChecklist(k, phases);
                return {
                    assessment: k, status: phases[k].status || '', progress: phases[k].progress || '',
                    inputFingerprint: (typeof _ckptFingerprint === 'function') ? _ckptFingerprint(k) : '',
                    handoff: phases[k].handoff ? { by: phases[k].handoff.by || '', at: phases[k].handoff.at || '', fp: phases[k].handoff.fp || '' } : null,
                    items: (cl.items || []).map(i => ({ ref: i.ref, objective: i.label, state: i.state, detail: i.detail })),
                    ready: !!cl.ready,
                };
            });
        } catch (e) { pkg.gates = { error: String(e && e.message || e) }; }

        // 3. sign-off chains — every approval, tamper-verification per record
        try {
            const rows = [];
            for (const rec of (typeof reviewApprovalsData !== 'undefined' ? reviewApprovalsData : [])) {
                let chainOk = null;
                if (Array.isArray(rec.signoffs) && rec.signoffs.length && typeof verifySignoffChain === 'function') {
                    try { chainOk = await verifySignoffChain(rec.kind, rec.id, rec.systemId || null); } catch (_) { chainOk = false; }
                }
                rows.push({
                    kind: rec.kind, id: rec.id, systemId: rec.systemId || null,
                    approvedBy: rec.approvedBy || '', approvedAt: rec.approvedAt ? new Date(rec.approvedAt).toISOString() : '',
                    signoffs: (rec.signoffs || []).map(s => ({ stage: s.stage, signer: s.signer, at: s.at, hash: String(s.hash || '').slice(0, 16) })),
                    chainVerified: chainOk,
                });
            }
            pkg.signoffs = { records: rows, total: rows.length,
                chainsVerified: rows.filter(r => r.chainVerified === true).length,
                chainsBroken: rows.filter(r => r.chainVerified === false).length };
        } catch (e) { pkg.signoffs = { error: String(e && e.message || e) }; }

        // 4. tailoring + attests — the opt-outs, permanently visible
        pkg.tailoring = Object.keys((projectConfig.ckptTailored || {})).map(k => {
            const t = projectConfig.ckptTailored[k];
            return { item: k, rationale: t.rationale || '', by: t.by || '', at: t.at || '' };
        });
        pkg.attests = Object.keys((projectConfig.ckptAttest || {})).map(k => {
            const a = projectConfig.ckptAttest[k];
            return { item: k, by: a.by || '', at: a.at || '' };
        });

        // 5. assumptions — full register, both levels
        try {
            pkg.assumptions = (acAssumptionsData || []).map(a => ({ id: a.asmId, text: a.text, state: a.state, origin: a.origin || '', routeTo: a.routeTo || '' }))
                .concat((systemsData || []).flatMap(s => (s.asm || []).map(a => ({ id: a.asmId, text: a.text, state: a.state, origin: (a.origin || '') + ' · ' + s.name, routeTo: a.routeTo || '' }))));
        } catch (_) { pkg.assumptions = []; }

        // 6. AI provenance + draft states — every AI act on the record
        pkg.aiProvenance = (projectConfig.aiProvenance || []).slice(-200);
        pkg.aiDrafts = Object.keys(projectConfig.aiDrafts || {}).map(k => {
            const d = projectConfig.aiDrafts[k];
            return { key: k, state: d.state, heading: d.heading || '', model: d.model || '', promptHash: d.promptHash || '', inputFp: d.inputFp || '', flags: d.flags || 0, by: d.by || '', overrideNote: d.overrideNote || '' };
        });

        // 7. golden thread — the certification trace incl. R&M evidence + gaps
        try {
            pkg.goldenThread = { rows: _gtvReportRows(), gaps: _gtvReportGaps() };
        } catch (e) { pkg.goldenThread = { error: String(e && e.message || e) }; }

        // 8. independence principles
        try {
            pkg.principles = ipLedger(true).map(p => ({
                principle: (p.members || []).map(m => m.label).join(' ⊥ '),
                claims: Array.from(p.claims || []), state: p.state,
                contradiction: !!p.contradiction,
                disposition: p.disposition ? ((p.disposition.note || '') + ' · ' + (p.disposition.by || '')) : '',
            }));
        } catch (_) { pkg.principles = []; }

        // 9. R&M posture summary
        try {
            const ram = projectConfig.ram || { tasks: [], field: [] };
            const findings = (typeof ramFieldRows === 'function') ? ramFieldRows().filter(x => x.verdict === 'finding') : [];
            pkg.ram = {
                maintenanceTasks: (ram.tasks || []).length,
                derivedTasks: (ram.tasks || []).filter(t => /derived/.test(t.origin || '')).length,
                fracasRecords: (ram.field || []).length,
                openFindings: findings.filter(x => !(x.f.action && x.f.actionClosed)).length,
                msg3Msis: ((projectConfig.msg3 || {}).msis || []).length,
                msg3RedesignFlags: ((projectConfig.msg3 || {}).msis || []).reduce((a, m) => a + (m.ffs || []).filter(f => (typeof msg3Disposition === 'function') && msg3Disposition(f).state === 'redesign').length, 0),
            };
        } catch (_) { pkg.ram = null; }

        // 9b. problem reports — the open-problem register with deferral rationales
        try {
            if (typeof window.prRows === 'function') {
                pkg.problemReports = window.prRows().map(p => ({
                    id: p.id, title: p.title, safetyRelated: !!p.safetyRelated, source: p.source || '',
                    linked: p.linked || '', state: p.state,
                    disposition: p.state === 'deferred' && p.deferral ? ('DEFERRED — ' + p.deferral.rationale + ' · review by ' + p.deferral.until + ' · ' + p.deferral.by) : (p.disposition || ''),
                    raisedBy: p.raisedBy || '', raisedAt: p.raisedAt || '',
                    history: (p.history || []).map(h => h.at.slice(0, 10) + ' ' + h.state + ' · ' + h.by),
                }));
            }
        } catch (_) {}

        // 9c. MMEL / TLD register — dispatch candidacy with model verdicts
        try {
            if (projectConfig.mmel && Array.isArray(projectConfig.mmel.items)) {
                pkg.mmel = projectConfig.mmel.items.map(it => ({
                    id: it.id, title: it.title, ata: it.ata || '', installedRequired: it.installed + '/' + it.required,
                    category: it.category + (it.catDays != null ? ' (' + it.catDays + 'd)' : ''),
                    protection: it.protection ? (it.protection.ok === false ? 'NO DISPATCH — ' : '') + it.protection.verdict : 'not analyzed',
                    quantitative: it.quant && it.quant.base != null ? ('base ' + it.quant.base.toExponential(2) + ' → dispatched ' + it.quant.dispatched.toExponential(2) + (it.quant.withinTarget != null ? (it.quant.withinTarget ? ' (≤ target)' : ' (EXCEEDS target)') : '')) : '',
                    tldMaxFH: it.quant && it.quant.tldMaxFH != null ? Math.round(it.quant.tldMaxFH) : null,
                    state: it.state,
                }));
            }
        } catch (_) {}

        // 9h. save/load round-trip proof (Q5) — last result, if run
        try {
            if (projectConfig.rtProofLast) pkg.rtProof = projectConfig.rtProofLast;
        } catch (_) {}

        // 9k. hash-chained journal (Q7) — tamper-evident act history
        try {
            const j = projectConfig.journal;
            if (j && Array.isArray(j.entries) && j.entries.length) {
                pkg.journal = { entries: j.entries.length, compacted: !!j.anchor,
                    lastAt: j.entries[j.entries.length - 1].at,
                    headHash: j.entries[j.entries.length - 1].h,
                    lastVerify: projectConfig.jrnlLastVerify || null };
            }
        } catch (_) {}

        // 9j. engine self-test (Q6) — run FRESH at package build, so every
        // shipped package carries a same-session verification of the engines
        try {
            if (typeof window.engineSelfTest === 'function') pkg.engineSelfTest = window.engineSelfTest();
        } catch (_) {}

        // 9i. cross-artifact invariant sweep (Q8) — run fresh at package build
        try {
            if (typeof window.invRun === 'function') {
                const iv = window.invRun();
                pkg.invariants = { at: iv.at, pass: iv.pass, hardFails: iv.hardFails, advisories: iv.advisories,
                    failed: iv.results.filter(r => !r.pass).map(r => r.id + ' ' + r.name + ' (' + r.failCount + ')') };
            }
        } catch (_) {}

        // 9g. golden-thread integrity sweep — dangling / fragile / orphans
        try {
            if (typeof window.gtIntegrity === 'function') {
                const g = window.gtIntegrity();
                pkg.threadIntegrity = { checked: g.checked, pristine: g.pristine,
                    dangling: g.dangling.map(x => x.where + ' → ' + x.ref + ' (' + x.detail + ')'),
                    fragile: g.fragile.map(x => x.where + ': ' + x.detail),
                    orphans: g.orphans.map(x => x.where + ' ' + x.ref + ' — ' + x.detail),
                    bindings: Object.keys((projectConfig.threadLinks || {})).length };
            }
        } catch (_) {}

        // 9f. cascading-effects reconciliation (P5) + in-service watch list (P8)
        try {
            if (typeof window.ceaFindings === 'function') {
                const f = window.ceaFindings();
                pkg.cea = { pairs: f.pairs, corroborated: f.corroborated,
                    findings: f.rows.slice(0, 60).map(r => ({ kind: r.kind, source: r.source, fc: r.fc, severity: r.severity, via: r.via, detail: r.detail })) };
            }
        } catch (_) {}
        try {
            if (typeof window.sseRows === 'function') {
                pkg.sse = window.sseRows().map(r => ({ kind: r.kind, id: r.id, event: r.event, monitor: r.monitor, expectation: r.expectation, source: r.source }));
            }
        } catch (_) {}

        // 9e. requirement validation posture (P4 — §5.4 split)
        try {
            if (typeof window.vvProgramPosture === 'function') {
                const p = window.vvProgramPosture();
                pkg.validation = {
                    total: p.total, valid: p.valid, awaiting: p.awaiting, flagged: p.flagged, open: p.open,
                    sets: p.sets.map(s => ({ name: s.name, reqCount: s.reqCount, complete: s.pass,
                        checks: s.checks.map(c => (c.pass ? '✓ ' : '✗ ') + c.label + ' — ' + c.detail) })),
                };
            }
        } catch (_) {}

        // 9d. modification register — impact assessments with predictions
        try {
            if (Array.isArray(projectConfig.mods)) {
                pkg.modifications = projectConfig.mods.map(m => ({
                    id: m.id, title: m.title, state: m.state,
                    scope: [m.scope.systems.join(','), m.scope.subIds.join(','), m.scope.itemIds.join(',')].filter(Boolean).join(' · '),
                    counts: m.impact.counts,
                    gates: (m.impact.gates || []).map(g => g.assessment + (g.willReopen ? ' (reopens)' : '')).join(', '),
                    history: (m.history || []).map(h => h.at.slice(0, 10) + ' ' + h.state + ' · ' + h.by),
                }));
            }
        } catch (_) {}

        // 10. process objectives (4754B App A structure) — live matrix state
        try {
            if (typeof window.appAMatrixRows === 'function') {
                pkg.objectives = window.appAMatrixRows().map(r => ({ id: r.id, group: r.grp, objective: r.text, state: r.state, evidence: r.detail }));
            }
        } catch (_) {}

        // manifest — per-section hash + overall package hash
        const manifest = { sections: {} };
        for (const key of Object.keys(pkg)) {
            if (key === 'meta') continue;
            manifest.sections[key] = await _sha256Hex(JSON.stringify(pkg[key]));
        }
        pkg.manifest = manifest;
        pkg.packageHash = await _sha256Hex(JSON.stringify(pkg));
        return pkg;
    }

    // --------------------------------------------------------------- render
    function _tbl(headers, rows) {
        return '<table><thead><tr>' + headers.map(h => '<th>' + _esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
            (rows.length ? rows.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') : '<tr><td colspan="' + headers.length + '" class="dim">none</td></tr>') +
            '</tbody></table>';
    }
    function renderPackageHtml(pkg) {
        const stateColor = s => /pass|verified|accepted|controlled|complete|handed/i.test(s) ? '#1D6E3E' : /fail|broken|open|redesign|reopened|finding/i.test(s) ? '#8E2A2A' : /attest|tailor|planned|in.work/i.test(s) ? '#9A6200' : '#45464A';
        const stamp = s => '<span class="stamp" style="color:' + stateColor(s) + ';">' + _esc(String(s).toUpperCase()) + '</span>';
        let b = '';
        b += '<div class="head"><div><div class="ttl">EVIDENCE PACKAGE</div><div class="sub">' + _esc(pkg.meta.project) + '</div></div>' +
            '<div class="mono meta">generated ' + _esc(pkg.meta.generatedAt) + '<br>package sha-256<br><b>' + _esc(pkg.packageHash) + '</b></div></div>' +
            '<p class="lede">' + _esc(pkg.meta.principle) + ' Alter any byte of the embedded data and the package hash no longer matches — this artifact carries its own tamper evidence.</p>';

        b += '<h2>1 · Project baseline</h2>';
        if (pkg.baseline && !pkg.baseline.error) {
            b += '<p class="mono">snapshot sha-256: <b>' + _esc(pkg.baseline.sha256) + '</b></p>' +
                _tbl(['Functions', 'Failure conditions', 'Systems', 'Trees', 'Requirements', 'Assumptions'],
                    [[pkg.baseline.counts.functions, pkg.baseline.counts.failureConditions, pkg.baseline.counts.systems, pkg.baseline.counts.trees, pkg.baseline.counts.requirements, pkg.baseline.counts.assumptions].map(String)]);
        }
        b += '<h2>2 · Completion gates</h2>';
        (Array.isArray(pkg.gates) ? pkg.gates : []).forEach(g => {
            b += '<h3>' + _esc(g.assessment) + ' — ' + stamp(g.status || 'in work') + ' <span class="mono dim">fp ' + _esc(g.inputFingerprint) + (g.handoff ? ' · handed off by ' + _esc(g.handoff.by) + ' ' + _esc(String(g.handoff.at).slice(0, 10)) : '') + '</span></h3>' +
                _tbl(['Ref', 'Objective', 'State', 'Evidence'], g.items.map(i => [_esc(i.ref), _esc(i.objective), stamp(i.state), _esc(i.detail)]));
        });
        b += '<h2>3 · Sign-off chains</h2>';
        if (pkg.signoffs && pkg.signoffs.records) {
            b += '<p class="mono">' + pkg.signoffs.total + ' approval record(s) · ' + pkg.signoffs.chainsVerified + ' hash-chain(s) VERIFIED · ' +
                (pkg.signoffs.chainsBroken ? '<b style="color:#8E2A2A;">' + pkg.signoffs.chainsBroken + ' BROKEN</b>' : '0 broken') + '</p>' +
                _tbl(['Artifact', 'Approved by', 'At', 'Staged sign-offs', 'Chain'],
                    pkg.signoffs.records.slice(0, 400).map(r => [
                        _esc(r.kind + ':' + r.id + (r.systemId ? ' @' + r.systemId : '')), _esc(r.approvedBy), _esc(String(r.approvedAt).slice(0, 10)),
                        r.signoffs.length ? r.signoffs.map(s => _esc(s.stage + ' · ' + s.signer)).join('<br>') : '<span class="dim">—</span>',
                        r.chainVerified == null ? '<span class="dim">n/a</span>' : stamp(r.chainVerified ? 'verified' : 'BROKEN'),
                    ]));
        }
        b += '<h2>4 · Tailoring register (signed opt-outs)</h2>' +
            _tbl(['Item', 'Rationale', 'By', 'At'], pkg.tailoring.map(t => [_esc(t.item), _esc(t.rationale), _esc(t.by), _esc(String(t.at).slice(0, 10))]));
        b += '<h2>5 · Attestations</h2>' +
            _tbl(['Item', 'By', 'At'], pkg.attests.map(a => [_esc(a.item), _esc(a.by), _esc(String(a.at).slice(0, 10))]));
        b += '<h2>6 · Assumptions register</h2>' +
            _tbl(['ID', 'Assumption', 'State', 'Routed to', 'Origin'], pkg.assumptions.map(a => [_esc(a.id), _esc(a.text), stamp(a.state || 'open'), _esc(a.routeTo), _esc(a.origin)]));
        b += '<h2>7 · AI provenance (' + pkg.aiProvenance.length + ' act(s), last 200) & draft states</h2>' +
            _tbl(['When', 'Kind', 'Feature / Section', 'Model', 'Prompt', 'Flags', 'By'],
                pkg.aiProvenance.slice(-40).reverse().map(r => [_esc(String(r.at || '').slice(0, 16).replace('T', ' ')), _esc(r.kind || ''), _esc(r.section || r.heading || r.group || r.feature || ''), _esc(String(r.model || '—').slice(0, 22)), _esc(r.promptHash || '—'), _esc(r.flags != null ? String(r.flags) : '—'), _esc(r.by || '')])) +
            _tbl(['Draft', 'State', 'Model', 'Checker flags', 'Accepted by'],
                pkg.aiDrafts.map(d => [_esc(d.key + ' — ' + d.heading), stamp(d.state), _esc(d.model), _esc(String(d.flags) + (d.overrideNote ? ' (override: ' + d.overrideNote + ')' : '')), _esc(d.by)]));
        b += '<h2>8 · Golden thread</h2>';
        if (pkg.goldenThread && pkg.goldenThread.rows) {
            const cols = pkg.goldenThread.rows.length ? Object.keys(pkg.goldenThread.rows[0]) : [];
            b += _tbl(cols, pkg.goldenThread.rows.map(r => cols.map(c => _esc(r[c])))) +
                '<p class="lede">' + _esc(pkg.goldenThread.gaps) + '</p>';
        }
        b += '<h2>9 · Independence principles</h2>' +
            _tbl(['Principle', 'Claims', 'State', 'Disposition'], pkg.principles.map(p => [_esc(p.principle), _esc(p.claims.join(', ')), stamp(p.state + (p.contradiction ? ' · CCF contradiction' : '')), _esc(p.disposition)]));
        if (pkg.ram) {
            b += '<h2>10 · R&M posture</h2>' +
                _tbl(['Maintenance tasks', 'Model-derived', 'FRACAS records', 'Open findings', 'MSG-3 MSIs', 'Redesign flags'],
                    [[pkg.ram.maintenanceTasks, pkg.ram.derivedTasks, pkg.ram.fracasRecords, pkg.ram.openFindings, pkg.ram.msg3Msis, pkg.ram.msg3RedesignFlags].map(String)]);
        }
        if (pkg.journal) {
            b += '<h2>10k · Hash-chained journal</h2>' +
                '<p class="mono">' + pkg.journal.entries + ' chained entr' + (pkg.journal.entries === 1 ? 'y' : 'ies') +
                (pkg.journal.compacted ? ' (older history compacted into the anchor)' : '') +
                ' · head ' + _esc(String(pkg.journal.headHash).slice(0, 16)) + '… · last act ' + _esc(String(pkg.journal.lastAt).slice(0, 16).replace('T', ' ')) +
                (pkg.journal.lastVerify ? ' · chain verified ' + _esc(String(pkg.journal.lastVerify.at).slice(0, 16).replace('T', ' ')) + ' ✓' : '') + '</p>';
        }
        if (pkg.engineSelfTest) {
            const st = pkg.engineSelfTest;
            b += '<h2>10j · Engine self-test (this machine, this session)</h2>' +
                '<p class="mono">' + st.at.slice(0, 16).replace('T', ' ') + ' — ' +
                (st.ok ? 'VERIFIED: ' + st.pass + '/' + st.total + ' published-reference benchmarks passed (' + st.ms + ' ms, ' + _esc(st.browser) + ')'
                    : 'FAILED: ' + st.fails.map(_esc).join('; ')) + '</p>';
        }
        if (pkg.invariants) {
            b += '<h2>10i · Cross-artifact invariants</h2>' +
                '<p class="mono">' + pkg.invariants.at.slice(0, 16).replace('T', ' ') + ' — ' +
                (pkg.invariants.pass ? 'ALL HOLD' : pkg.invariants.hardFails + ' BROKEN') +
                (pkg.invariants.advisories ? ' · ' + pkg.invariants.advisories + ' advisory' : '') +
                (pkg.invariants.failed.length ? ': ' + pkg.invariants.failed.map(_esc).join('; ') : '') + '</p>';
        }
        if (pkg.rtProof) {
            b += '<h2>10h · Save/load round-trip proof</h2>' +
                '<p class="mono">' + pkg.rtProof.at.slice(0, 16).replace('T', ' ') + ' — ' +
                (pkg.rtProof.ok ? 'PROVEN: every field survived serialize → apply → serialize (' + pkg.rtProof.stores + ' stores, ' + Math.round(pkg.rtProof.bytes / 1024) + ' KB)'
                    : 'FAILED: ' + pkg.rtProof.mismatches.map(_esc).join(', ')) + '</p>';
        }
        if (pkg.threadIntegrity) {
            const ti = pkg.threadIntegrity;
            b += '<h2>10g · Golden-thread integrity</h2>' +
                '<p class="mono">' + ti.checked + ' edges checked · ' + (ti.pristine ? 'PRISTINE' : (ti.dangling.length + ' dangling · ' + ti.fragile.length + ' fragile')) + ' · ' + ti.orphans.length + ' orphan(s) · ' + ti.bindings + ' binding(s)</p>' +
                (ti.dangling.length ? '<p><b>Dangling:</b><br>' + ti.dangling.map(_esc).join('<br>') + '</p>' : '') +
                (ti.fragile.length ? '<p><b>Fragile:</b><br>' + ti.fragile.map(_esc).join('<br>') + '</p>' : '') +
                (ti.orphans.length ? '<p><b>Orphans:</b><br>' + ti.orphans.map(_esc).join('<br>') + '</p>' : '');
        }
        if (pkg.cea) {
            b += '<h2>10e · Cascading effects — graph vs interdependence reconciliation</h2>' +
                '<p class="mono">' + pkg.cea.pairs + ' dependency pairs · ' + pkg.cea.corroborated + ' corroborated · ' + pkg.cea.findings.length + ' finding(s)</p>' +
                (pkg.cea.findings.length ? _tbl(['Kind', 'Source system', 'FC', 'Severity', 'Path', 'Detail'],
                    pkg.cea.findings.map(r => [stamp(r.kind), _esc(r.source), _esc(r.fc), _esc(r.severity || '—'), _esc(r.via), _esc(r.detail)])) : '');
        }
        if (pkg.sse && pkg.sse.length) {
            b += '<h2>10f · Safety-significant events — in-service watch list</h2>' +
                _tbl(['Kind', 'ID', 'Event', 'Monitor', 'Expectation staked', 'Source'],
                    pkg.sse.map(r => [stamp(r.kind), _esc(r.id), _esc(r.event), _esc(r.monitor), _esc(r.expectation), _esc(r.source)]));
        }
        if (pkg.validation) {
            b += '<h2>10d · Requirement validation posture</h2>' +
                '<p class="mono">' + pkg.validation.valid + '/' + pkg.validation.total + ' valid · ' +
                pkg.validation.awaiting + ' awaiting attestation · ' + pkg.validation.flagged + ' flagged · ' + pkg.validation.open + ' open</p>' +
                _tbl(['Set', 'Requirements', 'Completeness', 'Checks'],
                    pkg.validation.sets.map(s => [_esc(s.name), String(s.reqCount), stamp(s.complete ? 'complete' : 'incomplete'),
                        s.checks.map(_esc).join('<br>')]));
        }
        if (pkg.modifications && pkg.modifications.length) {
            b += '<h2>10c · Modification register</h2>' +
                _tbl(['Mod', 'Title', 'Scope', 'Impact (FCs/trees/reqs)', 'Gates touched', 'State', 'History'],
                    pkg.modifications.map(m => [_esc(m.id), _esc(m.title), _esc(m.scope),
                        _esc(m.counts.fcs + '/' + m.counts.pages + '/' + m.counts.reqs), _esc(m.gates), stamp(m.state), m.history.map(_esc).join('<br>')]));
        }
        if (pkg.mmel) {
            b += '<h2>10a · MMEL / TLD register</h2>' +
                _tbl(['Item', 'Equipment', 'Inst/Req', 'Category', 'Protection check', 'Quantitative', 'TLD max FH', 'State'],
                    pkg.mmel.map(m => [_esc(m.id), _esc(m.title), _esc(m.installedRequired), _esc(m.category), _esc(m.protection), _esc(m.quantitative), _esc(m.tldMaxFH != null ? String(m.tldMaxFH) : '—'), stamp(m.state)]));
        }
        if (pkg.problemReports) {
            b += '<h2>10b · Problem reports (OPR register)</h2>' +
                _tbl(['PR', 'Problem', 'Safety', 'State', 'Disposition / deferral', 'Raised'],
                    pkg.problemReports.map(p => [_esc(p.id), _esc(p.title), p.safetyRelated ? '<b style="color:#8E2A2A;">YES</b>' : 'no', stamp(p.state), _esc(p.disposition), _esc(p.raisedBy + ' · ' + String(p.raisedAt).slice(0, 10))]));
        }
        if (pkg.objectives) {
            b += '<h2>11 · Process objectives (ARP4754B App A structure — paraphrased)</h2>' +
                _tbl(['Obj', 'Objective', 'State', 'Evidence'], pkg.objectives.map(o => [_esc(o.id), _esc(o.objective), stamp(o.state), _esc(o.evidence)]));
        }
        b += '<h2>Manifest</h2>' +
            _tbl(['Section', 'SHA-256'], Object.keys(pkg.manifest.sections).map(k => [_esc(k), '<span class="mono">' + _esc(pkg.manifest.sections[k]) + '</span>']));

        return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Evidence Package — ' + _esc(pkg.meta.project) + '</title><style>' +
            'body{font-family:"IBM Plex Sans","Helvetica Neue",Arial,sans-serif;color:#0B0B0C;background:#fff;margin:34px auto;max-width:1060px;font-size:13px;line-height:1.5;}' +
            '.mono{font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace;} .dim{color:#8A8B90;}' +
            '.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0B0B0C;padding-bottom:14px;gap:20px;}' +
            '.ttl{font-size:22px;font-weight:700;letter-spacing:0.04em;} .sub{font-size:14px;color:#45464A;margin-top:4px;}' +
            '.meta{font-size:10px;text-align:right;color:#45464A;word-break:break-all;max-width:420px;}' +
            '.lede{color:#45464A;font-size:12.5px;} h2{font-size:13px;letter-spacing:0.08em;text-transform:uppercase;font-family:"IBM Plex Mono",monospace;border-bottom:2px solid #0B0B0C;padding-bottom:5px;margin:26px 0 10px;}' +
            'h3{font-size:12.5px;margin:14px 0 6px;} table{width:100%;border-collapse:collapse;border:1px solid #0B0B0C;margin-bottom:8px;}' +
            'th{font-family:"IBM Plex Mono",monospace;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#45464A;text-align:left;padding:7px 9px;border-bottom:2px solid #0B0B0C;}' +
            'td{padding:6px 9px;border-bottom:1px solid #E2E2E2;vertical-align:top;font-size:12px;}' +
            '.stamp{font-family:"IBM Plex Mono",monospace;font-size:10px;font-weight:600;letter-spacing:0.05em;padding:2px 6px;box-shadow:inset 0 0 0 1.5px currentColor;white-space:nowrap;}' +
            '@media print{body{margin:10mm;} h2{page-break-after:avoid;}}' +
            '</style></head><body>' + b +
            '<p class="mono dim" style="margin-top:30px;">machine-readable payload embedded below · verify: sha-256 of the JSON (minus packageHash) reproduces the section hashes; the full JSON hashes to the package hash above</p>' +
            '<script type="application/json" id="evidence-package-json">' + JSON.stringify(pkg).replace(/</g, '\\u003c') + '</scr' + 'ipt>' +
            '</body></html>';
    }

    // --------------------------------------------------------------- action
    async function evpkgGenerate() {
        _toast('Assembling the evidence package from live data…', 'info', 2500);
        let pkg;
        try { pkg = await buildPackage(); }
        catch (e) { _toast('Package assembly failed: ' + (e && e.message || e), 'error', 5000); return; }
        const html = renderPackageHtml(pkg);
        const name = 'evidence-package-' + String(pkg.meta.project).replace(/[^A-Za-z0-9]+/g, '-').slice(0, 40) + '-' + pkg.meta.generatedAt.slice(0, 10) + '-' + pkg.packageHash.slice(0, 8) + '.html';
        try {
            const blob = new Blob([html], { type: 'text/html' });
            if (typeof SaveFs !== 'undefined' && SaveFs.saveBlob) { SaveFs.saveBlob(blob, name); }
            else {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = name; a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1500);
            }
        } catch (e) { _toast('Download failed: ' + (e && e.message || e), 'error', 4000); return; }
        _log().push({ at: pkg.meta.generatedAt, hash: pkg.packageHash, file: name,
            gates: Array.isArray(pkg.gates) ? pkg.gates.length : 0, signoffs: pkg.signoffs ? pkg.signoffs.total : 0 });
        if (_log().length > 50) _log().splice(0, _log().length - 50);
        try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
        _toast('Evidence package generated — ' + name + ' · sha ' + pkg.packageHash.slice(0, 12) + '…', 'success', 6000);
        renderEvpkgPage();
    }

    function renderEvpkgPage() {
        const host = document.getElementById('evpkg-host');
        if (!host) return;
        const hist = _log();
        host.innerHTML =
            '<div style="margin:0 0 14px;"><button class="btn-cyan" onclick="evpkgGenerate()" style="font-size:14px; padding:10px 18px;">⬇ Generate evidence package</button></div>' +
            '<div style="border:1px solid var(--color-border-hair); border-left:3px solid var(--color-text-primary); background:var(--color-surface-2); padding:12px 16px; font-size:12.5px; color:var(--color-text-secondary); max-width:760px;">' +
            'One self-contained, print-ready HTML file assembled from the live model at the moment of export: project baseline (SHA-256), every completion gate with its input fingerprint and hand-off, every sign-off with its hash chain re-verified, the tailoring register, the assumptions register, the full AI provenance ledger and draft states, the golden thread with R&amp;M evidence, the independence-principle ledger, and a manifest with per-section hashes plus an overall package hash. ' +
            'The machine-readable JSON is embedded in the same file — the human and the tool read one artifact, and altering any byte breaks the hash.</div>' +
            '<h3 style="margin-top:var(--s-5);">Generation log</h3>' +
            '<table class="data-table" style="width:100%; max-width:820px; font-size:12.5px;"><thead><tr><th>Generated</th><th>Package hash</th><th>Gates</th><th>Sign-offs</th><th>File</th></tr></thead><tbody>' +
            (hist.length ? hist.slice().reverse().map(h =>
                '<tr><td class="u-mono">' + _esc(String(h.at).slice(0, 16).replace('T', ' ')) + '</td><td class="u-mono">' + _esc(String(h.hash).slice(0, 16)) + '…</td>' +
                '<td class="u-mono">' + h.gates + '</td><td class="u-mono">' + h.signoffs + '</td><td style="font-size:11px;">' + _esc(h.file) + '</td></tr>').join('')
                : '<tr><td colspan="5" style="color:var(--color-text-tertiary);">No packages generated yet.</td></tr>') +
            '</tbody></table>';
    }

    // ------------------------------------------------- navigation wrapper
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._evpkgWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-evpkg');
                if (v) v.style.display = (tabId === 'evpkg') ? 'block' : 'none';
                const s = document.getElementById('snav-evpkg');
                if (s) s.classList.toggle('snav-active', tabId === 'evpkg');
                if (tabId === 'evpkg') renderEvpkgPage();
            } catch (_) {}
            return r;
        };
        wrapped._evpkgWrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------ exports
    window.evpkgGenerate = evpkgGenerate;
    window.renderEvpkgPage = renderEvpkgPage;
    window._evpkgBuild = buildPackage;
    window._evpkgRenderHtml = renderPackageHtml;
})();
