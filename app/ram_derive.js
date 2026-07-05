// ram_derive.js — Phase F9: the deterministic R&M auto-derivation engine.
// BORN MODULAR: new file, zero edits to other modules (buttons are injected
// by wrapping the render functions, same discipline as the switchTab chain).
//
// Doctrine: if the model already knows it, the user never types it. Every
// derivation here is PURE — reads of the live safety model, FMEA, trees and
// ledger; no AI anywhere. Derived records are PROPOSALS carrying an `origin`
// provenance string; creating them is explicit (a click), so the two-lane
// rule holds: the computed lane proposes, the engineer's adoption is the act.
// All derivations are idempotent — re-running creates nothing new.
//
//   deriveMaintTasks  CCMR latents & wear-outs → maintenance-task proposals
//                     (event, interval from τ/dormancy) for unowned events.
//   deriveSpares      ledger-linked items (itemId + λ) → Poisson spares cases
//                     using fleet settings.
//   deriveAlloc       as-built λ shares per system → allocation seed (labeled
//                     as a starting point, not a target justification).
//   deriveRbdAll      every cat/haz-linked tree → RBD dual model.
//   deriveMsg3        items → MSI candidates with `hidden`/`safety` answers
//                     DERIVED (latent exposure / no-detection ⇒ hidden;
//                     membership on a Cat/Haz golden thread ⇒ safety);
//                     ops/econ stay elicited. FMEA rows → functional-failure
//                     import with `evident` suggested from the detection field.
//   fracasCandidates  ranked basic-event list (latents + FMEA-linked) for
//                     field-record entry assistance.

