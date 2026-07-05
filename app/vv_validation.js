// ============================================================================
// vv_validation.js — Phase P4 (gap M11): validation as a discipline distinct
// from verification, in the spirit of ARP4754B §5.4.
//
// Verification asks "does the implementation meet the requirement?" — the app
// already tracks that per requirement. Validation asks the PRIOR question:
// "is the requirement itself correct and complete?" This module supplies it:
//
//   1. CORRECTNESS per requirement — a deterministic lint battery over the
//      requirement's own text and metadata (stated, unambiguous, verifiable,
//      traceable, rationale, unique), plus a signed correctness attestation.
//   2. RIGOR scaled to consequence — a requirement traced to a Catastrophic
//      or Hazardous condition demands independent attestation; Major demands
//      attestation; below that the automatic checks suffice. (Validation
//      rigor follows development assurance rigor — original formulation.)
//   3. COMPLETENESS per SET — the aircraft-level set and each system set are
//      evaluated as sets: every severe condition covered, derived
//      requirements justified, routed assumptions dispositioned.
//   4. A validation MATRIX page rendering all of it live, and a PSSA gate
//      item so an unvalidated requirement set blocks the hand-off.
//
// Two-lane discipline: every column here is computed live from the model
// EXCEPT the attestation, which is an elicited signature. The attestation
// never overrides a failing lint — a signed requirement with a failing lint
// renders FLAGGED, not valid. No standard text is reproduced; checklist
// wording is original.
//
// Born modular (zero monolith edits): classic script, wraps switchTab for the
// 'val-matrix' tab, pushes one auto item onto the PSSA checklist at load, and
// annotates golden-thread gaps. All state under projectConfig.reqVal.
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function _store() {
        if (typeof projectConfig === 'undefined') return {};
        if (!projectConfig.reqVal) projectConfig.reqVal = {};
        return projectConfig.reqVal;
    }
    const _key = r => String(r.internalId != null ? r.internalId : (r.id || r.traceId));

    // ------------------------------------------------------------ the sets
    // A "set" is the unit of completeness evaluation: the aircraft-level
    // requirement set, or one system's requirement set.
    function vvSets() {
        const sets = [{ scope: 'aircraft', name: 'Aircraft-level set', reqs: (typeof acFhaData !== 'undefined' && typeof acReqData !== 'undefined') ? (acReqData || []) : [] }];
        ((typeof systemsData !== 'undefined' && systemsData) || []).forEach(s =>
            sets.push({ scope: s.id, name: (s.name || s.id) + ' set', reqs: s.req || [], sys: s }));
        return sets;
    }

    // ------------------------------------------------- severity-scaled rigor
    // Worst severity among the failure conditions this requirement traces to.
    function _tracedFcs(r) {
        const traces = Array.isArray(r.traceIds) ? r.traceIds : (r.traceId ? [r.traceId] : []);
        const out = [];
        traces.forEach(t => {
            const ac = ((typeof acFhaData !== 'undefined' && acFhaData) || []).find(f => f.fcId === t || String(f.internalId) === String(t));
            if (ac) { out.push(ac); return; }
            ((typeof systemsData !== 'undefined' && systemsData) || []).forEach(s => {
                const f = (s.fha || []).find(x => x.fcId === t || String(x.internalId) === String(t));
                if (f) out.push(f);
            });
        });
        return out;
    }
    const _SEV_RANK = { 'Catastrophic': 4, 'Hazardous': 3, 'Major': 2, 'Minor': 1, 'No Safety Effect': 0 };
    function vvRigor(r) {
        const fcs = _tracedFcs(r);
        let worst = null, rank = -1;
        fcs.forEach(f => { const k = _SEV_RANK[f.severity] || 0; if (k > rank) { rank = k; worst = f.severity; } });
        if (rank >= 3) return { level: 'independent', worst, label: 'attest + independence', why: 'traces to a ' + worst + ' condition' };
        if (rank === 2) return { level: 'attest', worst, label: 'attestation required', why: 'traces to a Major condition' };
        return { level: 'basic', worst: worst || '—', label: 'automatic checks', why: fcs.length ? 'worst traced severity ' + worst : 'no traced failure condition' };
    }

    // --------------------------------------------------- correctness lints
    // Deterministic, text-and-metadata only. Original wording throughout.
    const _VAGUE = ['as appropriate', 'as required', 'as necessary', 'adequate', 'sufficient',
        'minimize', 'maximize', 'optimal', 'user-friendly', 'robust', 'quickly', 'easily',
        'if possible', 'where practical', 'best effort', 'etc.', 'and/or', 'reasonable', 'state of the art'];
    const _PLACEHOLDER = /\bTBD\b|\bTBS\b|\bTODO\b|\?\?\?|<[^>]*>/i;

    const LINTS = [
        { id: 'stated', label: 'Stated', run: (r) => {
            const t = (r.text || '').trim();
            if (!t) return { pass: false, detail: 'empty requirement text' };
            if (_PLACEHOLDER.test(t)) return { pass: false, detail: 'placeholder marker in text' };
            if (!/\bshall\b|\bmust\b|\bshall not\b/i.test(t)) return { pass: false, detail: 'no imperative (shall/must)' };
            return { pass: true, detail: 'imperative statement, no placeholders' };
        } },
        { id: 'unambiguous', label: 'Unambiguous', run: (r) => {
            const t = (r.text || '').toLowerCase();
            const hits = _VAGUE.filter(v => t.includes(v));
            return hits.length ? { pass: false, detail: 'vague wording: "' + hits.slice(0, 3).join('", "') + '"' }
                : { pass: true, detail: 'no vague-term hits' };
        } },
        { id: 'verifiable', label: 'Verifiable', run: (r) => {
            const hasMethod = !!(r.verifMethod || '').trim();
            const quantified = /\d/.test(r.text || '');
            if (hasMethod) return { pass: true, detail: 'verification method: ' + r.verifMethod };
            if ((r.type || '') === 'Quantitative' && !quantified) return { pass: false, detail: 'quantitative type with no number in text' };
            return { pass: quantified, detail: quantified ? 'quantified in text (no method yet)' : 'no verification method and no quantification' };
        } },
        { id: 'traceable', label: 'Traceable', run: (r) => {
            const traces = Array.isArray(r.traceIds) ? r.traceIds : (r.traceId ? [r.traceId] : []);
            if (!traces.length) return { pass: false, detail: 'no parent trace' };
            const resolved = _tracedFcs(r).length;
            return { pass: true, detail: traces.join(', ') + (resolved ? ' (resolves to ' + resolved + ' FC(s))' : ' (not an FC reference)') };
        } },
        { id: 'rationale', label: 'Rationale', run: (r) => {
            const derived = (r.level || '') === 'Derived' || !!r.derivationType;
            const has = !!(r.rat || '').trim();
            if (derived && !has) return { pass: false, detail: 'derived requirement without rationale' };
            return { pass: true, detail: has ? 'recorded' : 'not derived — rationale optional' };
        } },
        { id: 'unique', label: 'Unique in set', run: (r, set) => {
            const norm = t => (t || '').toLowerCase().replace(/\s+/g, ' ').trim();
            const mine = norm(r.text);
            const dup = (set.reqs || []).find(o => _key(o) !== _key(r) && norm(o.text) === mine && mine);
            return dup ? { pass: false, detail: 'duplicate of ' + (dup.id || dup.traceId || ('#' + dup.internalId)) }
                : { pass: true, detail: 'no duplicate text' };
        } },
    ];

    function reqValChecklist(r, set) {
        return LINTS.map(l => { try { return Object.assign({ id: l.id, label: l.label }, l.run(r, set || { reqs: [] })); }
            catch (e) { return { id: l.id, label: l.label, pass: false, detail: 'lint error: ' + e.message }; } });
    }

    // ------------------------------------------------ conclusion per req
    // valid    — all lints pass AND the rigor's attestation demand is met
    // awaiting — lints pass, attestation still owed
    // flagged  — a signed attestation sits on a failing lint (signature
    //            cannot override the computed lane)
    // open     — lints failing, nothing signed
    function reqValConclusion(r, set) {
        const rows = reqValChecklist(r, set);
        const autosPass = rows.every(x => x.pass);
        const rigor = vvRigor(r);
        const att = _store()[_key(r)];
        const attested = !!(att && att.by);
        const independent = !!(att && att.independent);
        let conclusion, detail;
        if (attested && !autosPass) { conclusion = 'flagged'; detail = 'signed over a failing check — resolve the lint or withdraw'; }
        else if (!autosPass) { conclusion = 'open'; detail = rows.filter(x => !x.pass).length + ' check(s) failing'; }
        else if (rigor.level === 'basic') { conclusion = 'valid'; detail = 'automatic checks pass (' + rigor.label + ')'; }
        else if (!attested) { conclusion = 'awaiting'; detail = 'checks pass — ' + rigor.label + ' owed (' + rigor.why + ')'; }
        else if (rigor.level === 'independent' && !independent) { conclusion = 'awaiting'; detail = 'attested by ' + att.by + ' — independence not claimed'; }
        else { conclusion = 'valid'; detail = 'attested ' + att.by + (independent ? ' (independent)' : '') + ' · checks pass'; }
        return { conclusion, detail, rigor, autosPass, attested, independent, att, rows };
    }

    // --------------------------------------------------- attestation action
    async function vvAttest(scopeKey, reqKey) {
        const set = vvSets().find(s => s.scope === scopeKey);
        const r = set && (set.reqs || []).find(x => _key(x) === String(reqKey));
        if (!r) return;
        const st = _store();
        if (st[String(reqKey)] && st[String(reqKey)].by) {
            if (confirm('Withdraw the validation attestation on ' + (r.id || r.traceId || reqKey) + '?')) {
                delete st[String(reqKey)];
                if (r.valArtifact && /^VAL-CHK/.test(r.valArtifact)) delete r.valArtifact;
                if (typeof saveState === 'function') saveState();
                renderValMatrix();
            }
            return;
        }
        const c0 = reqValConclusion(r, set);
        if (!c0.autosPass && !confirm('Correctness checks are FAILING on this requirement. Signing now records the attestation but the conclusion stays FLAGGED. Continue?')) return;
        const by = window.prompt('Attest correctness of ' + (r.id || r.traceId || reqKey) + ' — signature (name):', '');
        if (!by || !by.trim()) return;
        let independent = false;
        if (c0.rigor.level === 'independent')
            independent = confirm('This requirement ' + c0.rigor.why + ' — independence of the validator is demanded.\n\nOK = I did not author this requirement (independent)\nCancel = record without the independence claim');
        st[String(reqKey)] = { by: by.trim(), at: new Date().toISOString(), independent };
        // Record the evidence reference on the row itself (elicited act, signed
        // above) — the 4754B objectives matrix reads it as validation evidence.
        if (reqValConclusion(r, set).conclusion === 'valid') r.valArtifact = 'VAL-CHK ' + new Date().toISOString().slice(0, 10);
        if (typeof saveState === 'function') saveState();
        renderValMatrix();
    }

    // ------------------------------------------------ completeness per set
    // The §5.4.4 idea, originally worded: a requirement can be individually
    // pristine while the SET is wrong by omission.
    function vvSetCompleteness(set) {
        const checks = [];
        const push = (id, label, pass, detail) => checks.push({ id, label, pass, detail });
        const reqs = set.reqs || [];
        const traceSet = new Set();
        reqs.forEach(r => (Array.isArray(r.traceIds) ? r.traceIds : (r.traceId ? [r.traceId] : [])).forEach(t => traceSet.add(t)));

        // 1. every severe condition in scope carries at least one requirement
        const fcs = set.scope === 'aircraft'
            ? ((typeof acFhaData !== 'undefined' && acFhaData) || [])
            : ((set.sys && set.sys.fha) || []);
        const severe = fcs.filter(f => (_SEV_RANK[f.severity] || 0) >= 2);
        const uncovered = severe.filter(f => !traceSet.has(f.fcId) && !traceSet.has(String(f.internalId)));
        push('coverage', 'Every Major-or-worse condition has a requirement', severe.length === 0 || uncovered.length === 0,
            severe.length ? (uncovered.length ? uncovered.map(f => f.fcId).join(', ') + ' uncovered of ' + severe.length : severe.length + ' condition(s) all covered') : 'no Major+ conditions in scope');

        // 2. every derived requirement justifies its existence
        const derived = reqs.filter(r => (r.level || '') === 'Derived' || r.derivationType);
        const bare = derived.filter(r => !(r.rat || '').trim());
        push('derived', 'Derived requirements carry rationale', bare.length === 0,
            derived.length ? (bare.length ? bare.length + ' of ' + derived.length + ' without rationale' : derived.length + ' derived, all justified') : 'no derived requirements');

        // 3. assumptions routed to the requirements lane are dispositioned
        const asms = set.scope === 'aircraft'
            ? ((typeof acAssumptionsData !== 'undefined' && acAssumptionsData) || [])
            : ((set.sys && set.sys.asm) || []);
        const routed = asms.filter(a => /req/i.test(a.routeTo || ''));
        const undisposed = routed.filter(a => (a.state || 'proposed') === 'proposed');
        push('assumptions', 'Requirement-routed assumptions dispositioned', undisposed.length === 0,
            routed.length ? (undisposed.length ? undisposed.length + ' of ' + routed.length + ' still proposed' : routed.length + ' routed, all dispositioned') : 'none routed to requirements');

        // 4. no requirement in the set fails its own correctness checks
        const failing = reqs.filter(r => !reqValChecklist(r, set).every(x => x.pass));
        push('correctness', 'No requirement fails correctness checks', failing.length === 0,
            reqs.length ? (failing.length ? failing.length + ' of ' + reqs.length + ' with failing checks' : reqs.length + ' requirement(s) clean') : 'set is empty');

        // 5. every high-rigor requirement carries its owed attestation
        const owed = reqs.filter(r => { const c = reqValConclusion(r, set); return c.conclusion === 'awaiting' || c.conclusion === 'flagged'; });
        push('rigor', 'Severity-scaled attestations in place', owed.length === 0,
            owed.length ? owed.length + ' requirement(s) awaiting or flagged' : 'all attestation demands met');

        const pass = checks.every(c => c.pass);
        return { scope: set.scope, name: set.name, checks, pass, reqCount: reqs.length };
    }

    // Program-wide roll-up (drives the PSSA gate item and evidence package).
    function vvProgramPosture() {
        const sets = vvSets().map(s => vvSetCompleteness(s));
        const reqs = vvSets().flatMap(s => (s.reqs || []).map(r => reqValConclusion(r, s)));
        const n = c => reqs.filter(x => x.conclusion === c).length;
        return { sets, total: reqs.length, valid: n('valid'), awaiting: n('awaiting'), flagged: n('flagged'), open: n('open'),
            setsPassing: sets.filter(s => s.pass).length };
    }

    // --------------------------------------------------------------- page
    window._vvValScope = window._vvValScope || 'aircraft';
    window.vvValSetScope = function (s) { window._vvValScope = s; renderValMatrix(); };

    const _CHIP_STYLE = { valid: ['#1D6E3E', 'rgba(52,199,89,0.13)'], awaiting: ['#9A6200', 'rgba(255,149,0,0.12)'],
        flagged: ['#8E2A2A', 'rgba(255,59,48,0.12)'], open: ['var(--color-text-tertiary)', 'var(--color-surface-2)'] };
    const _stamp = (txt, kind) => { const [fg, bg] = _CHIP_STYLE[kind] || _CHIP_STYLE.open;
        return '<span style="display:inline-block; padding:2px 8px; font-size:10px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:' + fg + '; background:' + bg + '; border-radius:var(--r-full);">' + _esc(txt) + '</span>'; };

    function renderValMatrix() {
        const host = document.getElementById('val-matrix-host');
        if (!host) return;
        const sets = vvSets();
        if (!sets.some(s => s.scope === window._vvValScope)) window._vvValScope = 'aircraft';
        const set = sets.find(s => s.scope === window._vvValScope) || sets[0];
        const posture = vvProgramPosture();

        let html = '<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:14px;">' + sets.map(s => {
            const active = s.scope === set.scope;
            return '<button onclick="vvValSetScope(\'' + _esc(s.scope) + '\')" style="border:1px solid var(--color-border-hair); border-radius:999px; padding:4px 12px; font-size:12px; cursor:pointer;' +
                (active ? ' background:var(--color-accent, #3b82f6); color:#fff;' : ' background:var(--color-surface-2); color:var(--color-text-secondary);') + '">' +
                _esc(s.name) + ' (' + (s.reqs || []).length + ')</button>';
        }).join('') + '</div>';

        const tile = (lbl, val, sub) => '<div style="border:1px solid var(--color-border-hair); border-radius:10px; padding:12px 14px; background:var(--color-surface-1);">' +
            '<div style="font-size:11px; color:var(--color-text-tertiary); text-transform:uppercase; letter-spacing:0.05em;">' + lbl + '</div>' +
            '<div style="font-size:24px; font-weight:700; margin-top:2px;">' + val + '</div>' +
            (sub ? '<div style="font-size:11px; color:var(--color-text-tertiary);">' + sub + '</div>' : '') + '</div>';
        html += '<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:16px;">' +
            tile('Requirements (program)', posture.total, posture.valid + ' valid · ' + posture.awaiting + ' awaiting · ' + posture.flagged + ' flagged') +
            tile('Sets complete', posture.setsPassing + '/' + posture.sets.length, 'per-set completeness') +
            tile('Attestations owed', posture.awaiting, 'severity-scaled rigor') +
            tile('Flagged', posture.flagged, 'signature over a failing check') + '</div>';

        // ---- the set's completeness panel ----
        const comp = vvSetCompleteness(set);
        html += '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-bottom:18px;">' +
            '<div style="padding:9px 14px; border-bottom:2px solid var(--color-text-primary); display:flex; justify-content:space-between; align-items:center;">' +
            '<b>Set completeness — ' + _esc(comp.name) + '</b>' + _stamp(comp.pass ? 'COMPLETE' : 'INCOMPLETE', comp.pass ? 'valid' : 'awaiting') + '</div>' +
            '<table class="data-table" style="width:100%; font-size:12.5px;"><tbody>' +
            comp.checks.map(c => '<tr><td style="width:26px; text-align:center;">' + (c.pass ? '✓' : '✗') + '</td>' +
                '<td>' + _esc(c.label) + '</td><td style="color:var(--color-text-secondary);">' + _esc(c.detail) + '</td></tr>').join('') +
            '</tbody></table></div>';

        // ---- per-requirement matrix ----
        if (!(set.reqs || []).length) {
            html += '<p style="color:var(--color-text-tertiary); font-size:13px;">No requirements in this set yet.</p>';
        } else {
            html += '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr>' +
                '<th>Requirement</th><th>Traces</th><th>Rigor</th>' +
                LINTS.map(l => '<th style="font-size:10px;">' + _esc(l.label) + '</th>').join('') +
                '<th>Attestation</th><th>Conclusion</th></tr></thead><tbody>';
            (set.reqs || []).forEach(r => {
                const c = reqValConclusion(r, set);
                html += '<tr><td><b>' + _esc(r.id || r.traceId || ('#' + r.internalId)) + '</b><br><span style="font-size:11px; color:var(--color-text-secondary);">' + _esc((r.text || '').slice(0, 90)) + ((r.text || '').length > 90 ? '…' : '') + '</span></td>' +
                    '<td class="u-mono" style="font-size:11px;">' + _esc((Array.isArray(r.traceIds) ? r.traceIds : (r.traceId ? [r.traceId] : [])).join(', ') || '—') +
                    (c.rigor.worst && c.rigor.worst !== '—' ? '<br><span style="font-size:10px; color:var(--color-text-tertiary);">' + _esc(c.rigor.worst) + '</span>' : '') + '</td>' +
                    '<td style="font-size:11px;">' + _esc(c.rigor.label) + '</td>' +
                    c.rows.map(x => '<td style="text-align:center;" title="' + _esc(x.detail) + '">' +
                        (x.pass ? '✓' : '<span style="color:#8E2A2A; font-weight:700;">✗</span>') + '</td>').join('') +
                    '<td>' + (c.attested
                        ? '<span style="font-size:11px;">' + _esc(c.att.by) + (c.independent ? ' <span title="independence claimed">⚖</span>' : '') + '</span> <a href="#" style="font-size:10px;" onclick="vvAttest(\'' + _esc(set.scope) + '\',\'' + _esc(_key(r)) + '\'); return false;">withdraw</a>'
                        : (c.rigor.level === 'basic' ? '<span style="font-size:11px; color:var(--color-text-tertiary);">not demanded</span>'
                            : '<button class="ckpt-m-btn" style="font-size:10.5px; padding:1px 8px;" onclick="vvAttest(\'' + _esc(set.scope) + '\',\'' + _esc(_key(r)) + '\')">attest…</button>')) + '</td>' +
                    '<td title="' + _esc(c.detail) + '">' + _stamp(c.conclusion.toUpperCase(), c.conclusion) + '</td></tr>';
            });
            html += '</tbody></table>';
        }
        html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">Validation asks whether the requirement is RIGHT; verification (V&amp;V roll-up) asks whether it is MET. ' +
            'Lints are computed — a signature never overrides a failing check (it renders FLAGGED instead). Rigor scales with the worst traced severity: Cat/Haz ⇒ independent attestation, Major ⇒ attestation, below ⇒ automatic checks.</p>';
        host.innerHTML = html;
    }

    // -------------------------------------- runtime graft 1: the PSSA gate
    (function graftGate() {
        try {
            if (typeof CKPT_CHECKLISTS === 'undefined' || !Array.isArray(CKPT_CHECKLISTS.PSSA)) return;
            if (CKPT_CHECKLISTS.PSSA.some(i => i.id === 'val')) return;
            CKPT_CHECKLISTS.PSSA.push({
                id: 'val', kind: 'auto', ref: '§5.4',
                label: 'Requirement sets validated (correctness + completeness)',
                eval: () => {
                    const p = vvProgramPosture();
                    if (!p.total) return { pass: false, detail: 'no requirements to validate' };
                    const bad = p.flagged + p.open + p.awaiting;
                    return { pass: p.setsPassing === p.sets.length && bad === 0,
                        detail: p.valid + '/' + p.total + ' valid · ' + p.setsPassing + '/' + p.sets.length + ' sets complete' + (p.flagged ? ' · ' + p.flagged + ' FLAGGED' : '') };
                },
            });
        } catch (_) {}
    })();

    // ------------------------- runtime graft 2: golden-thread gap annotation
    (function wrapGaps() {
        if (typeof window._gtvReportGaps !== 'function' || window._gtvReportGaps._vvValWrapped) return;
        const orig = window._gtvReportGaps;
        const wrapped = function () {
            let out = orig.apply(this, arguments);
            try {
                const p = vvProgramPosture();
                const owed = p.awaiting + p.flagged;
                if (owed) out += ' ' + owed + ' requirement(s) not yet validated at the rigor their severity demands — the thread ends on requirements whose correctness is unconfirmed.';
            } catch (_) {}
            return out;
        };
        wrapped._vvValWrapped = true;
        window._gtvReportGaps = wrapped;
    })();

    // ------------------------------------------------- navigation wrapper
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._vvValWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-val-matrix');
                if (v) v.style.display = (tabId === 'val-matrix') ? 'block' : 'none';
                const s = document.getElementById('snav-val-matrix');
                if (s) s.classList.toggle('snav-active', tabId === 'val-matrix');
                if (tabId === 'val-matrix') renderValMatrix();
            } catch (_) {}
            return r;
        };
        wrapped._vvValWrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------ exports
    window.reqValChecklist = reqValChecklist;
    window.reqValConclusion = reqValConclusion;
    window.vvSetCompleteness = vvSetCompleteness;
    window.vvProgramPosture = vvProgramPosture;
    window.vvSets = vvSets;
    window.vvRigor = vvRigor;
    window.vvAttest = vvAttest;
    window.renderValMatrix = renderValMatrix;
})();
