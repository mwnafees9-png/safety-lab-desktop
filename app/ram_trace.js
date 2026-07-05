// ============================================================================
// ram_trace.js — v1.0 — RAM on the Traceability Matrix.
//
// The trace matrix showed hazard↔hazard edges only. The R&M lane has its own
// golden thread — FC → FTA event → item/LRU → maintenance task → field
// evidence (FRACAS) → MSG-3 → dispatch (MMEL) — and it was invisible there.
// This module renders it as a second section on the same page: one row per
// R&M CHAIN (every FTA event referenced by a maintenance task, a FRACAS
// field record, or an MMEL item), each cell resolved live from the stores,
// with a per-row thread verdict naming exactly which link is missing.
//
// The page also gets what the user asked for by name: thread integrity,
// inline. A summary strip pulls the live gtIntegrity() sweep (edges checked,
// dangling / fragile / orphans) plus the R&M chain totals, with a jump to
// the full Thread Integrity page.
//
// Read-only: everything is resolved at render; nothing is stored. Reuses the
// RAM suite's own resolvers (_ramFcsForBeRef, _ramPageFcMap, ramFieldRows)
// so the matrix can never disagree with the RAM pages.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}; }
    function _ram() { return _pc().ram || { tasks: [], field: [] }; }
    function _mmelItems() { return (_pc().mmel && _pc().mmel.items) || []; }
    function _msis() { return (_pc().mxAnalytics && _pc().mxAnalytics.msis) || []; }

    function _findBe(ref) {
        if (!ref) return null;
        const pages = (typeof ftaPages !== 'undefined' ? ftaPages : []) || [];
        for (const p of pages) {
            if (!p || !p.root) continue;
            let hit = null;
            (function walk(n) {
                if (!n || hit) return;
                if ((n.type === 'basic' || n.type === 'undeveloped') && n.displayId === ref) { hit = n; return; }
                (n.children || []).forEach(walk);
            })(p.root);
            if (hit) return { node: hit, page: p };
        }
        return null;
    }
    function _fhaByInternalId(id) {
        const sid = String(id);
        let f = (typeof acFhaData !== 'undefined' ? acFhaData : []).find(x => x && String(x.internalId) === sid);
        if (f) return f;
        for (const s of (typeof systemsData !== 'undefined' ? systemsData : [])) {
            f = (s.fha || []).find(x => x && String(x.internalId) === sid);
            if (f) return f;
        }
        return null;
    }
    function _itemFor(task, beHit) {
        const items = (typeof itemsData !== 'undefined' ? itemsData : []) || [];
        if (task && task.itemId) {
            const it = items.find(i => i && i.itemId === task.itemId);
            if (it) return it;
        }
        if (beHit && beHit.node.realizedByItemId != null) {
            const it = items.find(i => i && String(i.internalId) === String(beHit.node.realizedByItemId));
            if (it) return it;
        }
        return null;
    }

    // ------------------------------------------------------- chain assembly
    // One chain per distinct beRef appearing anywhere in the R&M stores, plus
    // one degenerate chain per task that has no beRef at all.
    function ramTraceRows() {
        const tasks = _ram().tasks || [];
        const fieldRows = (typeof ramFieldRows === 'function') ? ramFieldRows() : [];
        const mmel = _mmelItems();
        const refs = new Set();
        tasks.forEach(t => { if (t && t.beRef) refs.add(t.beRef); });
        (_ram().field || []).forEach(f => { if (f && f.beRef) refs.add(f.beRef); });
        mmel.forEach(m => { if (m && m.beRef) refs.add(m.beRef); });

        const pageFcMap = (typeof _ramPageFcMap === 'function') ? _ramPageFcMap() : new Map();
        const rows = [];

        refs.forEach(ref => {
            const beHit = _findBe(ref);
            const chainTasks = tasks.filter(t => t && t.beRef === ref);
            const chainField = fieldRows.filter(x => x && x.f && x.f.beRef === ref);
            const chainMmel = mmel.filter(m => m && m.beRef === ref);
            // FCs via the RAM suite's own resolver (transfer-gate aware)
            let fcs = [];
            try {
                const set = (typeof _ramFcsForBeRef === 'function') ? _ramFcsForBeRef(ref, pageFcMap) : new Set();
                fcs = Array.from(set).map(_fhaByInternalId).filter(Boolean);
            } catch (_) {}
            const item = _itemFor(chainTasks[0], beHit);
            const msg3 = item ? _msis().filter(m => m && m.itemId === item.itemId) : [];

            const gaps = [];
            if (!beHit) gaps.push('beRef "' + ref + '" resolves to no FTA event (dangling)');
            if (beHit && !fcs.length) gaps.push('event’s tree is not linked to a failure condition');
            if (!chainTasks.length) gaps.push('no maintenance task');

            rows.push({
                kind: 'chain', ref,
                be: beHit ? { name: beHit.node.name || '', page: beHit.page.name || '' } : null,
                fcs: fcs.map(f => ({ fcId: f.fcId || '', severity: f.severity || '' })),
                item: item ? { itemId: item.itemId || '', name: item.name || '' } : null,
                tasks: chainTasks.map(t => ({ id: t.id, name: t.name || '', interval: t.interval || 0, demonstrated: t.demonstrated })),
                field: chainField.map(x => ({ id: x.f.id, verdict: x.verdict })),
                mmel: chainMmel.map(m => ({ id: m.id, category: m.category, state: m.state })),
                msg3: msg3.map(m => ({ id: m.id, name: m.name || '' })),
                gaps,
                onThread: gaps.length === 0
            });
        });

        // Item-level tasks (no beRef): these ride the thread via the LRU —
        // item → BEs realizing it (realizedByItemId) and/or item → traced
        // functions (traceIds) → the FHA rows on those functions. Group them
        // per item so five servicing tasks on one LRU are one chain.
        // MSG-3 ledger tasks (structures / zonal / L-HIRF) are anchored to an
        // SSI or zone by construction (idempotent msg3x ref) — their thread
        // runs through the MSG-3 analysis, not an FTA event. One chain per
        // analysis lane, always on thread; the msg3x pages own the detail.
        const msg3Tasks = tasks.filter(t => t && !t.beRef && t.msg3x);
        if (msg3Tasks.length) {
            rows.push({
                kind: 'chain', ref: 'via MSG-3',
                be: null, fcs: [], item: null,
                tasks: msg3Tasks.map(t => ({ id: t.id, name: t.name || '', interval: t.interval || 0, demonstrated: t.demonstrated })),
                field: [], mmel: [],
                msg3: msg3Tasks.map(t => ({ id: String(t.msg3x).slice(0, 24), name: t.name || '' })),
                gaps: [],
                onThread: true
            });
        }

        const byItem = new Map();
        tasks.forEach(t => {
            if (!t || t.beRef || t.msg3x) return;
            const key = t.itemId || '__floating__' + t.id;
            if (!byItem.has(key)) byItem.set(key, []);
            byItem.get(key).push(t);
        });
        const items = (typeof itemsData !== 'undefined' ? itemsData : []) || [];
        const allFhaRows = [];
        (typeof acFhaData !== 'undefined' ? acFhaData : []).forEach(f => f && allFhaRows.push(f));
        (typeof systemsData !== 'undefined' ? systemsData : []).forEach(s => (s.fha || []).forEach(f => f && allFhaRows.push(f)));
        byItem.forEach((itemTasks, key) => {
            const floating = key.indexOf('__floating__') === 0;
            const item = floating ? null : items.find(i => i && i.itemId === key);
            // FC paths: (a) BEs realizing this item, (b) functions the item traces to
            const fcSet = new Map();   // internalId → fha row
            let beAnchor = null;
            if (item) {
                (typeof ftaPages !== 'undefined' ? ftaPages : []).forEach(p => {
                    if (!p || !p.root) return;
                    (function walk(n) {
                        if (!n) return;
                        if ((n.type === 'basic' || n.type === 'undeveloped') && String(n.realizedByItemId) === String(item.internalId)) {
                            if (!beAnchor) beAnchor = { node: n, page: p };
                            try { _ramFcsForBeRef(n.displayId, pageFcMap).forEach(id => { const f = _fhaByInternalId(id); if (f) fcSet.set(String(f.internalId), f); }); } catch (_) {}
                        }
                        (n.children || []).forEach(walk);
                    })(p.root);
                });
                const traces = Array.isArray(item.traceIds) ? item.traceIds : [];
                if (traces.length) {
                    allFhaRows.forEach(f => {
                        const subs = [f.subId].concat(Array.isArray(f.subIds) ? f.subIds : []).filter(Boolean);
                        if (subs.some(su => traces.indexOf(su) >= 0)) fcSet.set(String(f.internalId), f);
                    });
                }
            }
            const fcs = Array.from(fcSet.values());
            const msg3 = item ? _msis().filter(m => m && m.itemId === item.itemId) : [];
            const gaps = [];
            if (floating) gaps.push('task ' + itemTasks[0].id + ' has neither a BE reference nor an item — unreachable from the thread');
            else if (!item) gaps.push('tasks reference item "' + key + '" — no such LRU in the item library');
            else if (!fcs.length) gaps.push('item ' + key + ' reaches no failure condition (no BE realization, no traced function on an FHA row)');
            rows.push({
                kind: 'chain',
                ref: beAnchor ? beAnchor.node.displayId : (item ? 'via ' + item.itemId : '(none)'),
                be: beAnchor ? { name: beAnchor.node.name || '', page: beAnchor.page.name || '' } : null,
                fcs: fcs.map(f => ({ fcId: f.fcId || '', severity: f.severity || '' })),
                item: item ? { itemId: item.itemId || '', name: item.name || '' } : (floating ? null : { itemId: key, name: '' }),
                tasks: itemTasks.map(t => ({ id: t.id, name: t.name || '', interval: t.interval || 0, demonstrated: t.demonstrated })),
                field: [], mmel: [], msg3: msg3.map(m => ({ id: m.id, name: m.name || '' })),
                gaps,
                onThread: gaps.length === 0
            });
        });

        rows.sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));
        return rows;
    }

    // ------------------------------------------------------------ rendering
    const V_BADGE = {
        'verified':     '<span style="color:#1D9E75; font-weight:700;">✓ verified</span>',
        'finding':      '<span style="color:#8E2A2A; font-weight:700;">✗ finding</span>',
        'inconclusive': '<span style="color:#B7791F; font-weight:700;">~ inconclusive</span>',
        'point-above':  '<span style="color:#B7791F; font-weight:700;">~ point-above</span>',
        'unlinked':     '<span style="color:#8E2A2A; font-weight:700;">unlinked</span>'
    };

    function _integrityStrip() {
        let gt = null;
        try { if (typeof gtIntegrity === 'function') gt = gtIntegrity(); } catch (_) {}
        if (!gt) return '';
        const bad = (gt.dangling.length + gt.fragile.length) > 0;
        return '<span class="u-mono" style="font-size:11px; font-weight:700;' + (bad ? ' color:#8E2A2A;' : '') + '">' +
            gt.checked + ' edges · ' + gt.dangling.length + ' dangling · ' + gt.fragile.length + ' fragile · ' +
            gt.orphans.length + ' orphan(s)' + (bad ? '' : ' — PRISTINE ✓') + '</span>' +
            '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px; margin-left:10px;" onclick="switchTab(\'gt-integrity\')">Thread Integrity →</button>';
    }

    function renderRamTrace() {
        const view = document.getElementById('view-trace');
        if (!view) return;
        let host = document.getElementById('ram-trace-host');
        if (!host) {
            host = document.createElement('div');
            host.id = 'ram-trace-host';
            view.appendChild(host);
        }
        const rows = ramTraceRows();
        const on = rows.filter(r => r.onThread).length;
        const bodyRows = rows.length ? rows.map(r => {
            const fcCell = r.fcs.length
                ? r.fcs.map(f => '<strong>' + _esc(f.fcId) + '</strong> <span class="cell-' + _esc(f.severity) + '">' + _esc(f.severity) + '</span>').join('<br>')
                : '<span style="color:var(--color-text-tertiary);">—</span>';
            const beCell = r.be
                ? '<strong>' + _esc(r.ref) + '</strong><br><span style="color:var(--color-text-secondary);">' + _esc(r.be.name.slice(0, 60)) + '</span>'
                : (r.ref === '(none)'
                    ? '<span style="color:var(--color-text-tertiary);">—</span>'
                    : (r.ref.indexOf('via ') === 0
                        ? '<span style="color:var(--color-text-secondary);" class="u-mono">' + _esc(r.ref) + '</span>'
                        : '<span style="color:#8E2A2A;" class="u-mono">' + _esc(r.ref) + ' ?</span>'));
            const itemCell = r.item ? '<span class="u-mono">' + _esc(r.item.itemId) + '</span>' : '<span style="color:var(--color-text-tertiary);">—</span>';
            const taskCell = r.tasks.length
                ? r.tasks.map(t => _esc(t.id) + (t.interval ? ' <span style="color:var(--color-text-secondary);">(τ ' + _esc(t.interval) + ' h)</span>' : '')).join('<br>')
                : '<span style="color:var(--color-text-tertiary);">—</span>';
            const fieldCell = r.field.length
                ? r.field.map(f => (V_BADGE[f.verdict] || _esc(f.verdict))).join('<br>')
                : '<span style="color:var(--color-text-tertiary);">—</span>';
            const msg3Cell = r.msg3.length ? r.msg3.map(m => _esc(m.id)).join(', ') : '<span style="color:var(--color-text-tertiary);">—</span>';
            const mmelCell = r.mmel.length
                ? r.mmel.map(m => _esc(m.id) + ' <span style="color:var(--color-text-secondary);">Cat ' + _esc(m.category) + ' · ' + _esc(m.state) + '</span>').join('<br>')
                : '<span style="color:var(--color-text-tertiary);">—</span>';
            const threadCell = r.onThread
                ? '<span class="u-mono" style="color:#1D9E75; font-weight:700;">ON THREAD ✓</span>'
                : '<span class="u-mono" style="color:#8E2A2A; font-weight:700;">GAP</span><br><span style="font-size:11px; color:#8E2A2A;">' + r.gaps.map(_esc).join('<br>') + '</span>';
            return '<tr><td>' + fcCell + '</td><td>' + beCell + '</td><td>' + itemCell + '</td><td>' + taskCell + '</td><td>' +
                fieldCell + '</td><td>' + msg3Cell + '</td><td>' + mmelCell + '</td><td>' + threadCell + '</td></tr>';
        }).join('')
            : '<tr><td colspan="8" style="text-align:center; color:var(--color-text-secondary); font-style:italic; padding:18px;">No R&M chains yet — add maintenance tasks, FRACAS records, or MMEL items with BE references and they appear here automatically.</td></tr>';

        host.innerHTML =
            '<div style="margin-top:26px; border:1px solid var(--color-border-strong); background:var(--color-surface-1);">' +
            '<div style="padding:9px 14px; border-bottom:2px solid var(--color-text-primary); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">' +
            '<b>R&amp;M thread — FC → event → LRU → maintenance → field evidence → MSG-3 → dispatch</b>' +
            '<span>' + _integrityStrip() + '</span></div>' +
            '<p style="font-size:12px; color:var(--color-text-secondary); padding:8px 14px 4px;">' +
            'One row per R&amp;M chain (every FTA event referenced by a maintenance task, FRACAS record, or MMEL item), resolved live from the same functions the RAM pages use. ' +
            '<span class="u-mono">' + rows.length + ' chain(s) · ' + on + ' on thread · ' + (rows.length - on) + ' with gaps</span></p>' +
            '<div style="overflow-x:auto;"><table class="data-table" style="width:100%; font-size:12px;">' +
            '<thead><tr><th>Failure condition</th><th>FTA event</th><th>Item / LRU</th><th>Maintenance task</th><th>Field evidence</th><th>MSG-3</th><th>MMEL / dispatch</th><th>Thread</th></tr></thead>' +
            '<tbody>' + bodyRows + '</tbody></table></div></div>';
    }

    (function wrap() {
        if (typeof window.switchTab === 'function' && !window.switchTab._ramTraceWrapped) {
            const orig = window.switchTab;
            const wrapped = function (tabId) {
                const r = orig.apply(this, arguments);
                try { if (tabId === 'trace') setTimeout(renderRamTrace, 100); } catch (_) {}
                return r;
            };
            wrapped._ramTraceWrapped = true;
            window.switchTab = wrapped;
        }
    })();

    // ------------------------------------------------------------- exports
    window.ramTraceRows = ramTraceRows;
    window.renderRamTrace = renderRamTrace;
})();
