// ============================================================================
// do_credit.js — v1.0 — C1: DO-178C / DO-254 development-assurance credit
// tracking, per item, keyed to its IDAL.
//
// Software items track against the DO-178C Annex A process areas; hardware
// items against the DO-254 design-assurance areas. Process-area names are
// paraphrased identifications (the P3 / ARP4754B precedent) — the licensed
// standard text is never reproduced; the program's copy of the standard is
// the authority for objective wording. What the tool holds is the program's
// OWN record: per item, per area — status, evidence reference, signature.
//
// Two lanes as always: the tracking grid is elicited (signed acts); INV-24
// (advisory) computes the exposure — any Level A/B item with no recorded
// assurance progress is named on every sweep.
//
// Prints via REG §12 (Development-assurance credit register).
// ============================================================================
(function () {
    'use strict';

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _items() { return (typeof itemsData !== 'undefined' ? itemsData : []) || []; }
    function _jr(k, m) { try { if (typeof window.jrnl === 'function') window.jrnl(k, m); } catch (_) {} }
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }

    // paraphrased process-area identifications (never the standard's text)
    const AREAS_178 = [
        { id: 'A-1', area: 'Planning' },
        { id: 'A-2', area: 'Development (requirements, design, code, integration)' },
        { id: 'A-3', area: 'Verification of requirements' },
        { id: 'A-4', area: 'Verification of design' },
        { id: 'A-5', area: 'Verification of code & integration' },
        { id: 'A-6', area: 'Testing of outputs' },
        { id: 'A-7', area: 'Verification of verification' },
        { id: 'A-8', area: 'Configuration management' },
        { id: 'A-9', area: 'Quality assurance' },
        { id: 'A-10', area: 'Certification liaison' },
    ];
    const AREAS_254 = [
        { id: 'H-PLN', area: 'Planning' },
        { id: 'H-DES', area: 'Hardware design process' },
        { id: 'H-VAL', area: 'Validation' },
        { id: 'H-VER', area: 'Verification' },
        { id: 'H-CM',  area: 'Configuration management' },
        { id: 'H-PA',  area: 'Process assurance' },
        { id: 'H-CL',  area: 'Certification liaison' },
    ];
    const STATUSES = ['not started', 'planned', 'in progress', 'complete', 'n/a'];

    function doFramework(it) {
        const t = String(it.daType || '').toLowerCase();
        if (t.indexOf('software') >= 0) return { std: 'DO-178C', areas: AREAS_178 };
        if (t.indexOf('hardware') >= 0) return { std: 'DO-254', areas: AREAS_254 };
        return null;   // mechanical / electromechanical items: DA credit not applicable
    }

    window.doCreditSet = function (itemId, areaId, status, evidence, by) {
        const it = _items().find(x => x && x.itemId === itemId);
        if (!it) return { ok: false, err: 'Item not found.' };
        if (STATUSES.indexOf(status) < 0) return { ok: false, err: 'Unknown status.' };
        if (!String(by || '').trim()) return { ok: false, err: 'A signature is required.' };
        if (!it.doCredit) it.doCredit = {};
        it.doCredit[areaId] = { status, evidence: String(evidence || '').trim(), by: String(by).trim(), at: new Date().toISOString() };
        _jr('do-credit', it.itemId + ' ' + areaId + ' → ' + status + (evidence ? ' (' + evidence + ')' : '') + ' — signed ' + by);
        _save();
        return { ok: true };
    };

    function doCreditRows() {
        const rows = [];
        _items().forEach(it => {
            const fw = doFramework(it);
            if (!fw) return;
            fw.areas.forEach(a => {
                const rec = (it.doCredit || {})[a.id];
                rows.push({
                    'Item': it.itemId, 'IDAL': it.dal || '—', 'Standard': fw.std,
                    'Area': a.id + ' ' + a.area,
                    'Status': rec ? rec.status : 'not started',
                    'Evidence': rec ? rec.evidence : '', 'Signed': rec ? (rec.by + ' ' + String(rec.at).slice(0, 10)) : '',
                });
            });
        });
        return rows;
    }

    // INV-24 (advisory): high-assurance items with zero recorded progress
    (function register() {
        function reg() {
            if (typeof window.invRegister !== 'function') return false;
            window.invRegister({
                id: 'INV-24', name: 'Every Level A/B item has development-assurance credit in motion (DO-178C/254)', sev: 'advisory',
                run: () => {
                    const fails = []; let checked = 0;
                    _items().forEach(it => {
                        const fw = doFramework(it);
                        if (!fw || ['A', 'B'].indexOf(String(it.dal || '')) < 0) return;
                        checked++;
                        const recs = Object.values(it.doCredit || {});
                        if (!recs.some(r => r.status !== 'not started'))
                            fails.push(it.itemId + ' (IDAL ' + it.dal + ', ' + fw.std + '): no assurance-credit progress recorded across any process area');
                    });
                    return { checked, fails };
                }
            });
            return true;
        }
        if (!reg()) { let tries = 20; const t = setInterval(() => { if (reg() || --tries <= 0) clearInterval(t); }, 300); }
    })();

    // ------------------------------------------------ panel on the DAL page
    function _render() {
        const view = document.getElementById('view-dal-ref');
        if (!view) return;
        let div = document.getElementById('do-credit-panel');
        if (!div) { div = document.createElement('div'); div.id = 'do-credit-panel'; view.appendChild(div); }
        const its = _items().filter(it => doFramework(it));
        let html = '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-top:var(--s-5);">' +
            '<div style="padding:8px 14px; border-bottom:1px solid var(--color-border-strong); font-size:11px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase;">Development-assurance credit — per item (C1)</div>' +
            '<div style="padding:8px 14px; font-size:11.5px; color:var(--color-text-secondary);">Software items track DO-178C Annex A areas; hardware items DO-254. Click a cell to advance its status (signed). INV-24 names any Level A/B item with nothing in motion. Your copy of the standard owns the objective wording; this grid owns your program&#8217;s record.</div>';
        its.forEach(it => {
            const fw = doFramework(it);
            html += '<div style="padding:8px 14px; border-top:1px solid var(--color-border-hair);">' +
                '<b style="font-size:12px;">' + _esc(it.itemId) + '</b> <span style="font-size:11px; color:var(--color-text-tertiary);">' + _esc(it.name || '') + ' · IDAL ' + _esc(it.dal || '—') + ' · ' + fw.std + '</span>' +
                '<div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px;">' +
                fw.areas.map(a => {
                    const rec = (it.doCredit || {})[a.id];
                    const st = rec ? rec.status : 'not started';
                    const col = st === 'complete' ? 'var(--color-success)' : st === 'in progress' ? 'var(--color-warning)' : st === 'planned' ? 'var(--color-accent)' : st === 'n/a' ? 'var(--color-text-tertiary)' : 'var(--color-border-strong)';
                    return '<button class="ckpt-m-btn" style="font-size:10.5px; padding:2px 8px; border-color:' + col + ';" title="' + _esc(a.area) + (rec ? ' — ' + _esc(rec.evidence || '') : '') + '"' +
                        ' onclick="doCreditUi(\'' + _esc(it.itemId) + '\',\'' + a.id + '\')">' + a.id + ': ' + st + '</button>';
                }).join('') + '</div></div>';
        });
        html += '</div>';
        div.innerHTML = html;
    }

    window.doCreditUi = function (itemId, areaId) {
        const it = _items().find(x => x && x.itemId === itemId);
        const fw = it && doFramework(it);
        if (!fw) return;
        const a = fw.areas.find(x => x.id === areaId);
        const rec = (it.doCredit || {})[areaId] || {};
        const F = 'width:100%; box-sizing:border-box; font-size:13px; padding:7px 10px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary);';
        const L = 'display:block; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; margin:12px 0 4px;';
        let m = document.getElementById('do-credit-modal');
        if (m) m.remove();
        m = document.createElement('div');
        m.id = 'do-credit-modal';
        m.className = 'modal-overlay';
        m.innerHTML = '<div class="modal-content" style="max-width: 560px;">' +
            '<div class="modal-header"><h2>' + _esc(itemId) + ' — ' + _esc(areaId + ' ' + a.area) + '</h2>' +
            '<button class="btn-red" style="margin:0;" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button></div>' +
            '<div class="modal-body" style="padding: 18px 22px;">' +
            '<label style="' + L + '">Status</label><select id="doc-st" class="state-select" style="' + F + '">' +
            ['not started', 'planned', 'in progress', 'complete', 'n/a'].map(s => '<option' + (s === (rec.status || 'not started') ? ' selected' : '') + '>' + s + '</option>').join('') + '</select>' +
            '<label style="' + L + '">Evidence reference</label><input id="doc-ev" type="text" style="' + F + '" value="' + _esc(rec.evidence || '') + '" placeholder="e.g. SVP-K350-001 §4, review record VR-póöq-12">' +
            '<label style="' + L + '">Signature (required)</label><input id="doc-by" type="text" style="' + F + '" placeholder="Your name">' +
            '<div style="display:flex; justify-content:flex-end; margin-top:16px;"><button class="ckpt-m-btn" id="doc-go" style="font-size:13px; padding:6px 18px;">Record</button></div>' +
            '<p id="doc-err" style="color:#8E2A2A; font-size:12px; font-weight:600; margin:8px 0 0; display:none;"></p>' +
            '</div></div>';
        document.body.appendChild(m);
        document.getElementById('doc-go').onclick = function () {
            const r = window.doCreditSet(itemId, areaId,
                document.getElementById('doc-st').value,
                document.getElementById('doc-ev').value,
                document.getElementById('doc-by').value);
            const err = document.getElementById('doc-err');
            if (!r.ok) { err.textContent = r.err; err.style.display = 'block'; return; }
            m.remove(); _render();
        };
        m.style.display = 'flex';
        setTimeout(() => m.classList.add('show'), 10);
    };

    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._docWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try { if (tabId === 'dal-ref') setTimeout(_render, 120); } catch (_) {}
            return r;
        };
        wrapped._docWrapped = true;
        window.switchTab = wrapped;
    })();

    // ---------------------------------------------- REG §12 print path
    function _extend() {
        if (!window.Reports || !window.Reports.DEFAULT_TEMPLATES || !window.Reports.DEFAULT_TEMPLATES.REG) return false;
        const T = window.Reports.DEFAULT_TEMPLATES;
        if (T.REG.indexOf('{{reg_docredit}}') < 0) {
            T.REG = T.REG.replace('## 11. RAM suite outputs',
                '## 11a. Development-assurance credit register (DO-178C / DO-254)\nPer item, per process area: the program&#8217;s recorded status, evidence reference and signature.\n{{reg_docredit}}\n\n## 11. RAM suite outputs');
        }
        if (!window.Reports.extractData._docWrapped) {
            const orig = window.Reports.extractData;
            const wrapped = function (reportType) {
                const data = orig.apply(this, arguments);
                try { if (reportType === 'REG') data.reg_docredit = doCreditRows(); } catch (_) { if (reportType === 'REG') data.reg_docredit = []; }
                return data;
            };
            wrapped._docWrapped = true;
            window.Reports.extractData = wrapped;
        }
        return true;
    }
    if (!_extend()) { let tries = 20; const t = setInterval(() => { if (_extend() || --tries <= 0) clearInterval(t); }, 300); }

    window.doCreditRows = doCreditRows;
    window.doFramework = doFramework;
})();