(function () {
    'use strict';

    function _save() { try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {} }
    function _toast(m, k, t) { try { if (typeof showToast === 'function') showToast(m, k || 'info', t || 3000); } catch (_) {} }
    function _access() { return (typeof window._ramHasAccess === 'function') ? window._ramHasAccess() : true; }
    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // ------------------------------------------------------------ helpers
    function _ledger() { return (typeof window._ramStore === 'function') ? window._ramStore() : { tasks: [], field: [], dispatch: { targets: [], records: [] } }; }
    function _rel() {
        if (!projectConfig.relAnalytics) projectConfig.relAnalytics = { lifeData: [], growth: [], alloc: null, spares: [], demo: null };
        return projectConfig.relAnalytics;
    }
    function _mx() {
        if (!projectConfig.mxAnalytics) projectConfig.mxAnalytics = { annualFH: 600, lora: [] };
        return projectConfig.mxAnalytics;
    }
    function _find(ref) { try { return (typeof _fmesFindBe === 'function') ? _fmesFindBe(ref) : null; } catch (_) { return null; } }
    function _ownedNodeIds() {
        const set = new Set();
        _ledger().tasks.forEach(t => { const h = _find(t.beRef); if (h) set.add(String(h.node.id)); });
        return set;
    }
    function _isLatentNode(n) {
        return !!(n && n.type !== 'gate' && ((n.repairModel === 'periodic' && n.tau > 0) || (n.exposureMode === 'latent' && n.dormancyInterval > 0)));
    }

    // ================================================== 1. maintenance tasks
    // Every latent/periodic event and wear-out candidate that no task owns is
    // a maintenance obligation the safety analysis already claimed.
    function deriveMaintTasks(apply) {
        const owned = _ownedNodeIds();
        const proposals = [];
        try {
            (typeof ccmrLatentSweep === 'function' ? ccmrLatentSweep(true) : []).forEach(r => {
                const hit = _find(r.event);
                if (!hit || owned.has(String(hit.node.id))) return;
                owned.add(String(hit.node.id));
                proposals.push({
                    name: (r.detection === 'periodic test' ? 'Periodic test · ' : 'Inspection · ') + (r.name || r.event),
                    beRef: r.event, interval: r.interval,
                    origin: 'derived: CCMR ' + r.detection + ' on ' + (r.fcId || r.pageName),
                });
            });
            (typeof ccmrWearoutList === 'function' ? ccmrWearoutList() : []).forEach(r => {
                const hit = _find(r.event);
                if (!hit || owned.has(String(hit.node.id))) return;
                owned.add(String(hit.node.id));
                proposals.push({
                    name: 'Wear-out task (RS/DS candidate) · ' + r.event,
                    beRef: r.event, interval: 0,
                    origin: 'derived: mechanical wear-out (' + (r.group || r.libraryKey) + ')',
                });
            });
        } catch (_) {}
        if (apply && proposals.length) {
            proposals.forEach((p, i) => _ledger().tasks.push({
                id: 'RAM-d' + Date.now() + '-' + i, name: p.name, itemId: '', beRef: p.beRef,
                activeRepair: 0, logistics: 0, admin: 0, interval: p.interval, demonstrated: null, by: '',
                origin: p.origin,
            }));
            _save();
        }
        return proposals;
    }

    // ========================================================== 2. spares
    function deriveSpares(apply) {
        const S = _rel();
        const mx = _mx();
        const have = new Set(S.spares.map(x => x.name));
        const byItem = new Map();
        _ledger().tasks.forEach(t => {
            if (!t.itemId || !t.beRef) return;
            const h = _find(t.beRef);
            const lam = h ? ((typeof getEffectiveLambda === 'function' ? getEffectiveLambda(h.node) : h.node.lambda) || 0) : 0;
            if (lam > 0 && !byItem.has(t.itemId)) byItem.set(t.itemId, lam);
        });
        const proposals = [];
        byItem.forEach((lam, itemId) => {
            const item = ((typeof itemsData !== 'undefined' ? itemsData : []) || []).find(i => i.itemId === itemId);
            const name = item ? item.name : itemId;
            if (have.has(name)) return;
            proposals.push({ name, lambda: lam, units: mx.fleetUnits || 6, tat: 720, pl: 0.95, origin: 'derived: ledger link ' + itemId });
        });
        if (apply && proposals.length) {
            proposals.forEach((p, i) => S.spares.push(Object.assign({ id: 'SP-d' + Date.now() + '-' + i }, p)));
            _save();
        }
        return proposals;
    }

    // ======================================================== 3. allocation
    // Seeds the allocation table from the as-built λ shares — an explicit
    // STARTING POINT for target negotiation, never a justification (labeled).
    function deriveAlloc(apply) {
        if (typeof window._ramPredictionRows !== 'function') return null;
        const groups = window._ramPredictionRows();
        if (!groups.size) return null;
        let total = 0;
        const rows = [];
        groups.forEach((list, sysName) => {
            const sub = list.reduce((a, r) => a + r.lambda, 0);
            total += sub;
            rows.push({ name: sysName, sub });
        });
        if (!(total > 0)) return null;
        const alloc = {
            target: total, at: new Date().toISOString(),
            origin: 'derived: seeded from the as-built rollup — starting weights for target negotiation, not a compliance argument',
            rows: rows.map(r => ({ name: r.name, weight: +(r.sub / total * 100).toFixed(1), lambda: r.sub })),
        };
        if (apply) { _rel().alloc = alloc; _save(); }
        return alloc;
    }

    // ============================================================ 4. RBDs
    function deriveRbdAll(apply) {
        if (!projectConfig.rbd) projectConfig.rbd = { models: [] };
        const have = new Set(projectConfig.rbd.models.map(m => m.fromPage).filter(Boolean));
        const critIds = new Set();
        ((typeof acFhaData !== 'undefined' ? acFhaData : []) || []).forEach(f => {
            if (f.severity === 'Catastrophic' || f.severity === 'Hazardous') critIds.add(String(f.internalId));
        });
        const proposals = [];
        ((typeof ftaPages !== 'undefined' ? ftaPages : []) || []).forEach(p => {
            if (!p.root || have.has(p.id)) return;
            const linked = (Array.isArray(p.linkedFhaIds) ? p.linkedFhaIds : (p.linkedFhaId ? [p.linkedFhaId] : [])).map(String);
            if (!linked.some(id => critIds.has(id))) return;
            proposals.push({ pageId: p.id, name: 'RBD dual · ' + (p.name || p.id) });
        });
        if (apply && proposals.length) {
            proposals.forEach((pr, i) => projectConfig.rbd.models.push({
                id: 'RBD-d' + Date.now() + '-' + i, name: pr.name, dsl: null, fromPage: pr.pageId,
                origin: 'derived: cat/haz-linked tree',
            }));
            _save();
        }
        return proposals;
    }

    // ========================================================== 5. MSG-3
    // MSI candidates with the derivable half of the selection answered:
    //   hidden — a linked event is latent/periodic-tested, or a linked FMEA
    //            mode has no detection means;
    //   safety — a linked event sits on a Catastrophic/Hazardous golden thread.
    // ops/econ cannot be derived from the model — they stay elicited (null-safe
    // false here; the engineer edits the card). Items with NEITHER signal are
    // not proposed: silence is not evidence.
    function _itemSignals(itemId) {
        const beNodes = [];
        _ledger().tasks.forEach(t => {
            if (t.itemId !== itemId || !t.beRef) return;
            const h = _find(t.beRef);
            if (h) beNodes.push(h);
        });
        let hidden = beNodes.some(h => _isLatentNode(h.node));
        let safety = false;
        try {
            if (typeof window.ramThreadEvidence === 'function' && beNodes.length) {
                // reuse the thread machinery: any linked event whose page maps to a crit FC
                const pageFcMap = (typeof window._ramPageFcMap === 'function') ? window._ramPageFcMap() : null;
                if (pageFcMap) {
                    const crit = new Set();
                    (acFhaData || []).forEach(f => { if (f.severity === 'Catastrophic' || f.severity === 'Hazardous') crit.add(String(f.internalId)); });
                    safety = beNodes.some(h => Array.from(pageFcMap.get(String(h.page.id)) || []).some(id => crit.has(String(id))));
                }
            }
        } catch (_) {}
        try {
            (typeof fmeaData !== 'undefined' ? fmeaData : []).forEach(r => {
                if (!r.beId) return;
                if (beNodes.some(h => String(h.node.id) === String(r.beId)) && !String(r.detection || '').trim()) hidden = true;
            });
        } catch (_) {}
        return { hidden, safety };
    }
    function deriveMsg3(apply) {
        if (!projectConfig.msg3) projectConfig.msg3 = { msis: [] };
        const have = new Set(projectConfig.msg3.msis.map(m => m.itemId).filter(Boolean));
        const proposals = [];
        ((typeof itemsData !== 'undefined' ? itemsData : []) || []).forEach(item => {
            if (have.has(item.itemId)) return;
            const sig = _itemSignals(item.itemId);
            if (!sig.hidden && !sig.safety) return;   // silence is not evidence
            proposals.push({
                name: item.name, itemId: item.itemId,
                sel: { hidden: sig.hidden, safety: sig.safety, ops: false, econ: false },
                origin: 'derived: ' + [sig.hidden ? 'latent/no-detection linkage' : null, sig.safety ? 'on a Cat/Haz thread' : null].filter(Boolean).join(' + '),
            });
        });
        if (apply && proposals.length) {
            proposals.forEach((p, i) => projectConfig.msg3.msis.push({
                id: 'MSI-d' + Date.now() + '-' + i, name: p.name, itemId: p.itemId, sel: p.sel, ffs: [], origin: p.origin,
            }));
            _save();
        }
        return proposals;
    }
    // FMEA → functional-failure import for one MSI. `evident` is SUGGESTED
    // from the detection field (a detected mode is evident to somebody —
    // confirm whether that somebody is the operating crew); safety stays null.
    function msg3ImportFfs(msiId) {
        const m = (projectConfig.msg3 && projectConfig.msg3.msis || []).find(x => x.id === msiId);
        if (!m) return 0;
        const beIds = new Set();
        _ledger().tasks.forEach(t => {
            if (t.itemId !== m.itemId || !t.beRef) return;
            const h = _find(t.beRef);
            if (h) beIds.add(String(h.node.id));
        });
        const havePairs = new Set(m.ffs.map(f => (f.func || '') + '§' + (f.failure || '')));
        let n = 0;
        ((typeof fmeaData !== 'undefined' ? fmeaData : []) || []).forEach(r => {
            const linked = r.beId && beIds.has(String(r.beId));
            if (!linked) return;
            const func = (r.part || m.name) + ' — intended function';
            const key = func + '§' + (r.mode || '');
            if (havePairs.has(key)) return;
            havePairs.add(key);
            m.ffs.push({
                id: 'FF-d' + Date.now() + '-' + n, func, failure: r.mode || '', effect: r.endEffect || '', cause: r.cause || '',
                evident: String(r.detection || '').trim() ? true : false,   // SUGGESTION — cycle to correct
                safety: null, operational: null, tasks: [],
                origin: 'derived: FMEA ' + (r.fmeaId || r.internalId) + ' (evident suggested from detection — confirm)',
            });
            n++;
        });
        if (n) { _save(); if (typeof renderMsg3Page === 'function') renderMsg3Page(); }
        _toast(n ? n + ' functional failure(s) imported from the FMEA — evident answers are suggestions; confirm each.' : 'No linked FMEA modes to import (link ledger tasks to this LRU first).', n ? 'success' : 'info', 4500);
        return n;
    }

    // ================================================ 6. FRACAS assistance
    function fracasCandidates() {
        const out = [];
        const seen = new Set();
        try {
            (typeof ccmrLatentSweep === 'function' ? ccmrLatentSweep(true) : []).forEach(r => {
                if (seen.has(r.event)) return;
                seen.add(r.event);
                out.push({ ref: r.event, why: 'latent on ' + (r.fcId || r.pageName) });
            });
            (typeof fmeaData !== 'undefined' ? fmeaData : []).forEach(r => {
                if (!r.beId) return;
                const h = _find(String(r.beId));
                if (!h) return;
                const ref = h.node.displayId || String(h.node.id);
                if (seen.has(ref)) return;
                seen.add(ref);
                out.push({ ref, why: 'FMEA-linked (' + (r.part || '') + ')' });
            });
        } catch (_) {}
        return out.slice(0, 12);
    }

    // ------------------------------------------------- one-sweep entry point
    async function ramDeriveAll() {
        if (!_access()) { _toast('R&M derivation requires a Pro+ subscription.', 'warning', 3500); return; }
        const t = deriveMaintTasks(false).length;
        const s = deriveSpares(false).length;
        const r = deriveRbdAll(false).length;
        const m = deriveMsg3(false).length;
        const a = deriveAlloc(false);
        const summary = ['Deterministic derivation sweep — proposals from the live model:',
            '  ' + t + ' maintenance task(s) from CCMR latents/wear-outs',
            '  ' + s + ' spares case(s) from ledger-linked LRUs',
            '  ' + r + ' RBD dual(s) for cat/haz trees',
            '  ' + m + ' MSG-3 MSI candidate(s) (hidden/safety derived; ops/econ stay yours)',
            '  ' + (a ? 'allocation seed over ' + a.rows.length + ' system(s)' : 'no allocation seed (no as-built λ)'),
            '', 'Adopt all? Every record carries its derivation provenance.'].join('\n');
        const yes = await (typeof slConfirm === 'function' ? slConfirm(summary) : Promise.resolve(confirm(summary)));
        if (!yes) return;
        deriveMaintTasks(true); deriveSpares(true); deriveRbdAll(true); deriveMsg3(true); if (a) deriveAlloc(true);
        _toast('Adopted: ' + t + ' tasks · ' + s + ' spares · ' + r + ' RBDs · ' + m + ' MSIs' + (a ? ' · allocation seed' : '') + ' — all with derived-provenance.', 'success', 5000);
        try { if (typeof renderRamMxPage === 'function') renderRamMxPage(); } catch (_) {}
    }

    // ---------------------------------------------- inject toolbar buttons
    // Wrap the render functions (never edit the other modules): each page
    // gains its derivation affordance after its normal render.
    function _injectButton(hostId, html) {
        const host = document.getElementById(hostId);
        if (!host || !host.firstChild || host.querySelector('.ram-derive-btn')) return;
        const bar = document.createElement('div');
        bar.style.cssText = 'margin: 0 0 12px;';
        bar.innerHTML = html;
        host.insertBefore(bar, host.firstChild);
    }
    function _wrapRender(fnName, after) {
        if (typeof window[fnName] !== 'function' || window[fnName]._deriveWrapped) return;
        const orig = window[fnName];
        const wrapped = function () { const r = orig.apply(this, arguments); try { after(); } catch (_) {} return r; };
        wrapped._deriveWrapped = true;
        window[fnName] = wrapped;
    }
    _wrapRender('renderRamMxPage', () => _injectButton('ram-mx-host',
        '<button class="btn-cyan ram-derive-btn" onclick="ramDeriveAll()">⚙ Derive from model</button> ' +
        '<span style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">deterministic sweep: latents → tasks · LRUs → spares · trees → RBDs · items → MSI candidates · zero AI, full provenance</span>'));
    _wrapRender('renderRamAllocPage', () => _injectButton('ram-alloc-host',
        '<button class="btn-cyan ram-derive-btn" onclick="(async () => { const a = deriveAlloc(true); const s = deriveSpares(true); showToast(a || s.length ? \'Seeded from the as-built model (provenance recorded).\' : \'Nothing derivable yet — populate trees/ledger links first.\', \'info\', 4000); renderRamAllocPage(); })()">⚙ Seed from as-built model</button>'));
    _wrapRender('renderRamRbdPage', () => _injectButton('ram-rbd-host',
        '<button class="btn-cyan ram-derive-btn" onclick="const n = deriveRbdAll(true).length; showToast(n ? n + \' RBD dual(s) derived for cat/haz trees.\' : \'All cat/haz trees already have duals.\', \'info\', 3500); renderRamRbdPage();">⚙ Derive all cat/haz duals</button>'));
    _wrapRender('renderMsg3Page', () => {
        _injectButton('ram-msg3-host',
            '<button class="btn-cyan ram-derive-btn" onclick="const n = deriveMsg3(true).length; showToast(n ? n + \' MSI candidate(s) derived — hidden/safety answered from the model, ops/econ are yours.\' : \'No new candidates (items need ledger links with latent or cat/haz signals).\', \'info\', 4500); renderMsg3Page();">⚙ Derive MSI candidates</button>');
        // per-MSI FMEA import buttons
        try {
            document.querySelectorAll('#ram-msg3-host [data-msi-import]').forEach(b => b.remove());
            (projectConfig.msg3 && projectConfig.msg3.msis || []).forEach(m => {
                const btns = Array.from(document.querySelectorAll('#ram-msg3-host button')).filter(b => (b.getAttribute('onclick') || '').indexOf("msg3AddFf('" + m.id + "')") !== -1);
                btns.forEach(b => {
                    if (b.parentElement.querySelector('[data-msi-import]')) return;
                    const imp = document.createElement('button');
                    imp.className = 'btn-cyan';
                    imp.setAttribute('data-msi-import', m.id);
                    imp.style.cssText = 'font-size:11px; padding:3px 9px; margin-left:6px;';
                    imp.textContent = '⚙ Import FFs from FMEA';
                    imp.onclick = () => msg3ImportFfs(m.id);
                    b.parentElement.insertBefore(imp, b.nextSibling);
                });
            });
        } catch (_) {}
    });

    // ------------------------------------------------------------ exports
    window.ramDeriveAll = ramDeriveAll;
    window.deriveMaintTasks = deriveMaintTasks;
    window.deriveSpares = deriveSpares;
    window.deriveAlloc = deriveAlloc;
    window.deriveRbdAll = deriveRbdAll;
    window.deriveMsg3 = deriveMsg3;
    window.msg3ImportFfs = msg3ImportFfs;
    window.fracasCandidates = fracasCandidates;
})();
