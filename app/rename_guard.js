// ============================================================================
// rename_guard.js — v1.0 — Q4: rename-safe identity.
//
// The golden thread survives renames wherever links ride internal ids
// (linkedFhaIds, realizedByItemId, threadLinks, parentReqId). But several
// stores hold ID STRINGS: ZSA zones list function subIds, PRAs list zone
// ids, RAM tasks / MSG-3 / FMEA rows hold item ids, FCIM TL/PL/M columns
// hold FC ids, requirement trace tags hold subIds/praIds. Rename the owner
// and every string reference strands — gt_integrity reports it AFTER the
// fact; nothing healed it. This module does.
//
// Mechanism (deterministic, internal-id anchored):
//   1. Snapshot every identity owner: kind + owner internalId → key string.
//   2. Ride the autosave debounce (scheduleAutosave fires after every
//      mutation). On a throttle, re-snapshot and diff: same owner, key
//      changed, old ≠ new → a RENAME, not a delete+create.
//   3. Enumerate live string references to the OLD value across the known
//      reference map. If any exist, a modal offers one-click propagation
//      ("FC-02 → FC-02A · 7 references"), listing where they live.
//   4. Propagation rewrites exactly those slots, logs to
//      projectConfig.renameLog, autosaves. Declining leaves everything for
//      gt_integrity to flag — nothing is ever rewritten silently.
//
// Ambiguity guard: if the old key is still carried by ANOTHER live owner
// (duplicate ids), the rename is skipped — references may legitimately
// point at the survivor. Baselines reset on project apply/load so restores
// and round-trip proofs never trigger rename storms.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _sysList() { return (typeof systemsData !== 'undefined' ? systemsData : []) || []; }
    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : null); }

    // ------------------------------------------------------ the identity map
    // owners(): every row that OWNS a key of this kind → { id, key }.
    // refs(value): every live slot holding that key string elsewhere.
    function _reqRefs(value, slots) {
        const scan = (reqs, where) => (reqs || []).forEach(r => {
            if (!r || r.deleted) return;
            if (r.traceId === value) slots.push({ obj: r, field: 'traceId', where });
            if (Array.isArray(r.traceIds) && r.traceIds.indexOf(value) >= 0) slots.push({ obj: r, field: 'traceIds', isArray: true, where });
        });
        scan(typeof acReqData !== 'undefined' ? acReqData : [], 'AC requirements');
        _sysList().forEach(s => scan(s.req, (s.name || s.id) + ' requirements'));
    }

    const KINDS = {
        subId: {
            label: 'Function ID',
            owners: () => {
                const out = [];
                (typeof acFunctionsData !== 'undefined' ? acFunctionsData : []).forEach(f => f && out.push({ id: 'ac:' + f.internalId, key: f.subId }));
                // system functions carry their id in funcId (subId is the legacy field)
                _sysList().forEach(s => (s.functions || []).forEach(f => f && out.push({ id: 'sys-' + s.id + ':' + f.internalId, key: f.subId || f.funcId })));
                return out;
            },
            refs: value => {
                const slots = [];
                const fhaScan = (fha, where) => (fha || []).forEach(r => {
                    if (!r) return;
                    if (r.subId === value) slots.push({ obj: r, field: 'subId', where: where + ' FHA' });
                    if (Array.isArray(r.subIds) && r.subIds.indexOf(value) >= 0) slots.push({ obj: r, field: 'subIds', isArray: true, where: where + ' FHA' });
                });
                fhaScan(typeof acFhaData !== 'undefined' ? acFhaData : [], 'AC');
                _sysList().forEach(s => fhaScan(s.fha, s.name || s.id));
                const fcimScan = (rows, where) => (rows || []).forEach(r => { if (r && r.subId === value) slots.push({ obj: r, field: 'subId', where }); });
                fcimScan(typeof acFcimData !== 'undefined' ? acFcimData : [], 'AC FCIM');
                _sysList().forEach(s => fcimScan(s.fcim, (s.name || s.id) + ' FCIM'));
                (typeof zsaData !== 'undefined' ? zsaData : []).forEach(z => {
                    if (z && Array.isArray(z.housedFunctions) && z.housedFunctions.indexOf(value) >= 0)
                        slots.push({ obj: z, field: 'housedFunctions', isArray: true, where: 'ZSA zone ' + z.zoneId });
                });
                (typeof itemsData !== 'undefined' ? itemsData : []).forEach(i => {
                    if (i && Array.isArray(i.traceIds) && i.traceIds.indexOf(value) >= 0)
                        slots.push({ obj: i, field: 'traceIds', isArray: true, where: 'Item ' + (i.itemId || '') });
                });
                _reqRefs(value, slots);
                return slots;
            }
        },
        zoneId: {
            label: 'Zone ID',
            owners: () => (typeof zsaData !== 'undefined' ? zsaData : []).filter(Boolean).map(z => ({ id: 'zsa:' + (z.internalId != null ? z.internalId : z.zoneId), key: z.zoneId })),
            refs: value => {
                const slots = [];
                (typeof praData !== 'undefined' ? praData : []).forEach(p => {
                    if (p && Array.isArray(p.affectedZones) && p.affectedZones.indexOf(value) >= 0)
                        slots.push({ obj: p, field: 'affectedZones', isArray: true, where: 'PRA ' + (p.praId || '') });
                });
                return slots;
            }
        },
        itemId: {
            label: 'Item / LRU ID',
            owners: () => (typeof itemsData !== 'undefined' ? itemsData : []).filter(Boolean).map(i => ({ id: 'item:' + i.internalId, key: i.itemId })),
            refs: value => {
                const slots = [];
                const pc = _pc();
                const scanList = (list, where) => (list || []).forEach(t => { if (t && t.itemId === value) slots.push({ obj: t, field: 'itemId', where }); });
                if (pc && pc.ram) scanList(pc.ram.tasks, 'RAM maintainability tasks');
                if (pc && pc.mxAnalytics) {
                    scanList(pc.mxAnalytics.msis, 'MSG-3 MSIs');
                    scanList(pc.mxAnalytics.spares, 'Spares');
                    scanList(pc.mxAnalytics.lora, 'LORA');
                }
                if (pc && pc.lcc) scanList(pc.lcc.items, 'LCC items');
                (typeof fmeaData !== 'undefined' ? fmeaData : []).forEach(r => { if (r && r.itemId === value) slots.push({ obj: r, field: 'itemId', where: 'FMEA' }); });
                return slots;
            }
        },
        fcId: {
            label: 'Failure condition ID',
            owners: () => {
                const out = [];
                (typeof acFhaData !== 'undefined' ? acFhaData : []).forEach(f => f && out.push({ id: 'acfha:' + f.internalId, key: f.fcId }));
                _sysList().forEach(s => (s.fha || []).forEach(f => f && out.push({ id: 'sysfha-' + s.id + ':' + f.internalId, key: f.fcId })));
                return out;
            },
            refs: value => {
                const slots = [];
                const fcimScan = (rows, where) => (rows || []).forEach(r => {
                    if (!r) return;
                    ['tlId', 'plId', 'mId'].forEach(f => { if (r[f] === value) slots.push({ obj: r, field: f, where }); });
                });
                fcimScan(typeof acFcimData !== 'undefined' ? acFcimData : [], 'AC FCIM');
                _sysList().forEach(s => fcimScan(s.fcim, (s.name || s.id) + ' FCIM'));
                _reqRefs(value, slots);
                return slots;
            }
        },
        praId: {
            label: 'PRA ID',
            owners: () => (typeof praData !== 'undefined' ? praData : []).filter(Boolean).map(p => ({ id: 'pra:' + (p.internalId != null ? p.internalId : p.praId), key: p.praId })),
            refs: value => { const slots = []; _reqRefs(value, slots); return slots; }
        }
    };

    // ------------------------------------------------------ snapshot + diff
    let _last = null;

    function _snap() {
        const m = {};
        Object.keys(KINDS).forEach(kind => {
            try { KINDS[kind].owners().forEach(o => { if (o.key) m[kind + '|' + o.id] = o.key; }); } catch (_) {}
        });
        return m;
    }

    // Diff the last baseline against now. Returns renames (with live ref
    // slots) and ALWAYS re-baselines, so each rename is reported once.
    function rgScan() {
        const cur = _snap();
        const renames = [];
        if (_last) {
            // current keys per kind — the ambiguity guard needs them
            const liveKeys = {};
            Object.keys(cur).forEach(idk => {
                const kind = idk.split('|')[0];
                (liveKeys[kind] = liveKeys[kind] || new Set()).add(cur[idk]);
            });
            Object.keys(cur).forEach(idk => {
                const prev = _last[idk], next = cur[idk];
                if (!prev || !next || prev === next) return;
                const kind = idk.split('|')[0];
                if (liveKeys[kind].has(prev)) return;   // old key still owned elsewhere — ambiguous, skip
                let refs = [];
                try { refs = KINDS[kind].refs(prev); } catch (_) {}
                renames.push({ kind, label: KINDS[kind].label, from: prev, to: next, refs });
            });
        }
        _last = cur;
        return renames;
    }

    function rgBaseline() { _last = _snap(); }

    // ------------------------------------------------------------ propagate
    function rgApply(rename) {
        let n = 0;
        (rename.refs || []).forEach(slot => {
            try {
                if (slot.isArray) {
                    const a = slot.obj[slot.field];
                    const ix = a.indexOf(rename.from);
                    if (ix >= 0) { a[ix] = rename.to; n++; }
                } else if (slot.obj[slot.field] === rename.from) {
                    slot.obj[slot.field] = rename.to;
                    n++;
                }
            } catch (_) {}
        });
        const pc = _pc();
        if (pc) {
            pc.renameLog = pc.renameLog || [];
            pc.renameLog.push({ kind: rename.kind, from: rename.from, to: rename.to, updated: n, at: new Date().toISOString() });
        }
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        return n;
    }

    // ------------------------------------------------------------- the modal
    let _queue = [];

    function _ensureModal() {
        let modal = document.getElementById('rg-modal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'rg-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML =
            '<div class="modal-content" style="max-width: 640px;">' +
            '<div class="modal-header">' +
            '<h2>Rename Detected</h2>' +
            '<button class="btn-red" style="margin:0;" onclick="rgCloseModal()">Close</button>' +
            '</div>' +
            '<div class="modal-body" style="padding: 18px 22px;">' +
            '<p style="font-size:12.5px; color:var(--color-text-secondary); margin:0 0 12px;">Other artifacts still reference the old identifier as text. Update them to keep the golden thread intact, or keep the old strings (Thread Integrity will flag them).</p>' +
            '<div id="rg-modal-list"></div>' +
            '</div></div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) window.rgCloseModal(); });
        return modal;
    }

    function _renderModal() {
        const modal = _ensureModal();
        const list = document.getElementById('rg-modal-list');
        if (!_queue.length) { window.rgCloseModal(); return; }
        list.innerHTML = _queue.map((r, i) => {
            const byWhere = {};
            r.refs.forEach(s => { byWhere[s.where] = (byWhere[s.where] || 0) + 1; });
            const whereStr = Object.keys(byWhere).map(w => _esc(w) + ' ×' + byWhere[w]).join(' · ');
            return '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-2); padding:10px 14px; margin-bottom:10px;">' +
                '<div style="font-size:13px;"><b>' + _esc(r.label) + '</b>: <span class="u-mono">' + _esc(r.from) + '</span> → <span class="u-mono">' + _esc(r.to) + '</span></div>' +
                '<div style="font-size:12px; color:var(--color-text-secondary); margin-top:4px;">' + r.refs.length + ' reference' + (r.refs.length === 1 ? '' : 's') + ' still point at the old id: ' + whereStr + '</div>' +
                '<div style="margin-top:8px; display:flex; gap:8px;">' +
                '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 12px;" onclick="rgApplyQueued(' + i + ')">Update references</button>' +
                '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 12px; opacity:0.7;" onclick="rgDismissQueued(' + i + ')">Keep old strings</button>' +
                '</div></div>';
        }).join('');
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);
    }

    window.rgCloseModal = function () {
        const modal = document.getElementById('rg-modal');
        if (!modal) return;
        modal.classList.remove('show');
        setTimeout(() => { modal.style.display = 'none'; }, 250);
    };
    window.rgApplyQueued = function (i) {
        const r = _queue[i];
        if (!r) return;
        const n = rgApply(r);
        _queue.splice(i, 1);
        try { if (typeof showToast === 'function') showToast(n + ' reference' + (n === 1 ? '' : 's') + ' updated: ' + r.from + ' → ' + r.to + '.', 'success', 3600); } catch (_) {}
        _renderModal();
    };
    window.rgDismissQueued = function (i) {
        _queue.splice(i, 1);
        _renderModal();
    };

    // -------------------------------------------------------------- the hook
    // Ride the autosave debounce: scheduleAutosave fires after every mutation.
    // Throttled so a burst of edits produces one scan.
    let _timer = null;
    function _checkSoon() {
        if (_timer) clearTimeout(_timer);
        _timer = setTimeout(() => {
            _timer = null;
            try {
                const renames = rgScan().filter(r => r.refs.length > 0);
                if (renames.length) { _queue.push(...renames); _renderModal(); }
            } catch (_) {}
        }, 900);
    }

    (function wrap() {
        if (typeof window.scheduleAutosave === 'function' && !window.scheduleAutosave._rgWrapped) {
            const orig = window.scheduleAutosave;
            const wrapped = function () {
                const r = orig.apply(this, arguments);
                try { _checkSoon(); } catch (_) {}
                return r;
            };
            wrapped._rgWrapped = true;
            window.scheduleAutosave = wrapped;
        }
        // Project apply/load resets the baseline — restores, recoveries, and
        // round-trip proofs must never read as mass renames.
        if (typeof window._applyProjectData === 'function' && !window._applyProjectData._rgWrapped) {
            const orig = window._applyProjectData;
            const wrapped = function () {
                const r = orig.apply(this, arguments);
                try { _queue = []; rgBaseline(); } catch (_) {}
                return r;
            };
            wrapped._rgWrapped = true;
            window._applyProjectData = wrapped;
        }
    })();

    // Initial baseline once the project data exists.
    (function boot(tries) {
        if (typeof acFhaData !== 'undefined' && typeof projectConfig !== 'undefined') { rgBaseline(); return; }
        if (tries > 0) setTimeout(() => boot(tries - 1), 400);
    })(25);

    // ------------------------------------------------------------- exports
    window.rgScan = rgScan;
    window.rgApply = rgApply;
    window.rgBaseline = rgBaseline;
    window._rgKinds = KINDS;
})();
