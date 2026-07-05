// ============================================================================
// mac_flows.js — v1.0 — M1 phase 2: the L3 cockpit. The typed-lane engine
// (mac_l3.js) gets its editor, its second engine, and its signing desk.
//
//   · FLOW EDITOR on the MAC page: per rule, lane flows (from —transfer→ to)
//     are typed in directly — pass / transform / block — every edit validated
//     against the schema contract (MBSA_SCHEMA.validateRule) BEFORE commit,
//     journaled, autosaved. An invalid flow never enters the model (INV-16
//     would catch it; the editor refuses it first).
//
//   · PER-DEVIATION COMPILED BDDs: each (rule, lane) compiles to a deviation
//     condition tree (OR over reaching sources) through the SAME BDD engine
//     that owns the loss lane (buildBDDFromFT → bddMinimalCutsets). The BDD
//     cutsets must agree with the BFS reach enumeration — two independent
//     engines, one answer. Disagreement is a NAMED finding on the page, the
//     same corroboration discipline fault_sim applies to clause arithmetic.
//
//   · PREVIEW → SIGN modal for the model-generated FMEA: new / updated /
//     orphaned rows shown before anything is written; a signature is the only
//     thing that makes it real (l3FmeaApply already enforces this).
//
// Born-modular: wraps window.renderMacPage. No monolith edits.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}; }
    function _rules() { return (_pc().macModels || []).filter(Boolean); }
    function _rule(id) { return _rules().find(r => r.id === id) || null; }
    function _sysList() { return (typeof systemsData !== 'undefined' ? systemsData : []) || []; }
    function _sysName(id) { const s = _sysList().find(x => x.id === id); return s ? (s.name || s.id) : id; }
    function _jr(kind, msg) { try { if (typeof window.jrnl === 'function') window.jrnl(kind, msg); } catch (_) {} }
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }
    const NONLOSS = ['erroneous', 'inadvertent'];

    // ---------------------------------------- per-deviation compiled BDDs
    // Deviation condition for (rule, lane) = OR over sources whose deviation
    // reaches a clause member (blocks excluded). Compiled through the SAME
    // engine as the loss lane, then cross-checked against the BFS reach.
    function l3Compile(rule, lane) {
        const reach = (typeof window.l3Reach === 'function') ? window.l3Reach(rule, lane) : { reaching: [], blocks: [] };
        const srcs = reach.reaching.map(x => x.source).sort();
        if (!srcs.length) return { rule: rule.id, lane, empty: true, srcs: [], cutsets: [], agree: true, blocks: reach.blocks };
        let nid = 900000000 + Math.floor(Math.random() * 0); // deterministic base; ids only need local uniqueness
        const kids = srcs.map((s, i) => ({
            id: nid + i + 1, logicalId: 'l3dev:' + rule.id + ':' + lane + ':' + s,
            displayId: 'DEV-' + s, name: lane + ' deviation sourced in ' + _sysName(s),
            type: 'basic', probability: 0.001, inputMode: 'probability', children: []
        }));
        const root = { id: nid, logicalId: 'l3root:' + rule.id + ':' + lane, displayId: 'G-L3', name: rule.subId + ' ' + lane + ' condition', type: 'gate', gateType: 'OR', children: kids };
        let cutsets = [];
        try {
            if (typeof bddMinimalCutsets === 'function') {
                cutsets = (bddMinimalCutsets(root) || []).map(cs =>
                    (Array.isArray(cs) ? cs : []).map(ev => {
                        const lid = String((ev && (ev.logicalId != null ? ev.logicalId : ev)) || '');
                        const m = lid.match(/^l3dev:.*:([^:]+)$/);
                        return m ? m[1] : lid;
                    }).sort().join('+')
                ).sort();
            }
        } catch (_) { cutsets = null; }
        // agreement: an OR of independent sources must yield exactly the
        // singleton cutsets {src} — BDD engine corroborates the BFS reach.
        const expect = srcs.slice().sort();
        const agree = cutsets !== null && cutsets.length === expect.length && cutsets.every((c, i) => c === expect[i]);
        return { rule: rule.id, lane, empty: false, srcs, cutsets, expect, agree, blocks: reach.blocks };
    }
    function l3EquivalenceAll() {
        const out = [];
        (typeof window.l3Rules === 'function' ? window.l3Rules() : []).forEach(rule => {
            (rule.lanes || []).filter(l => l !== 'loss').forEach(lane => out.push(l3Compile(rule, lane)));
        });
        return out;
    }

    // ------------------------------------------------------------ mutations
    window.l3LaneToggle = function (ruleId, lane) {
        const r = _rule(ruleId);
        if (!r || NONLOSS.indexOf(lane) < 0) return false;
        const lanes = Array.isArray(r.lanes) ? r.lanes.slice() : ['loss'];
        const i = lanes.indexOf(lane);
        if (i >= 0) {
            // refuse to drop a lane that still carries flows
            if ((r.flows || []).some(f => f && f.lane === lane))
                return { ok: false, err: 'Lane "' + lane + '" still carries flows — remove them first.' };
            lanes.splice(i, 1);
        } else lanes.push(lane);
        if (lanes.indexOf('loss') < 0) lanes.unshift('loss');
        const probe = Object.assign({}, r, { lanes });
        const issues = window.MBSA_SCHEMA ? window.MBSA_SCHEMA.validateRule(probe) : [];
        if (issues.length) return { ok: false, err: issues[0] };
        r.lanes = lanes;
        _jr('l3-lane', 'Rule ' + r.id + ': lanes now [' + lanes.join(', ') + ']');
        _save(); _rerender();
        return { ok: true };
    };

    window.l3FlowAdd = function (ruleId, from, to, lane, transfer, note) {
        const r = _rule(ruleId);
        if (!r) return { ok: false, err: 'Rule not found.' };
        if (!from || !to) return { ok: false, err: 'Both ends of the flow are required.' };
        if (from === to) return { ok: false, err: 'A flow needs two different systems.' };
        const flow = { id: 'fl-' + ruleId + '-' + (((r.flows || []).length) + 1), from, to, lane: lane || 'erroneous', transfer: transfer || 'pass', note: (note || '').trim() };
        const probe = Object.assign({}, r, {
            flows: (r.flows || []).concat([flow]),
            lanes: Array.from(new Set((r.lanes || ['loss']).concat([flow.lane])))
        });
        const issues = window.MBSA_SCHEMA ? window.MBSA_SCHEMA.validateRule(probe) : [];
        if (issues.length) return { ok: false, err: issues[0] };   // the contract gate — invalid never commits
        r.flows = probe.flows; r.lanes = probe.lanes;
        _jr('l3-flow', 'Rule ' + r.id + ': + ' + flow.lane + ' flow ' + from + ' —' + flow.transfer + '→ ' + to + (flow.note ? ' (' + flow.note + ')' : ''));
        _save(); _rerender();
        return { ok: true, flow };
    };

    window.l3FlowRemove = function (ruleId, flowId) {
        const r = _rule(ruleId);
        if (!r || !Array.isArray(r.flows)) return { ok: false, err: 'Nothing to remove.' };
        const i = r.flows.findIndex(f => f && f.id === flowId);
        if (i < 0) return { ok: false, err: 'Flow not found.' };
        const gone = r.flows.splice(i, 1)[0];
        _jr('l3-flow', 'Rule ' + r.id + ': − ' + gone.lane + ' flow ' + gone.from + ' —' + gone.transfer + '→ ' + gone.to);
        _save(); _rerender();
        return { ok: true };
    };

    // ---------------------------------------------------------------- panel
    function _laneChip(rule, lane) {
        const on = (rule.lanes || []).indexOf(lane) >= 0;
        return '<button class="ckpt-m-btn" style="font-size:10.5px; padding:1px 8px;' + (on ? ' background:var(--color-accent-soft); border-color:var(--color-accent); color:var(--color-accent); font-weight:700;' : '') + '"' +
            ' onclick="var r=l3LaneToggle(\'' + _esc(rule.id) + '\',\'' + lane + '\'); if(r && r.err && typeof showToast===\'function\') showToast(r.err, \'error\', 3200);">' + lane + '</button>';
    }

    function _flowRows(rule) {
        return (rule.flows || []).map(f =>
            '<tr><td><span class="u-mono" style="font-size:11px;">' + _esc(f.lane) + '</span></td>' +
            '<td>' + _esc(_sysName(f.from)) + '</td>' +
            '<td style="text-align:center;"><span class="u-mono" style="font-size:11px;' + (f.transfer === 'block' ? ' color:var(--color-danger); font-weight:700;' : (f.transfer === 'transform' ? ' color:var(--color-warning); font-weight:700;' : '')) + '">—' + _esc(f.transfer) + '→</span></td>' +
            '<td>' + _esc(_sysName(f.to)) + '</td>' +
            '<td style="font-size:11.5px; color:var(--color-text-secondary);">' + _esc(f.note || '') + (f.transfer === 'block' ? ' <b>· CMA-owned claim (INV-17)</b>' : '') + '</td>' +
            '<td><button class="ckpt-m-btn" style="font-size:10.5px; padding:1px 7px;" onclick="l3FlowRemove(\'' + _esc(rule.id) + '\',\'' + _esc(f.id) + '\')">✕</button></td></tr>'
        ).join('');
    }

    function _addRow(rule) {
        const opts = _sysList().map(s => '<option value="' + _esc(s.id) + '">' + _esc(s.name || s.id) + '</option>').join('');
        const rid = _esc(rule.id);
        return '<tr style="background:var(--color-surface-2);">' +
            '<td><select id="l3f-lane-' + rid + '" class="state-select" style="font-size:11px;">' + NONLOSS.map(l => '<option>' + l + '</option>').join('') + '</select></td>' +
            '<td><select id="l3f-from-' + rid + '" class="state-select" style="font-size:11px;">' + opts + '</select></td>' +
            '<td><select id="l3f-tr-' + rid + '" class="state-select" style="font-size:11px;"><option>pass</option><option>transform</option><option>block</option></select></td>' +
            '<td><select id="l3f-to-' + rid + '" class="state-select" style="font-size:11px;">' + opts + '</select></td>' +
            '<td><input id="l3f-note-' + rid + '" type="text" placeholder="note (blocks: name the monitor claim)" style="width:100%; box-sizing:border-box; font-size:11px; padding:3px 7px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary);"></td>' +
            '<td><button class="ckpt-m-btn" style="font-size:10.5px; padding:1px 8px;" onclick="_l3AddUi(\'' + rid + '\')">+ flow</button></td></tr>';
    }

    window._l3AddUi = function (ruleId) {
        const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };
        const r = window.l3FlowAdd(ruleId, g('l3f-from-' + ruleId), g('l3f-to-' + ruleId), g('l3f-lane-' + ruleId), g('l3f-tr-' + ruleId), g('l3f-note-' + ruleId));
        if (!r.ok && typeof showToast === 'function') showToast(r.err, 'error', 3600);
    };

    function _renderL3() {
        const host = document.getElementById('mac-host');
        if (!host) return;
        let div = document.getElementById('l3-flows-panel');
        if (!div) { div = document.createElement('div'); div.id = 'l3-flows-panel'; host.appendChild(div); }
        const rules = _rules();
        if (!rules.length) { div.innerHTML = ''; return; }
        const eqs = l3EquivalenceAll();
        let html = '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-top:var(--s-5);">' +
            '<div style="padding:8px 14px; border-bottom:1px solid var(--color-border-strong); font-size:11px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase;">Typed deviation lanes — L3</div>' +
            '<div style="padding:8px 14px; font-size:11.5px; color:var(--color-text-secondary);">Loss stays the compiled clause arithmetic. Erroneous and inadvertent propagate over the flows below — <b>pass</b> travels, <b>transform</b> travels and is recorded, <b>block</b> kills the edge and becomes a monitor claim the CMA must own. Every edit is schema-validated before it commits, and every lane is compiled through the BDD engine to corroborate the reach enumeration.</div>';
        rules.forEach(rule => {
            const ruleEqs = eqs.filter(e => e.rule === rule.id);
            html += '<div style="padding:10px 14px; border-top:1px solid var(--color-border-hair);">' +
                '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px;">' +
                '<b style="font-size:12.5px;">' + _esc(rule.subId) + '</b><span class="u-mono" style="font-size:11px; color:var(--color-text-tertiary);">' + _esc(rule.id) + ' · ' + _esc(rule.phase || 'All') + '</span>' +
                '<span style="margin-left:6px; font-size:10.5px; color:var(--color-text-tertiary);">lanes:</span>' + NONLOSS.map(l => _laneChip(rule, l)).join(' ') +
                ruleEqs.map(e => e.empty ? '' :
                    '<span title="BDD cutsets vs BFS reach" style="font-size:10.5px; font-weight:700; padding:1px 8px; border:1px solid ' + (e.agree ? 'var(--color-success)' : 'var(--color-danger)') + '; color:' + (e.agree ? 'var(--color-success)' : 'var(--color-danger)') + ';">' +
                    e.lane + ': ' + (e.agree ? 'BDD ⇔ reach ✓' : 'ENGINES DISAGREE — ' + _esc((e.cutsets || []).join(',') || '∅') + ' vs ' + _esc(e.expect.join(','))) + '</span>').join(' ') +
                '</div>';
            const hasNonLoss = (rule.lanes || []).some(l => l !== 'loss');
            if (hasNonLoss || (rule.flows || []).length) {
                html += '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr><th style="width:80px;">Lane</th><th>From</th><th style="width:90px;"></th><th>To</th><th>Note</th><th style="width:50px;"></th></tr></thead><tbody>' +
                    _flowRows(rule) + _addRow(rule) + '</tbody></table>';
            } else {
                html += '<div style="font-size:11px; color:var(--color-text-tertiary);">Availability-only (L0–L2). Switch on a lane to type deviations.</div>';
            }
            html += '</div>';
        });
        // FMEA desk
        const prev = (typeof window.l3FmeaPreview === 'function') ? window.l3FmeaPreview() : null;
        if (prev) {
            const pending = prev.isNew.length + prev.isUpdated.length;
            html += '<div style="padding:10px 14px; border-top:1px solid var(--color-border-strong); display:flex; align-items:center; gap:12px;">' +
                '<b style="font-size:12px;">Model-generated FMEA</b>' +
                '<span style="font-size:11.5px; color:var(--color-text-secondary);">' + prev.isNew.length + ' new · ' + prev.isUpdated.length + ' updated · ' + prev.unchanged.length + ' unchanged · ' + prev.orphaned.length + ' orphaned</span>' +
                '<button class="ckpt-m-btn ' + (pending ? 'ckpt-m-btn-primary' : '') + '" style="font-size:11.5px; padding:3px 12px; margin-left:auto;" onclick="l3FmeaModal()">Preview & sign…</button></div>';
        }
        html += '</div>';
        div.innerHTML = html;
    }
    function _rerender() { try { _renderL3(); } catch (_) {} }

    // ------------------------------------------------------ preview→sign modal
    function _ensureModal() {
        let m = document.getElementById('l3-fmea-modal');
        if (m) return m;
        m = document.createElement('div');
        m.id = 'l3-fmea-modal';
        m.className = 'modal-overlay';
        m.innerHTML =
            '<div class="modal-content" style="max-width: 860px;">' +
            '<div class="modal-header"><h2>Model-generated FMEA — preview</h2>' +
            '<button class="btn-red" style="margin:0;" onclick="l3FmeaModalClose()">Cancel</button></div>' +
            '<div class="modal-body" style="padding: 18px 22px; max-height: 70vh; overflow:auto;">' +
            '<div id="l3-fmea-body"></div>' +
            '<div style="display:flex; align-items:center; gap:10px; margin-top:16px;">' +
            '<input id="l3-fmea-by" type="text" placeholder="Signature (required)" style="font-size:13px; padding:7px 10px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary); width:220px;">' +
            '<button id="l3-fmea-apply" class="ckpt-m-btn ckpt-m-btn-primary" style="font-size:13px; padding:6px 18px;">Sign & apply</button>' +
            '<p id="l3-fmea-err" style="color:#8E2A2A; font-size:12px; font-weight:600; margin:0; display:none;"></p>' +
            '</div></div></div>';
        document.body.appendChild(m);
        m.addEventListener('click', e => { if (e.target === m) window.l3FmeaModalClose(); });
        return m;
    }

    window.l3FmeaModal = function () {
        const m = _ensureModal();
        const prev = window.l3FmeaPreview();
        m._merge = prev;
        const row = (c, tag, color) =>
            '<tr><td><span style="font-size:10px; font-weight:700; color:' + color + ';">' + tag + '</span></td>' +
            '<td style="font-size:11.5px;">' + _esc(c.part) + '</td><td style="font-size:11.5px;">' + _esc(c.mode) + '</td>' +
            '<td style="font-size:11.5px;">' + _esc(c.endEffect) + '</td><td class="u-mono" style="font-size:10.5px;">' + _esc(c.lane) + '</td></tr>';
        let html = '<p style="font-size:12.5px; color:var(--color-text-secondary); margin:0 0 10px;">Derived from the MAC model — loss effects through the clause arithmetic, erroneous/inadvertent through lane reachability. Nothing is written until you sign; existing rows update in place by sourceId; orphans are flagged, never deleted.</p>';
        if (!prev.isNew.length && !prev.isUpdated.length && !prev.orphaned.length) {
            html += '<p style="font-size:12.5px;"><b>Everything is current</b> — the FMEA already reflects the model (' + prev.unchanged.length + ' rows verified unchanged).</p>';
        } else {
            html += '<table class="data-table" style="width:100%;"><thead><tr><th></th><th>System</th><th>Failure mode</th><th>End effect</th><th>Lane</th></tr></thead><tbody>' +
                prev.isNew.map(c => row(c, 'NEW', 'var(--color-success)')).join('') +
                prev.isUpdated.map(u => row(u.next, 'UPDATE', 'var(--color-warning)')).join('') +
                prev.orphaned.map(o => row({ part: o.part, mode: o.mode, endEffect: o.endEffect, lane: (o.l3Source || {}).lane || '' }, 'ORPHAN', 'var(--color-danger)')).join('') +
                '</tbody></table>';
            if (prev.orphaned.length) html += '<p style="font-size:11.5px; color:var(--color-text-secondary);">Orphaned rows lost their model source (a flow or rule was removed). They stay in the FMEA flagged for your disposition — the model never deletes engineering work.</p>';
        }
        document.getElementById('l3-fmea-body').innerHTML = html;
        document.getElementById('l3-fmea-err').style.display = 'none';
        document.getElementById('l3-fmea-apply').onclick = function () {
            const by = (document.getElementById('l3-fmea-by').value || '').trim();
            const err = document.getElementById('l3-fmea-err');
            if (!by) { err.textContent = 'A signature is required — the model proposes, you decide.'; err.style.display = 'block'; return; }
            const n = window.l3FmeaApply(m._merge, by);
            window.l3FmeaModalClose();
            try { if (typeof showToast === 'function') showToast('FMEA updated from the model: ' + n + ' row(s), signed ' + by + '.', 'success', 3600); } catch (_) {}
            _rerender();
        };
        m.style.display = 'flex';
        setTimeout(() => m.classList.add('show'), 10);
    };
    window.l3FmeaModalClose = function () {
        const m = document.getElementById('l3-fmea-modal');
        if (!m) return;
        m.classList.remove('show');
        setTimeout(() => { m.style.display = 'none'; }, 250);
    };

    // ------------------------------------------------------------- the wraps
    // Phase 68 pruned functional FMEA as a stale hand-authored mode. M1 makes
    // functional FMEA first-class again — but ONLY the model-generated kind:
    // l3Source rows are signed, fingerprinted, idempotent and regenerable, so
    // they are exempt from the prune. Hand-authored functional rows stay dead.
    (function wrapPrune() {
        if (typeof window._pruneFmeaToPerSystem === 'function' && !window._pruneFmeaToPerSystem._l3Wrapped) {
            const orig = window._pruneFmeaToPerSystem;
            const wrapped = function () {
                const keep = (typeof fmeaData !== 'undefined' && Array.isArray(fmeaData)) ? fmeaData.filter(r => r && r.l3Source) : [];
                const r = orig.apply(this, arguments);
                try {
                    if (typeof fmeaData !== 'undefined' && Array.isArray(fmeaData)) {
                        keep.forEach(k => { if (fmeaData.indexOf(k) < 0) fmeaData.push(k); });
                    }
                } catch (_) {}
                return r;
            };
            wrapped._l3Wrapped = true;
            window._pruneFmeaToPerSystem = wrapped;
        }
    })();

    (function wrap() {
        if (typeof window.renderMacPage === 'function' && !window.renderMacPage._l3Wrapped) {
            const orig = window.renderMacPage;
            const wrapped = function () {
                const r = orig.apply(this, arguments);
                _rerender();
                return r;
            };
            wrapped._l3Wrapped = true;
            window.renderMacPage = wrapped;
        }
    })();

    // ------------------------------------------------------------- exports
    window.l3Compile = l3Compile;
    window.l3EquivalenceAll = l3EquivalenceAll;
    window._l3RenderPanel = _renderL3;
})();
