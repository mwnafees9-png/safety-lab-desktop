// problem_reports.js — Phase P2: Problem Reports / OPRs.
// The open-problem-report lifecycle the certification close-out demands:
// nothing ships with an unexplained open problem, and deferral is a SIGNED
// act with a rationale — never a quiet backlog.
//
// BORN MODULAR: new file, zero monolith source edits. Two runtime grafts,
// both in the established discipline:
//   · the SSA completion gate's 'Problem reports addressed' item (E.4.d) is
//     upgraded at load from kind:'planned' (parked) to a REAL auto evaluation
//     — open safety-related PRs block the gate;
//   · the golden-thread gaps line learns to call out open safety-related PRs.
//
// Lifecycle: open → analyzed → corrective-action → verified → closed,
// plus 'deferred' (signed rationale + review-by marker, always visible).
// Every state advance is signed and appended to the PR's history.
// Deterministic automation: FRACAS findings raise PRs in one idempotent sweep.

(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    function _toast(m, k, t) { try { if (typeof showToast === 'function') showToast(m, k || 'info', t || 3000); } catch (_) {} }
    async function _ask(msg, dflt) {
        try { if (typeof slPrompt === 'function') return await slPrompt(msg, dflt || ''); } catch (_) {}
        return window.prompt(msg, dflt || '');
    }
    function _store() {
        if (!Array.isArray(projectConfig.problemReports)) projectConfig.problemReports = [];
        return projectConfig.problemReports;
    }
    function _save() { try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {} }
    function _nextId() {
        const n = (projectConfig.prCounter || 0) + 1;
        projectConfig.prCounter = n;
        return 'PR-' + String(n).padStart(3, '0');
    }

    const STATES = ['open', 'analyzed', 'corrective-action', 'verified', 'closed'];
    const SOURCES = ['analysis', 'test', 'review', 'field/FRACAS', 'audit', 'other'];

    // ------------------------------------------------------------- queries
    function prRows() { return _store().slice(); }
    function prOpenSafety() {
        return _store().filter(p => p.safetyRelated && p.state !== 'closed' && p.state !== 'deferred');
    }
    function prStats() {
        const all = _store();
        return {
            total: all.length,
            open: all.filter(p => p.state !== 'closed' && p.state !== 'deferred').length,
            openSafety: prOpenSafety().length,
            deferred: all.filter(p => p.state === 'deferred').length,
            closed: all.filter(p => p.state === 'closed').length,
        };
    }

    // ------------------------------------------------------------- actions
    async function prAdd() {
        const title = await _ask('Problem title (what is wrong):'); if (!title || !title.trim()) return;
        const desc = (await _ask('Description — observed behavior, conditions, evidence:', '')) || '';
        const safety = /^y/i.test(((await _ask('Safety-related? (y/n) — does it touch a safety requirement, analysis result, or protective function:', 'y')) || '').trim());
        const src = (await _ask('Source — ' + SOURCES.join(' / ') + ':', 'analysis')) || 'analysis';
        const linked = (await _ask('Linked artifact (FC id, requirement id, basic event, tree — optional):', '')) || '';
        const by = (await _ask('Raised by (name):', '')) || '';
        if (!by.trim()) return;
        const now = new Date().toISOString();
        _store().push({
            id: _nextId(), title: title.trim(), description: desc.trim(),
            safetyRelated: safety, source: src.trim(), linked: linked.trim(),
            state: 'open', raisedBy: by.trim(), raisedAt: now,
            history: [{ state: 'open', by: by.trim(), at: now, note: 'raised' }],
            deferral: null, disposition: '',
        });
        _save(); renderPrPage();
    }
    async function prAdvance(id) {
        const p = _store().find(x => x.id === id); if (!p) return;
        if (p.state === 'closed') { _toast('Already closed — reopen instead if the problem recurred.', 'info'); return; }
        const cur = p.state === 'deferred' ? 'open' : p.state;
        const next = STATES[Math.min(STATES.indexOf(cur) + 1, STATES.length - 1)];
        const note = (await _ask('Advance ' + p.id + ' → "' + next + '". Evidence / disposition note:', p.disposition || '')) || '';
        const by = (await _ask('Sign with your name:', '')) || '';
        if (!by.trim()) return;
        p.state = next;
        if (note.trim()) p.disposition = note.trim();
        p.deferral = null;
        p.history.push({ state: next, by: by.trim(), at: new Date().toISOString(), note: note.trim() });
        _save(); renderPrPage();
    }
    async function prDefer(id) {
        const p = _store().find(x => x.id === id); if (!p) return;
        if (p.state === 'closed') return;
        const rationale = (await _ask('DEFERRAL is a signed act, not a backlog. Rationale (why is it acceptable to fly/proceed with this open):', '')) || '';
        if (!rationale.trim()) return;
        const until = (await _ask('Review by (milestone or date):', 'next baseline')) || 'next baseline';
        const by = (await _ask('Sign with your name:', '')) || '';
        if (!by.trim()) return;
        p.state = 'deferred';
        p.deferral = { rationale: rationale.trim(), until: until.trim(), by: by.trim(), at: new Date().toISOString() };
        p.history.push({ state: 'deferred', by: by.trim(), at: p.deferral.at, note: rationale.trim() + ' · review by ' + until.trim() });
        _save(); renderPrPage();
    }
    async function prReopen(id) {
        const p = _store().find(x => x.id === id); if (!p) return;
        const by = (await _ask('Reopen ' + p.id + '. Sign with your name:', '')) || '';
        if (!by.trim()) return;
        p.state = 'open'; p.deferral = null;
        p.history.push({ state: 'open', by: by.trim(), at: new Date().toISOString(), note: 'reopened' });
        _save(); renderPrPage();
    }
    // Deterministic automation: every FRACAS FINDING without a PR raises one.
    function prFromFracas(apply) {
        if (typeof window.ramFieldRows !== 'function') return [];
        const have = new Set(_store().map(p => p.fracasId).filter(Boolean));
        const proposals = [];
        window.ramFieldRows().forEach(x => {
            if (x.verdict !== 'finding' || have.has(x.f.id)) return;
            proposals.push({
                fracasId: x.f.id,
                title: 'Field reliability below prediction — ' + (x.hit ? (x.hit.node.displayId || x.f.beRef) : x.f.beRef),
                description: 'FRACAS finding: observed MTBF challenges the model prediction (' + (x.predicted != null ? Math.round(x.predicted).toLocaleString() + ' h predicted' : 'prediction n/a') + '). Reopen the prediction or fix the design/process cause.',
                linked: x.f.beRef,
            });
        });
        if (apply && proposals.length) {
            const now = new Date().toISOString();
            proposals.forEach(pr => _store().push({
                id: _nextId(), title: pr.title, description: pr.description,
                safetyRelated: true, source: 'field/FRACAS', linked: pr.linked, fracasId: pr.fracasId,
                state: 'open', raisedBy: 'derived: FRACAS lane', raisedAt: now,
                history: [{ state: 'open', by: 'derived: FRACAS lane', at: now, note: 'auto-raised from a FRACAS finding' }],
                deferral: null, disposition: '',
            }));
            _save();
        }
        return proposals;
    }

    // --------------------------------------------------------------- render
    const _stamp = (s) => {
        const C = { open: '#8E2A2A', analyzed: '#9A6200', 'corrective-action': '#9A6200', verified: '#3D5A80', closed: '#1D6E3E', deferred: '#5B4FA8' };
        return '<span style="font-family:var(--font-mono); font-size:10.5px; font-weight:600; letter-spacing:0.05em; padding:3px 7px; color:' + (C[s] || '#45464A') + '; background:' + (C[s] || '#45464A') + '1A; box-shadow:inset 0 0 0 1.5px currentColor; white-space:nowrap;">' + _esc(s.toUpperCase()) + '</span>';
    };
    function renderPrPage() {
        const host = document.getElementById('pr-host');
        if (!host) return;
        const st = prStats();
        const fracasProposals = prFromFracas(false).length;
        let html = '<div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">' +
            ['Total <b style="margin-left:6px;">' + st.total + '</b>',
             'Open <b style="margin-left:6px;' + (st.open ? ' color:#8E2A2A;' : '') + '">' + st.open + '</b>',
             'Open safety-related <b style="margin-left:6px;' + (st.openSafety ? ' color:#8E2A2A;' : ' color:#1D6E3E;') + '">' + st.openSafety + '</b>',
             'Deferred (signed) <b style="margin-left:6px;">' + st.deferred + '</b>',
             'Closed <b style="margin-left:6px;">' + st.closed + '</b>']
            .map(c => '<div style="height:32px; display:inline-flex; align-items:center; padding:0 12px; border:1px solid var(--color-border-strong); font-family:var(--font-mono); font-size:12px;">' + c + '</div>').join('') + '</div>';

        html += '<div style="margin:0 0 12px;"><button class="btn-cyan" onclick="prAdd()">+ Raise problem report</button> ' +
            '<button class="btn-cyan" onclick="const n = prFromFracas(true).length; showToast(n ? n + \' PR(s) raised from FRACAS findings.\' : \'No unraised FRACAS findings.\', \'info\', 3500); renderPrPage();">⚙ Raise from FRACAS findings' + (fracasProposals ? ' (' + fracasProposals + ')' : '') + '</button> ' +
            '<span style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">open safety-related PRs BLOCK the SSA gate (E.4.d) · deferral is a signed rationale, always visible</span></div>';

        html += '<table class="data-table" style="width:100%; font-size:12.5px;"><thead><tr>' +
            '<th style="width:70px">PR</th><th>Problem</th><th style="width:64px">Safety</th><th style="width:100px">Source</th><th style="width:120px">Linked</th><th style="width:130px">State</th><th>Disposition / deferral</th><th style="width:150px"></th></tr></thead><tbody>';
        const rows = _store();
        if (!rows.length) html += '<tr><td colspan="8" style="color:var(--color-text-tertiary);">No problem reports. A mature program has closed ones — an empty register late in development is a smell, not a virtue.</td></tr>';
        rows.slice().reverse().forEach(p => {
            const hist = (p.history || []).map(h => h.at.slice(0, 10) + ' ' + h.state + ' · ' + h.by + (h.note ? ' — ' + h.note : '')).join('\n');
            html += '<tr><td class="u-mono" title="' + _esc(hist) + '">' + _esc(p.id) + '</td>' +
                '<td><b>' + _esc(p.title) + '</b>' + (p.description ? '<br><span style="font-size:11.5px; color:var(--color-text-secondary);">' + _esc(p.description.slice(0, 160)) + (p.description.length > 160 ? '…' : '') + '</span>' : '') + '</td>' +
                '<td>' + (p.safetyRelated ? '<span style="color:#8E2A2A; font-family:var(--font-mono); font-size:11px; font-weight:600;">YES</span>' : '<span style="color:var(--color-text-tertiary); font-size:11px;">no</span>') + '</td>' +
                '<td style="font-size:11.5px;">' + _esc(p.source) + (p.raisedBy && /derived/.test(p.raisedBy) ? ' <span style="font-size:9px; font-family:var(--font-mono); border:1px solid currentColor; padding:0 3px; color:var(--color-text-tertiary);">AUTO</span>' : '') + '</td>' +
                '<td class="u-mono" style="font-size:11px;">' + _esc(p.linked || '—') + '</td>' +
                '<td>' + _stamp(p.state) + '</td>' +
                '<td style="font-size:11.5px; color:var(--color-text-secondary);">' +
                (p.state === 'deferred' && p.deferral
                    ? 'DEFERRED — ' + _esc(p.deferral.rationale) + ' · review by ' + _esc(p.deferral.until) + ' · signed ' + _esc(p.deferral.by)
                    : _esc(p.disposition || '—')) + '</td>' +
                '<td>' + (p.state === 'closed'
                    ? '<a href="#" style="font-size:11px;" onclick="prReopen(\'' + p.id + '\'); return false;">reopen</a>'
                    : '<button class="ckpt-m-btn" style="font-size:10.5px; padding:1px 7px;" onclick="prAdvance(\'' + p.id + '\')">advance →</button> ' +
                      (p.state !== 'deferred' ? '<button class="ckpt-m-btn" style="font-size:10.5px; padding:1px 7px;" onclick="prDefer(\'' + p.id + '\')" title="signed deferral with rationale">defer…</button>' : '<a href="#" style="font-size:11px;" onclick="prReopen(\'' + p.id + '\'); return false;">reopen</a>')) + '</td></tr>';
        });
        html += '</tbody></table>' +
            '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">Lifecycle: open → analyzed → corrective-action → verified → closed. Every advance is signed and appended to the PR history (hover the id). FRACAS findings can auto-raise PRs — the loop from field data to corrective action, closed.</p>';
        host.innerHTML = html;
    }

    // ------------------------------- runtime graft 1: the SSA gate (E.4.d)
    // The monolith ships this item as kind:'planned' (parked). With the module
    // present it becomes a REAL evaluation — done at load, zero source edits.
    (function upgradeSsaGate() {
        try {
            if (typeof CKPT_CHECKLISTS === 'undefined' || !CKPT_CHECKLISTS.SSA) return;
            const item = CKPT_CHECKLISTS.SSA.find(i => i.id === 'prs');
            if (!item) return;
            item.kind = 'auto';
            delete item.tag;
            item.label = 'Problem reports addressed (no open safety-related PRs)';
            item.eval = () => {
                const st = prStats();
                if (!st.total) return { pass: true, detail: 'no PRs raised (register empty)' };
                return { pass: st.openSafety === 0, detail: st.openSafety + ' open safety-related · ' + st.deferred + ' deferred (signed) · ' + st.closed + ' closed of ' + st.total };
            };
        } catch (_) {}
    })();

    // ------------------- runtime graft 2: golden-thread gaps mention open PRs
    (function wrapGaps() {
        if (typeof window._gtvReportGaps !== 'function' || window._gtvReportGaps._prWrapped) return;
        const orig = window._gtvReportGaps;
        const wrapped = function () {
            let out = orig.apply(this, arguments);
            try {
                const n = prOpenSafety().length;
                if (n) out += ' ' + n + ' open safety-related problem report(s) — the threads stand on analyses these problems challenge.';
            } catch (_) {}
            return out;
        };
        wrapped._prWrapped = true;
        window._gtvReportGaps = wrapped;
    })();

    // ------------------------------------------------- navigation wrapper
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._prWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-pr');
                if (v) v.style.display = (tabId === 'pr') ? 'block' : 'none';
                const s = document.getElementById('snav-pr');
                if (s) s.classList.toggle('snav-active', tabId === 'pr');
                if (tabId === 'pr') renderPrPage();
            } catch (_) {}
            return r;
        };
        wrapped._prWrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------ exports
    window.renderPrPage = renderPrPage;
    window.prAdd = prAdd;
    window.prAdvance = prAdvance;
    window.prDefer = prDefer;
    window.prReopen = prReopen;
    window.prFromFracas = prFromFracas;
    window.prStats = prStats;
    window.prRows = prRows;
    window.prOpenSafety = prOpenSafety;
})();
