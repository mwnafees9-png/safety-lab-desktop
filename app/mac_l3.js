// ============================================================================
// mac_l3.js — v1.0 — M1 phase 1: typed deviation lanes on the MAC model.
//
// The L0–L2 MAC model speaks availability: min-of clauses over systems,
// compiled to loss-lane trees by macCompile (untouched here). L3 adds what
// real MBSA needs: TYPED deviations — loss / erroneous / inadvertent — as
// first-class propagation, per the schema contract already deployed and
// enforced (mbsa_schema.js, INV-16).
//
// DRAFT-1 SEMANTICS (deliberately small, exactly documented):
//   · rule.flows: [{from, to, lane, transfer}] describe how a deviation of
//     that lane travels between systems in the context of the protected
//     function. transfer 'pass' propagates; 'transform' propagates with the
//     hop recorded (the deviation changes form but survives); 'block' kills
//     the edge (a monitor/comparator claim — and every block is a CLAIM the
//     CMA must own, so blocks are enumerated, never silent).
//   · A non-loss deviation CONDITION for a rule = any source system whose
//     deviation reaches a clause member through unblocked lane edges.
//     Deterministic reachability — same BFS discipline as the CEA graph.
//   · Loss lane stays exactly the compiled clause arithmetic (macCompile /
//     fault_sim own it); L3 never re-implements it.
//
// FMEA FROM THE MODEL: functional-FMEA candidates generated per system and
// lane — local effect (the deviation), next effect (systems reached, hops
// recorded), end effect (FCs tripped: loss lane via the fault-sim clause
// arithmetic, other lanes via reach) — delivered as CANDIDATES with the
// AutoReq idempotence discipline (stable sourceIds, fingerprints, preview
// before apply, engineer signs; never auto-written).
// ============================================================================
(function () {
    'use strict';

    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}; }
    function _rules() { return (_pc().macModels || []).filter(Boolean); }
    function _sysList() { return (typeof systemsData !== 'undefined' ? systemsData : []) || []; }
    function _sysName(id) { const s = _sysList().find(x => x.id === id); return s ? (s.name || s.id) : id; }
    function _sevRank(s) { return (typeof SEVERITY_RANK !== 'undefined' ? SEVERITY_RANK[s] : 0) || 0; }
    function _fp() { return Array.prototype.slice.call(arguments).map(x => JSON.stringify(x)).join('§'); }

    // ------------------------------------------------------- lane reachability
    // Sources whose <lane> deviation reaches any clause member of the rule.
    // Returns [{source, path:[{from,to,transfer}], transformed}] — paths are
    // shortest-first (BFS); 'block' edges are excluded AND collected.
    function l3Reach(rule, lane) {
        const members = new Set();
        (rule.clauses || []).forEach(cl => (cl.of || []).forEach(m => members.add(m)));
        const flows = (rule.flows || []).filter(f => f && (f.lane || 'loss') === lane);
        const blocked = flows.filter(f => f.transfer === 'block');
        const live = flows.filter(f => f.transfer !== 'block');
        const out = [];
        const sources = new Set(live.map(f => f.from));
        sources.forEach(src => {
            // BFS from src over live edges
            const seen = new Set([src]);
            let frontier = [{ at: src, path: [] }];
            let hit = null;
            let guard = 0;
            while (frontier.length && !hit && guard++ < 10) {
                const next = [];
                frontier.forEach(cur => {
                    live.filter(f => f.from === cur.at).forEach(f => {
                        const path = cur.path.concat([{ from: f.from, to: f.to, transfer: f.transfer || 'pass' }]);
                        if (members.has(f.to)) { hit = hit || path; return; }
                        if (!seen.has(f.to)) { seen.add(f.to); next.push({ at: f.to, path }); }
                    });
                });
                frontier = next;
            }
            if (hit) out.push({ source: src, path: hit, transformed: hit.some(h => h.transfer === 'transform') });
        });
        return { reaching: out, blocks: blocked.map(f => ({ from: f.from, to: f.to, note: f.note || '' })) };
    }

    // Evaluate a lane condition under an injection: does a deviation
    // originating in failedSet reach the rule's members?
    function l3Evaluate(rule, lane, failedIds) {
        const failed = new Set(failedIds || []);
        const r = l3Reach(rule, lane);
        const hits = r.reaching.filter(x => failed.has(x.source));
        return { tripped: hits.length > 0, hits, blocks: r.blocks };
    }

    // Rules that carry any non-loss lane content.
    function l3Rules() {
        return _rules().filter(r => (Array.isArray(r.lanes) && r.lanes.some(l => l !== 'loss')) ||
            (Array.isArray(r.flows) && r.flows.some(f => f && f.lane && f.lane !== 'loss')));
    }

    // FCs protected by a rule (via its subId), worst-first.
    function _ruleFcs(rule) {
        const out = [];
        ((typeof acFhaData !== 'undefined' ? acFhaData : []) || []).forEach(f => {
            if (!f) return;
            const subs = [f.subId].concat(Array.isArray(f.subIds) ? f.subIds : []).filter(Boolean);
            if (subs.indexOf(rule.subId) >= 0) out.push({ fcId: f.fcId || '', severity: f.severity || '' });
        });
        return out.sort((a, b) => _sevRank(b.severity) - _sevRank(a.severity));
    }

    // --------------------------------------------- FMEA candidates (functional)
    // One candidate per (system, lane-relevant failure mode), effects derived:
    //   loss     → end effects from the fault-sim clause arithmetic (one engine,
    //              never re-implemented)
    //   erroneous/inadvertent → end effects from lane reachability
    function l3FmeaCandidates() {
        const out = [];
        const systems = new Set();
        _rules().forEach(r => {
            (r.clauses || []).forEach(cl => (cl.of || []).forEach(m => systems.add(m)));
            (r.flows || []).forEach(f => { if (f) { systems.add(f.from); systems.add(f.to); } });
        });

        systems.forEach(sid => {
            const name = _sysName(sid);
            // ---- loss mode (every modeled system has one)
            if (typeof window.fsEvaluate === 'function') {
                try {
                    const r = window.fsEvaluate([sid]);
                    const worst = r.trippedFcs[0];
                    const next = r.closure.filter(c => c.down && c.kind === 'system').map(c => c.name);
                    out.push({
                        sourceId: 'l3:' + sid + ':loss',
                        fmeaType: 'functional', scope: 'system', owningSystemId: sid,
                        part: name, mode: 'Total loss of function (all outputs)',
                        localEffect: 'All ' + name + ' outputs unavailable',
                        nextEffect: next.length ? 'Availability cascade: ' + next.join(', ') : 'No downstream availability cascade',
                        endEffect: r.trippedFcs.length
                            ? r.trippedFcs.map(fc => fc.fcId + ' [' + fc.severity + ']').join(', ') + ' — ' + r.breaches.map(b => b.subId + ': ' + b.detail).join(' · ')
                            : 'No modeled failure condition tripped (redundancy holds)',
                        detection: '', severity: worst ? worst.severity : '',
                        compensating: '', remarks: 'Generated from the MAC model (loss lane, clause arithmetic).',
                        lane: 'loss',
                        fingerprint: _fp('loss', sid, r.trippedFcs, r.breaches.map(b => b.ruleId).sort())
                    });
                } catch (_) {}
            }
            // ---- non-loss lanes: one mode per lane the system SOURCES
            l3Rules().forEach(rule => {
                (rule.lanes || ['loss']).filter(l => l !== 'loss').forEach(lane => {
                    const reach = l3Reach(rule, lane);
                    const hit = reach.reaching.find(x => x.source === sid);
                    if (!hit) return;
                    const fcs = _ruleFcs(rule);
                    const worst = fcs[0];
                    const pathStr = hit.path.map(h => h.from + ' —' + h.transfer + '→ ' + h.to).join(' ; ');
                    out.push({
                        sourceId: 'l3:' + sid + ':' + lane + ':' + rule.id,
                        fmeaType: 'functional', scope: 'system', owningSystemId: sid,
                        part: name, mode: (lane === 'erroneous' ? 'Erroneous output (undetected wrong data/behavior)' : 'Inadvertent operation (uncommanded function)'),
                        localEffect: (lane === 'erroneous' ? 'Wrong output delivered as valid' : 'Function activates without command'),
                        nextEffect: 'Propagates via ' + pathStr + (hit.transformed ? ' (transformed en route)' : ''),
                        endEffect: fcs.length ? fcs.map(fc => fc.fcId + ' [' + fc.severity + ']').join(', ') : rule.subId + ' ' + lane + ' condition',
                        detection: reach.blocks.length ? 'Blocked paths claimed: ' + reach.blocks.map(b => b.from + '→' + b.to).join(', ') + ' (CMA must own each block)' : 'No blocking claim on this lane',
                        severity: worst ? worst.severity : '',
                        compensating: '', remarks: 'Generated from the MAC model (' + lane + ' lane, rule ' + rule.id + ').',
                        lane, fingerprint: _fp(lane, sid, rule.id, hit.path, reach.blocks)
                    });
                });
            });
        });
        return out;
    }

    // ------------------------------------------------- preview / apply (two-lane)
    // AutoReq discipline: candidates match existing rows by sourceId; changed
    // fingerprints update in place, vanished sources flag, nothing deletes.
    function l3FmeaPreview() {
        const cands = l3FmeaCandidates();
        const store = (typeof fmeaData !== 'undefined' ? fmeaData : []) || [];
        const existing = new Map();
        store.forEach(r => { if (r && r.l3Source && r.l3Source.sourceId) existing.set(r.l3Source.sourceId, r); });
        const isNew = [], isUpdated = [], unchanged = [];
        cands.forEach(c => {
            const prev = existing.get(c.sourceId);
            if (!prev) isNew.push(c);
            else if (prev.l3Source.fingerprint !== c.fingerprint) isUpdated.push({ prev, next: c });
            else unchanged.push({ prev, next: c });
        });
        const candIds = new Set(cands.map(c => c.sourceId));
        const orphaned = store.filter(r => r && r.l3Source && !candIds.has(r.l3Source.sourceId));
        return { isNew, isUpdated, unchanged, orphaned };
    }

    function l3FmeaApply(merge, signedBy) {
        if (!signedBy || !String(signedBy).trim()) return 0;
        merge = merge || l3FmeaPreview();
        const store = (typeof fmeaData !== 'undefined' ? fmeaData : null);
        if (!store) return 0;
        let n = 0;
        merge.isNew.forEach(c => {
            const row = {
                internalId: (typeof internalIdCounter !== 'undefined' ? internalIdCounter++ : Date.now() + n),
                fmeaType: 'functional', scope: c.scope, owningSystemId: c.owningSystemId,
                fmeaId: 'FM-L3-' + (store.filter(r => r && r.l3Source).length + n + 1),
                part: c.part, mode: c.mode, localEffect: c.localEffect, nextEffect: c.nextEffect,
                endEffect: c.endEffect, detection: c.detection, severity: c.severity,
                compensating: c.compensating, remarks: c.remarks, beId: 0, parentLibKey: '',
                rate: 0, time: 0, prob: 0,
                l3Source: { sourceId: c.sourceId, lane: c.lane, fingerprint: c.fingerprint, by: signedBy, at: new Date().toISOString() }
            };
            store.push(row);
            n++;
        });
        merge.isUpdated.forEach(({ prev, next }) => {
            prev.mode = next.mode; prev.localEffect = next.localEffect; prev.nextEffect = next.nextEffect;
            prev.endEffect = next.endEffect; prev.detection = next.detection; prev.severity = next.severity;
            prev.remarks = next.remarks;
            prev.l3Source = { sourceId: next.sourceId, lane: next.lane, fingerprint: next.fingerprint, by: signedBy, at: new Date().toISOString() };
            n++;
        });
        try { if (typeof window.jrnl === 'function') window.jrnl('l3-fmea', 'model-generated FMEA applied: ' + n + ' row(s), signed ' + signedBy); } catch (_) {}
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        return n;
    }

    // -------------------------------------- block claims → the CCA discipline
    // Every 'block' transfer is an independence/monitor CLAIM. Surface them in
    // the sweep so an unowned block can't hide inside the model.
    (function register() {
        function reg() {
            if (typeof window.invRegister !== 'function') return false;
            window.invRegister({
                id: 'INV-17', name: 'Every lane-blocking claim in the model is owned by a CMA', sev: 'advisory',
                run: () => {
                    const fails = []; let checked = 0;
                    l3Rules().forEach(rule => {
                        (rule.lanes || []).filter(l => l !== 'loss').forEach(lane => {
                            l3Reach(rule, lane).blocks.forEach(b => {
                                checked++;
                                const owned = ((typeof cmaData !== 'undefined' ? cmaData : []) || []).some(c =>
                                    c && ((c.findings || '') + ' ' + (c.desc || '') + ' ' + (c.title || '')).indexOf(b.from) >= 0);
                                if (!owned) fails.push('Rule ' + rule.id + ' (' + lane + '): block ' + b.from + '→' + b.to + ' is a monitor/independence claim with no CMA owning it');
                            });
                        });
                    });
                    return { checked, fails };
                }
            });
            return true;
        }
        if (!reg()) { let tries = 20; const t = setInterval(() => { if (reg() || --tries <= 0) clearInterval(t); }, 300); }
    })();

    // ------------------------------------------------------------- exports
    window.l3Reach = l3Reach;
    window.l3Evaluate = l3Evaluate;
    window.l3Rules = l3Rules;
    window.l3FmeaCandidates = l3FmeaCandidates;
    window.l3FmeaPreview = l3FmeaPreview;
    window.l3FmeaApply = l3FmeaApply;
})();
