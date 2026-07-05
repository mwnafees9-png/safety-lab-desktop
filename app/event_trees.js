// ============================================================================
// event_trees.js — v1.0 — C4: Event Tree Analysis. Sequence-consequence
// arithmetic, deterministic, reconciled against the FHA.
//
// An event tree: an INITIATOR (with a user-entered frequency) passes through
// ordered BARRIERS (each with a user-entered failure probability). Every
// success/failure path is enumerated — 2^n outcomes — with its probability
// as the exact product along the path. The user assigns each outcome a
// consequence severity and may link it to a failure condition.
//
// THE DUAL-LANE RECONCILE: an outcome linked to an FC whose computed
// sequence severity disagrees with the FHA classification is a FINDING —
// either the tree's consequence call or the hazard classification is wrong,
// and the machine won't pick for you. INV-27 (advisory) names each one.
// Path probabilities always sum to 1.0 × initiator frequency — checked on
// every evaluation, because arithmetic that can't audit itself is opinion.
//
// Numbers are USER-ENTERED (frequencies, barrier failure probabilities) —
// consistent with the no-licensed-data, no-derived-guesses house rules.
// Prints via REG §11d. Page: Trees & models → Event Trees.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}; }
    function _store() { const pc = _pc(); if (!Array.isArray(pc.eventTrees)) pc.eventTrees = []; return pc.eventTrees; }
    function _jr(k, m) { try { if (typeof window.jrnl === 'function') window.jrnl(k, m); } catch (_) {} }
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }
    const SEVS = ['No Safety Effect', 'Minor', 'Major', 'Hazardous', 'Catastrophic'];

    // ------------------------------------------------------------ evaluation
    // outcomes: every success/failure combination over the ordered barriers.
    // key = bitstring, bit i set ⇒ barrier i FAILED.
    function etaEvaluate(tree) {
        const bars = tree.barriers || [];
        const freq = parseFloat(tree.initiator && tree.initiator.freq) || 0;
        const n = bars.length;
        const outcomes = [];
        let sum = 0;
        for (let mask = 0; mask < (1 << n); mask++) {
            let p = 1;
            const seq = [];
            for (let i = 0; i < n; i++) {
                const pf = Math.min(1, Math.max(0, parseFloat(bars[i].pFail) || 0));
                if (mask & (1 << i)) { p *= pf; seq.push(bars[i].name + ' FAILS'); }
                else { p *= (1 - pf); seq.push(bars[i].name + ' holds'); }
            }
            sum += p;
            const key = mask.toString(2).padStart(Math.max(n, 1), '0');
            const c = (tree.consequences || {})[key] || {};
            outcomes.push({ key, seq, prob: p, freq: p * freq, severity: c.severity || '', linkedFcId: c.linkedFcId || '', note: c.note || '' });
        }
        // arithmetic that audits itself: path probabilities must sum to 1
        const closed = Math.abs(sum - 1) < 1e-9;
        return { outcomes, freq, closed, sum };
    }

    function _fcSeverity(fcId) {
        const ac = (typeof acFhaData !== 'undefined' ? acFhaData : []) || [];
        let f = ac.find(x => x && x.fcId === fcId);
        if (!f) {
            (((typeof systemsData !== 'undefined' ? systemsData : []) || [])).some(s => { f = (s.fha || []).find(x => x && x.fcId === fcId); return !!f; });
        }
        return f ? (f.severity || '') : null;
    }

    function etaFindings() {
        const out = [];
        _store().forEach(t => {
            const ev = etaEvaluate(t);
            if (!ev.closed) out.push({ tree: t.id, kind: 'arithmetic', detail: 'path probabilities sum to ' + ev.sum.toPrecision(6) + ' ≠ 1 — barrier probability out of range' });
            ev.outcomes.forEach(o => {
                if (!o.linkedFcId || !o.severity) return;
                const fhaSev = _fcSeverity(o.linkedFcId);
                if (fhaSev === null) { out.push({ tree: t.id, kind: 'dangling', detail: 'outcome ' + o.key + ' links ' + o.linkedFcId + ' which resolves to no FHA row' }); return; }
                if (fhaSev !== o.severity) out.push({
                    tree: t.id, kind: 'severity-conflict',
                    detail: 'outcome ' + o.key + ' (' + o.seq.join(' → ') + ') assessed ' + o.severity + ' but ' + o.linkedFcId + ' is classified ' + fhaSev + ' in the FHA — one of them is wrong; the machine will not pick',
                });
            });
        });
        return out;
    }

    // ------------------------------------------------------------ mutations
    window.etaCreate = function (name, initDesc, freq, by) {
        if (!String(name || '').trim() || !String(by || '').trim()) return { ok: false, err: 'Name and signature are required.' };
        const f = parseFloat(freq);
        if (!(f > 0)) return { ok: false, err: 'Initiator frequency must be a positive number (your value, per flight hour).' };
        const id = 'ET-' + String(_store().length + 1).padStart(3, '0');
        _store().push({ id, name: String(name).trim(), initiator: { desc: String(initDesc || '').trim(), freq: f }, barriers: [], consequences: {}, by: String(by).trim(), at: new Date().toISOString() });
        _jr('eta', id + ' created: ' + name + ' (initiator ' + f + '/FH) — signed ' + by);
        _save();
        return { ok: true, id };
    };
    window.etaAddBarrier = function (treeId, name, pFail, note) {
        const t = _store().find(x => x.id === treeId);
        if (!t) return { ok: false, err: 'Tree not found.' };
        const p = parseFloat(pFail);
        if (!(p >= 0 && p <= 1)) return { ok: false, err: 'Barrier failure probability must be in [0, 1] (your value).' };
        if (!String(name || '').trim()) return { ok: false, err: 'Barrier name required.' };
        t.barriers.push({ name: String(name).trim(), pFail: p, note: String(note || '').trim() });
        t.consequences = {};   // outcome keys change shape — assessments must be redone deliberately
        _jr('eta', treeId + ': + barrier "' + name + '" (pFail ' + p + ') — outcome set regenerated, consequence calls reset');
        _save();
        return { ok: true };
    };
    window.etaAssess = function (treeId, key, severity, linkedFcId, note, by) {
        const t = _store().find(x => x.id === treeId);
        if (!t) return { ok: false, err: 'Tree not found.' };
        if (SEVS.indexOf(severity) < 0) return { ok: false, err: 'Unknown severity.' };
        if (!String(by || '').trim()) return { ok: false, err: 'A signature is required.' };
        t.consequences[key] = { severity, linkedFcId: String(linkedFcId || '').trim(), note: String(note || '').trim(), by: String(by).trim(), at: new Date().toISOString() };
        _jr('eta', treeId + ' outcome ' + key + ' assessed ' + severity + (linkedFcId ? ' → ' + linkedFcId : '') + ' — signed ' + by);
        _save();
        return { ok: true };
    };

    // INV-27 (advisory)
    (function register() {
        function reg() {
            if (typeof window.invRegister !== 'function') return false;
            window.invRegister({
                id: 'INV-27', name: 'Event-tree outcomes agree with the FHA classifications they link (and their arithmetic closes)', sev: 'advisory',
                run: () => {
                    const f = etaFindings();
                    let checked = 0;
                    _store().forEach(t => { checked += 1 + Object.keys(t.consequences || {}).length; });
                    return { checked, fails: f.map(x => x.tree + ' [' + x.kind + ']: ' + x.detail) };
                }
            });
            return true;
        }
        if (!reg()) { let tries = 20; const t = setInterval(() => { if (reg() || --tries <= 0) clearInterval(t); }, 300); }
    })();

    // ------------------------------------------------------------- the page
    function _render() {
        const host = document.getElementById('eta-host');
        if (!host) return;
        const F = 'font-size:11.5px; padding:4px 8px; border:1px solid var(--color-border-strong); background:var(--color-surface-2); color:var(--color-text-primary);';
        let html = '<div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:14px;">' +
            '<input id="eta-name" placeholder="Tree name" style="' + F + ' width:180px;">' +
            '<input id="eta-init" placeholder="Initiating event" style="' + F + ' width:220px;">' +
            '<input id="eta-freq" placeholder="freq /FH (your value)" style="' + F + ' width:150px;">' +
            '<input id="eta-by" placeholder="Signature" style="' + F + ' width:120px;">' +
            '<button class="ckpt-m-btn ckpt-m-btn-primary" style="font-size:11.5px; padding:4px 12px;" onclick="_etaCreateUi()">+ Event tree</button>' +
            '<span id="eta-err" style="color:var(--color-danger); font-size:11px; font-weight:600;"></span></div>';
        _store().forEach(t => {
            const ev = etaEvaluate(t);
            html += '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-bottom:14px;">' +
                '<div style="padding:8px 14px; border-bottom:1px solid var(--color-border-strong);"><b style="font-size:12.5px;">' + _esc(t.id) + ' — ' + _esc(t.name) + '</b>' +
                ' <span class="u-mono" style="font-size:11px; color:var(--color-text-tertiary);">' + _esc(t.initiator.desc || '') + ' @ ' + t.initiator.freq + '/FH · ' + (t.barriers || []).length + ' barrier(s) · Σp ' + (ev.closed ? '= 1 ✓' : '≠ 1 ✗') + '</span></div>' +
                '<div style="padding:8px 14px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">' +
                '<input id="etb-name-' + t.id + '" placeholder="Barrier (e.g. Crew response)" style="' + F + ' width:200px;">' +
                '<input id="etb-p-' + t.id + '" placeholder="pFail (your value)" style="' + F + ' width:130px;">' +
                '<button class="ckpt-m-btn" style="font-size:11px; padding:3px 10px;" onclick="_etaBarUi(\'' + t.id + '\')">+ barrier</button></div>';
            if ((t.barriers || []).length) {
                html += '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr><th>Path</th><th>Sequence</th><th>P(path)</th><th>Freq (/FH)</th><th>Severity call</th><th>Linked FC</th><th></th></tr></thead><tbody>' +
                    ev.outcomes.map(o => '<tr><td class="u-mono">' + o.key + '</td>' +
                        '<td style="font-size:11px;">' + o.seq.map(_esc).join(' → ') + '</td>' +
                        '<td class="u-mono" style="font-size:11px;">' + o.prob.toExponential(3) + '</td>' +
                        '<td class="u-mono" style="font-size:11px;">' + o.freq.toExponential(3) + '</td>' +
                        '<td>' + (o.severity ? _esc(o.severity) : '<span style="color:var(--color-text-tertiary);">unassessed</span>') + '</td>' +
                        '<td class="u-mono" style="font-size:11px;">' + _esc(o.linkedFcId || '—') + '</td>' +
                        '<td><button class="ckpt-m-btn" style="font-size:10.5px; padding:1px 8px;" onclick="_etaAssessUi(\'' + t.id + '\',\'' + o.key + '\')">assess…</button></td></tr>').join('') +
                    '</tbody></table>';
            }
            html += '</div>';
        });
        const f = etaFindings();
        if (f.length) {
            html += '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); padding:8px 14px;"><b style="font-size:12px;">Findings (INV-27)</b>' +
                f.map(x => '<div style="font-size:12px; padding:4px 0 4px 10px; border-left:3px solid #B7791F; margin:4px 0;">' + _esc(x.tree) + ' [' + x.kind + ']: ' + _esc(x.detail) + '</div>').join('') + '</div>';
        }
        host.innerHTML = html;
    }
    window._etaCreateUi = function () {
        const g = id => (document.getElementById(id) || { value: '' }).value;
        const r = window.etaCreate(g('eta-name'), g('eta-init'), g('eta-freq'), g('eta-by'));
        const err = document.getElementById('eta-err');
        if (!r.ok) { if (err) err.textContent = r.err; return; }
        _render();
    };
    window._etaBarUi = function (tid) {
        const g = id => (document.getElementById(id) || { value: '' }).value;
        const r = window.etaAddBarrier(tid, g('etb-name-' + tid), g('etb-p-' + tid), '');
        if (!r.ok) { try { showToast(r.err, 'error', 3200); } catch (_) {} return; }
        _render();
    };
    window._etaAssessUi = function (tid, key) {
        const F = 'width:100%; box-sizing:border-box; font-size:13px; padding:7px 10px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary);';
        const L = 'display:block; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; margin:12px 0 4px;';
        let m = document.getElementById('eta-assess-modal');
        if (m) m.remove();
        m = document.createElement('div');
        m.id = 'eta-assess-modal';
        m.className = 'modal-overlay';
        m.innerHTML = '<div class="modal-content" style="max-width: 560px;">' +
            '<div class="modal-header"><h2>Assess outcome ' + _esc(key) + '</h2>' +
            '<button class="btn-red" style="margin:0;" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button></div>' +
            '<div class="modal-body" style="padding: 18px 22px;">' +
            '<label style="' + L + '">Consequence severity</label><select id="eta-sev" class="state-select" style="' + F + '">' + SEVS.map(s => '<option>' + s + '</option>').join('') + '</select>' +
            '<label style="' + L + '">Linked failure condition (optional — enables FHA reconcile)</label><input id="eta-fc" type="text" style="' + F + '" placeholder="e.g. FC-05">' +
            '<label style="' + L + '">Signature (required)</label><input id="eta-aby" type="text" style="' + F + '" placeholder="Your name">' +
            '<div style="display:flex; justify-content:flex-end; margin-top:16px;"><button class="ckpt-m-btn" id="eta-ago" style="font-size:13px; padding:6px 18px;">Record assessment</button></div>' +
            '<p id="eta-aerr" style="color:#8E2A2A; font-size:12px; font-weight:600; margin:8px 0 0; display:none;"></p>' +
            '</div></div>';
        document.body.appendChild(m);
        document.getElementById('eta-ago').onclick = function () {
            const r = window.etaAssess(tid, key, document.getElementById('eta-sev').value, document.getElementById('eta-fc').value, '', document.getElementById('eta-aby').value);
            const err = document.getElementById('eta-aerr');
            if (!r.ok) { err.textContent = r.err; err.style.display = 'block'; return; }
            m.remove(); _render();
        };
        m.style.display = 'flex';
        setTimeout(() => m.classList.add('show'), 10);
    };
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._etaWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-eta');
                if (v) v.style.display = (tabId === 'eta') ? 'block' : 'none';
                const s = document.getElementById('snav-eta');
                if (s) s.classList.toggle('snav-active', tabId === 'eta');
                if (tabId === 'eta') _render();
            } catch (_) {}
            return r;
        };
        wrapped._etaWrapped = true;
        window.switchTab = wrapped;
    })();

    // REG §11d print path
    function _extend() {
        if (!window.Reports || !window.Reports.DEFAULT_TEMPLATES || !window.Reports.DEFAULT_TEMPLATES.REG) return false;
        const T = window.Reports.DEFAULT_TEMPLATES;
        if (T.REG.indexOf('{{reg_eta}}') < 0) {
            T.REG = T.REG.replace('## 11. RAM suite outputs',
                '## 11d. Event tree analyses\nSequence-consequence outcomes with exact path arithmetic, severity calls, FC links, and reconciliation findings.\n{{reg_eta}}\n\n## 11. RAM suite outputs');
        }
        if (!window.Reports.extractData._etaWrapped) {
            const orig = window.Reports.extractData;
            const wrapped = function (reportType) {
                const data = orig.apply(this, arguments);
                try {
                    if (reportType === 'REG') {
                        const rows = [];
                        _store().forEach(t => etaEvaluate(t).outcomes.forEach(o => rows.push({
                            'Tree': t.id, 'Path': o.key, 'Sequence': o.seq.join(' → ').slice(0, 100),
                            'P(path)': o.prob.toExponential(3), 'Freq /FH': o.freq.toExponential(3),
                            'Severity': o.severity || 'unassessed', 'Linked FC': o.linkedFcId || '—',
                        })));
                        data.reg_eta = rows;
                    }
                } catch (_) { if (reportType === 'REG') data.reg_eta = []; }
                return data;
            };
            wrapped._etaWrapped = true;
            window.Reports.extractData = wrapped;
        }
        return true;
    }
    if (!_extend()) { let tries = 20; const t = setInterval(() => { if (_extend() || --tries <= 0) clearInterval(t); }, 300); }

    window.etaEvaluate = etaEvaluate;
    window.etaFindings = etaFindings;
})();
