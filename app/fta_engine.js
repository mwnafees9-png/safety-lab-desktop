/* ============================================================================
 * Safety Lab Aero — FTA cut-set engine (single source of truth)
 * ============================================================================
 * Moved verbatim out of safety_lab.js so the SAME deterministic code runs in:
 *   (a) the main page  — loaded as a classic <script> BEFORE safety_lab.js, so
 *       getCutsets / multiplyCutsets / getCombinations / _eventKey / _CUTSET_BUDGET /
 *       CutsetExplosionError are globals the app keeps calling unchanged; and
 *   (b) the cut-set Web Worker (#19) — via importScripts('fta_engine.js').
 *
 * Determinism: there is ONE implementation; the worker cannot diverge from the
 * main thread because it is literally the same file. The worker is fed a tree
 * with transfer gates pre-flattened (so it needs no app state), and returns
 * id-encoded cut sets the main thread maps back to real node objects.
 *
 * Air-gap / ITAR: no CDN, no network — importScripts is same-origin only; the
 * worker computes locally and emits nothing off-device.
 * ========================================================================== */
(function (root) {
'use strict';

// ── Cut-set explosion guard (deterministic-core safeguard) ───────────────────
// Minimal cut-set enumeration is an AND-product (Cartesian) that can blow up
// combinatorially on deep AND nesting / large voting gates. The guard ABORTS the
// whole enumeration (throws) the instant it would exceed _CUTSET_BUDGET — it NEVER
// truncates and returns a partial set (an incomplete cut-set set would silently
// under-report failure combinations). Under the budget, behaviour is byte-identical
// to before, so the deterministic result is unchanged. P(top) is computed by the BDD
// engine, not by cut sets, so an abort here never affects the certification probability.
var _CUTSET_BUDGET = 200000;
function CutsetExplosionError(count) {
    this.name = 'CutsetExplosionError';
    this.count = count || 0;
    this.message = 'Fault tree too complex to enumerate cut sets (' + (count ? count.toLocaleString() : 'over budget') + ' combinations exceeds the ' + _CUTSET_BUDGET.toLocaleString() + ' limit).';
    if (Error.captureStackTrace) Error.captureStackTrace(this, CutsetExplosionError);
}
CutsetExplosionError.prototype = Object.create(Error.prototype);
CutsetExplosionError.prototype.constructor = CutsetExplosionError;
function getCombinations(array, k) { let result = []; function combine(elements, k, start, current) { if (current.length === k) { result.push([...current]); if (result.length > _CUTSET_BUDGET) throw new CutsetExplosionError(result.length); return; } for (let i = start; i < elements.length; i++) { current.push(elements[i]); combine(elements, k, i + 1, current); current.pop(); } } combine(array, k, 0, []); return result; }
// Key cutset elements by logicalId so repeated events (same event in multiple branches)
// dedupe into a single occurrence in the AND-product result.
function _eventKey(e) { return e.logicalId != null ? e.logicalId : e.id; }
function multiplyCutsets(listA, listB) {
    let result = [];
    if (listA.length === 0) return listB;
    if (listB.length === 0) return listA;
    if (listA.length * listB.length > _CUTSET_BUDGET) throw new CutsetExplosionError(listA.length * listB.length);
    for (let a of listA) for (let b of listB) {
        let map = new Map();
        [...a, ...b].forEach(e => map.set(_eventKey(e), e));
        result.push(Array.from(map.values()));
    }
    return result;
}

function getCutsets(node, visited = new Set()) {
    if (!node) return []; if (visited.has(node.id)) return []; visited.add(node.id);
    if (node.type !== 'gate') return [[node]];
    if (node.gateType === 'TRANSFER' || node.transferOutTo) {
        const linkedId = node.transferOutTo || node.linkedPageId;
        // Resolve transfers via the page table when available (main thread). In a Worker the tree
        // is pre-flattened (no transfers remain), so this lookup is guarded and simply not needed.
        if (linkedId && typeof ftaPages !== 'undefined' && ftaPages) { const linkedPage = ftaPages.find(p => p.id === linkedId); if (linkedPage && linkedPage.root) return getCutsets(linkedPage.root, visited); }
        if (node.gateType === 'TRANSFER') return [];
        // Logical transfer-out with missing destination — fall through to local (empty) children below.
    }
    let actualChildren = node.children || node._children; if (!actualChildren || actualChildren.length === 0) return [];
    if (node.gateType === 'OR' || node.gateType === 'XOR') { let r = []; for (let c of actualChildren) { r.push(...getCutsets(c, new Set(visited))); if (r.length > _CUTSET_BUDGET) throw new CutsetExplosionError(r.length); } return r; }
    else if (node.gateType === 'AND' || node.gateType === 'INHIBIT' || node.gateType === 'PAND' || node.gateType === 'SPARE') {
        let r = getCutsets(actualChildren[0], new Set(visited));
        for (let i = 1; i < actualChildren.length; i++) r = multiplyCutsets(r, getCutsets(actualChildren[i], new Set(visited)));
        // Tag dynamic-gate cutsets so the report can flag the required ordering.
        if (node.gateType === 'PAND' || node.gateType === 'SPARE') {
            const orderTags = actualChildren.map(c => c.displayId || '?');
            r.forEach(cs => { cs.dynamicOrigin = node.gateType; cs.dynamicOrder = orderTags.join(node.gateType === 'PAND' ? ' → ' : ' ⇉ '); });
        }
        return r;
    }
    else if (node.gateType === 'FDEP') { return []; }
    else if (node.gateType === 'VOTING') { let c = actualChildren.map(ch => getCutsets(ch, new Set(visited))); let k = Math.min(node.votingK || 2, actualChildren.length); let combs = getCombinations(c, k); let r = []; for (let comb of combs) { let mult = comb[0]; for(let i=1; i<k; i++) mult = multiplyCutsets(mult, comb[i]); r.push(...mult); if (r.length > _CUTSET_BUDGET) throw new CutsetExplosionError(r.length); } return r; }  /* Phase 44 — default K=2 for safety. */
    return [];
}

// ── Worker support (#19) ─────────────────────────────────────────────────────
// Pre-flatten transfer gates into a self-contained tree so the Worker needs no app
// state. Inlines each resolvable transfer with the linked page's root (mirroring the
// getCutsets transfer recursion), and builds an id→node index for result reconstruction.
function _cloneNodeShallow(n) { const c = {}; for (const k in n) { if (k !== 'children' && k !== '_children') c[k] = n[k]; } return c; }
function flattenTransfers(rootNode, pages) {
    const index = {};
    function rec(node, seenPages) {
        if (!node) return null;
        if (node.gateType === 'TRANSFER' || node.transferOutTo) {
            const linkedId = node.transferOutTo || node.linkedPageId;
            if (linkedId && !seenPages.has(linkedId)) {
                const lp = (pages || []).find(function (p) { return p.id === linkedId; });
                if (lp && lp.root) { const s2 = new Set(seenPages); s2.add(linkedId); return rec(lp.root, s2); }
            }
            // Unresolved / cyclic transfer → keep node as-is; getCutsets yields [] for it.
        }
        const clone = _cloneNodeShallow(node);
        index[clone.id] = clone;
        const kids = node.children || node._children;
        if (kids && kids.length) clone.children = kids.map(function (c) { return rec(c, seenPages); }).filter(Boolean);
        return clone;
    }
    const newRoot = rec(rootNode, new Set());
    return { root: newRoot, index: index };
}
// Run enumeration and encode each cut set as { ids:[...], dyn:{o,ord}|null } — fully
// structured-cloneable (no node refs, no custom array props lost in transit).
function enumerateForWorker(flatRoot) {
    const cutsets = getCutsets(flatRoot);
    return cutsets.map(function (cs) {
        const enc = { ids: cs.map(function (e) { return e.id; }) };
        if (cs.dynamicOrigin) enc.dyn = { o: cs.dynamicOrigin, ord: cs.dynamicOrder };
        return enc;
    });
}

// ── #17 — BDD exact P(top) + importance (worker-offloadable) ─────────────────────────────────
// Pure over the tree structure + BAKED node probabilities (node.probability / beta/gamma/delta /
// ccfGroup). The entangled probability-derivation (exposure/phases/config/Markov) runs on the main
// thread and bakes node.probability BEFORE this — so the BDD combinatorics here need no app state
// (transfers handled by pre-flattening, same as the cut-set path). Copied verbatim from the
// main-thread engine; a parity harness asserts identical P(top)/importance.
const BDD = (function () {
    const T0 = { id: 0, isTerminal: true, value: false, varIdx: Infinity };
    const T1 = { id: 1, isTerminal: true, value: true,  varIdx: Infinity };
    let nextId = 2;
    const uniqueTable  = new Map();
    const computedTable = new Map();
    function reset() { nextId = 2; uniqueTable.clear(); computedTable.clear(); }
    function makeNode(varIdx, low, high) {
        if (low === high) return low;
        const key = varIdx + '|' + low.id + '|' + high.id;
        const cached = uniqueTable.get(key);
        if (cached) return cached;
        const node = { id: nextId++, varIdx, low, high, isTerminal: false };
        uniqueTable.set(key, node);
        return node;
    }
    function variable(varIdx) { return makeNode(varIdx, T0, T1); }
    function topVar(f, g) { return Math.min(f.varIdx, g.varIdx); }
    function apply(op, f, g) {
        if (op === 'and') {
            if (f === T0 || g === T0) return T0;
            if (f === T1) return g;
            if (g === T1) return f;
        } else if (op === 'or') {
            if (f === T1 || g === T1) return T1;
            if (f === T0) return g;
            if (g === T0) return f;
        } else if (op === 'xor') {
            if (f === T0) return g;
            if (g === T0) return f;
            if (f === g)  return T0;
        }
        const key = op + '|' + f.id + '|' + g.id;
        const cached = computedTable.get(key);
        if (cached) return cached;
        const v = topVar(f, g);
        const f0 = f.varIdx === v ? f.low  : f;
        const f1 = f.varIdx === v ? f.high : f;
        const g0 = g.varIdx === v ? g.low  : g;
        const g1 = g.varIdx === v ? g.high : g;
        const low  = apply(op, f0, g0);
        const high = apply(op, f1, g1);
        const result = makeNode(v, low, high);
        computedTable.set(key, result);
        return result;
    }
    function not(f) {
        if (f === T0) return T1;
        if (f === T1) return T0;
        const key = 'not|' + f.id;
        const cached = computedTable.get(key);
        if (cached) return cached;
        const result = makeNode(f.varIdx, not(f.low), not(f.high));
        computedTable.set(key, result);
        return result;
    }
    function probability(f, probMap, memo) {
        if (f === T0) return 0;
        if (f === T1) return 1;
        memo = memo || new Map();
        if (memo.has(f.id)) return memo.get(f.id);
        const p = probMap.get(f.varIdx) || 0;
        const result = (1 - p) * probability(f.low, probMap, memo) + p * probability(f.high, probMap, memo);
        memo.set(f.id, result);
        return result;
    }
    function size(f, seen) {
        seen = seen || new Set();
        if (f.isTerminal) return 0;
        if (seen.has(f.id)) return 0;
        seen.add(f.id);
        return 1 + size(f.low, seen) + size(f.high, seen);
    }
    return { T0, T1, reset, makeNode, variable, apply, not, probability, size };
})();
function _bddCombinations(items, r) {
    const out = [];
    (function pick(start, current) {
        if (current.length === r) { out.push([...current]); return; }
        for (let i = start; i < items.length; i++) { current.push(items[i]); pick(i + 1, current); current.pop(); }
    })(0, []);
    return out;
}
function buildBDDFromFT(rootNode) {
    BDD.reset();
    if (!rootNode) return { bdd: BDD.T0, varOrder: [], lidToVar: new Map(), varMeta: [], ccfGroupToVar: new Map() };
    const varOrder = [];
    const varMeta  = [];
    const lidToVar = new Map();
    const ccfGroupToVar = new Map();
    function ensureGroupVars(refNode) {
        const g = refNode.ccfGroup;
        if (!g) return null;
        const beta  = refNode.beta  || 0;
        const gamma = refNode.gamma || 0;
        const delta = refNode.delta || 0;
        if (beta <= 0) return null;
        let entry = ccfGroupToVar.get(g);
        if (entry) return entry;
        entry = {};
        entry.v2 = varOrder.length; varOrder.push(refNode); varMeta.push({ type: 'group', tier: 2, group: g, refNode });
        if (gamma > 0) { entry.v3 = varOrder.length; varOrder.push(refNode); varMeta.push({ type: 'group', tier: 3, group: g, refNode }); }
        if (gamma > 0 && delta > 0) { entry.v4 = varOrder.length; varOrder.push(refNode); varMeta.push({ type: 'group', tier: 4, group: g, refNode }); }
        ccfGroupToVar.set(g, entry);
        return entry;
    }
    (function collect(node, visitedNodes, visitedPages) {
        if (!node) return;
        if (visitedNodes.has(node.id)) return;
        visitedNodes.add(node.id);
        if (node.type !== 'gate') {
            const lid = node.logicalId != null ? node.logicalId : node.id;
            if (!lidToVar.has(lid)) {
                lidToVar.set(lid, varOrder.length);
                varOrder.push(node);
                varMeta.push({ type: 'indep', node });
                ensureGroupVars(node);
            }
            return;
        }
        if (node.gateType === 'TRANSFER' || node.transferOutTo) {
            const linkedId = node.transferOutTo || node.linkedPageId;
            if (linkedId && !visitedPages.has(linkedId)) {
                visitedPages.add(linkedId);
                const page = (typeof ftaPages !== 'undefined' && ftaPages) ? ftaPages.find(p => p.id === linkedId) : null;
                if (page && page.root) collect(page.root, visitedNodes, visitedPages);
            }
            return;
        }
        const kids = node.children || node._children;
        if (kids) kids.forEach(c => collect(c, visitedNodes, visitedPages));
    })(rootNode, new Set(), new Set());
    const pageCache = new Map();
    function build(node, visitedPages) {
        if (!node) return BDD.T0;
        if (node.type !== 'gate') {
            const lid = node.logicalId != null ? node.logicalId : node.id;
            const v = lidToVar.get(lid);
            if (v == null) return BDD.T0;
            let result = BDD.variable(v);
            const groupVars = node.ccfGroup ? ccfGroupToVar.get(node.ccfGroup) : null;
            if (groupVars) {
                if (groupVars.v2 != null) result = BDD.apply('or', result, BDD.variable(groupVars.v2));
                if (groupVars.v3 != null) result = BDD.apply('or', result, BDD.variable(groupVars.v3));
                if (groupVars.v4 != null) result = BDD.apply('or', result, BDD.variable(groupVars.v4));
            }
            return result;
        }
        if (node.gateType === 'TRANSFER' || node.transferOutTo) {
            const linkedId = node.transferOutTo || node.linkedPageId;
            if (linkedId && !visitedPages.has(linkedId)) {
                if (pageCache.has(linkedId)) return pageCache.get(linkedId);
                const np = new Set(visitedPages); np.add(linkedId);
                const page = (typeof ftaPages !== 'undefined' && ftaPages) ? ftaPages.find(p => p.id === linkedId) : null;
                if (page && page.root) {
                    const sub = build(page.root, np);
                    pageCache.set(linkedId, sub);
                    return sub;
                }
            }
            return BDD.T0;
        }
        const kids = node.children || node._children;
        if (!kids || kids.length === 0) return BDD.T0;
        const kidBdds = kids.map(c => build(c, visitedPages));
        if (node.gateType === 'AND' || node.gateType === 'INHIBIT' || node.gateType === 'PAND' || node.gateType === 'SPARE') {
            return kidBdds.reduce((acc, k) => BDD.apply('and', acc, k), BDD.T1);
        }
        if (node.gateType === 'FDEP') return BDD.T0;
        if (node.gateType === 'OR') {
            return kidBdds.reduce((acc, k) => BDD.apply('or', acc, k), BDD.T0);
        }
        if (node.gateType === 'XOR') {
            const n = kidBdds.length;
            let result = BDD.T0;
            for (let i = 0; i < n; i++) {
                let term = kidBdds[i];
                for (let j = 0; j < n; j++) if (j !== i) term = BDD.apply('and', term, BDD.not(kidBdds[j]));
                result = BDD.apply('or', result, term);
            }
            return result;
        }
        if (node.gateType === 'VOTING') {
            const k = Math.max(1, Math.min(node.votingK || 2, kidBdds.length));
            let result = BDD.T0;
            for (let size = k; size <= kidBdds.length; size++) {
                for (const subset of _bddCombinations(kidBdds, size)) {
                    const conj = subset.reduce((acc, b) => BDD.apply('and', acc, b), BDD.T1);
                    result = BDD.apply('or', result, conj);
                }
            }
            return result;
        }
        return BDD.T0;
    }
    const bdd = build(rootNode, new Set());
    return { bdd, varOrder, lidToVar, varMeta, ccfGroupToVar };
}
function _probMapFor(varOrder, varMeta) {
    const map = new Map();
    if (!varMeta || !varMeta.length) {
        varOrder.forEach((node, varIdx) => map.set(varIdx, node.probability || 0));
        return map;
    }
    varMeta.forEach((meta, varIdx) => {
        if (meta.type === 'indep') {
            const n = meta.node;
            const q = n.probability || 0;
            const b = (n.ccfGroup && n.beta > 0) ? n.beta : 0;
            map.set(varIdx, q * (1 - b));
        } else if (meta.type === 'group') {
            const r = meta.refNode;
            const q = r.probability || 0;
            const beta  = r.beta  || 0;
            const gamma = r.gamma || 0;
            const delta = r.delta || 0;
            let p = 0;
            if (meta.tier === 2) p = q * beta * (1 - gamma);
            else if (meta.tier === 3) p = q * beta * gamma * (1 - delta);
            else if (meta.tier === 4) p = q * beta * gamma * delta;
            map.set(varIdx, p);
        }
    });
    return map;
}
function computeExactProbability(rootNode) {
    const built = buildBDDFromFT(rootNode);
    const probMap = _probMapFor(built.varOrder, built.varMeta);
    const prob = BDD.probability(built.bdd, probMap);
    return { prob, bdd: built.bdd, varOrder: built.varOrder, lidToVar: built.lidToVar, varMeta: built.varMeta, probMap, bddSize: BDD.size(built.bdd) };
}
function computeImportanceMeasures(rootNode) {
    const ex = computeExactProbability(rootNode);
    const { bdd, varOrder, varMeta, probMap, prob: pTop } = ex;
    const measures = [];
    varOrder.forEach((refNode, varIdx) => {
        const meta = varMeta[varIdx];
        if (meta && meta.type === 'group') return;
        const m1 = new Map(probMap); m1.set(varIdx, 1);
        const m0 = new Map(probMap); m0.set(varIdx, 0);
        const pX1 = BDD.probability(bdd, m1, new Map());
        const pX0 = BDD.probability(bdd, m0, new Map());
        const p   = probMap.get(varIdx) || 0;
        const birnbaum = pX1 - pX0;
        const fv       = pTop > 0 ? (pTop - pX0) / pTop : 0;
        const raw      = pTop > 0 ? pX1 / pTop : 0;
        const rrw      = pX0 > 0 ? pTop / pX0 : Infinity;
        const critical = pTop > 0 ? (birnbaum * p) / pTop : 0;
        const dim      = pTop > 0 ? (p / pTop) * birnbaum : 0;
        measures.push({ node: refNode, varIdx, p, birnbaum, fv, raw, rrw, critical, dim });
    });
    return { measures, pTop, bddSize: ex.bddSize };
}
// Worker entry: serializable importance result (node refs id-encoded; the main thread reconstructs).
function computeImportanceForWorker(flatRoot) {
    const r = computeImportanceMeasures(flatRoot);
    return {
        pTop: r.pTop,
        bddSize: r.bddSize,
        measures: r.measures.map(function (m) {
            return { nodeId: m.node && m.node.id, varIdx: m.varIdx, p: m.p, birnbaum: m.birnbaum, fv: m.fv, raw: m.raw, rrw: m.rrw, critical: m.critical, dim: m.dim };
        })
    };
}

// ── ARP4761A Appendix G (Eq G32–G34) — unconditional failure FREQUENCY (Vesely–Goldberg) ──────
// Distinct from the unavailability P(top): for each minimal cut set, w_CUT = Σ_j w_j·∏_{i≠j}P_i;
// the top-event frequency w_TE = Σ_cutsets w_CUT. Initiators contribute their rate w_j = node.lambda;
// enablers (no rate, probability only) contribute solely as the ∏P_i factors. This is the metric
// for failure conditions whose acceptance criterion is an occurrence RATE rather than an average
// probability per flight hour (the latter is P(top)/t, computed elsewhere). Additive — does not
// change P(top). Cut-set based, valid under the standard's rare-event assumptions.
function computeFailureFrequency(rootNode) {
    var cutsets;
    try { cutsets = getCutsets(rootNode); } catch (e) { return { wTE: null, error: String((e && e.message) || e) }; }
    var wTE = 0;
    for (var k = 0; k < cutsets.length; k++) {
        var cs = cutsets[k], wCUT = 0;
        for (var j = 0; j < cs.length; j++) {
            var lamj = (typeof cs[j].lambda === 'number' && isFinite(cs[j].lambda)) ? cs[j].lambda : 0;
            if (lamj <= 0) continue;            // enabler (no rate) — contributes only as a probability factor
            var prod = lamj;
            for (var i = 0; i < cs.length; i++) {
                if (i === j) continue;
                var pi = (typeof cs[i].probability === 'number' && isFinite(cs[i].probability)) ? cs[i].probability : 0;
                prod *= pi;
            }
            wCUT += prod;
        }
        wTE += wCUT;
    }
    return { wTE: wTE, cutsetCount: cutsets.length };
}

var SLFTAEngine = {
    CUTSET_BUDGET: _CUTSET_BUDGET,
    CutsetExplosionError: CutsetExplosionError,
    getCombinations: getCombinations,
    multiplyCutsets: multiplyCutsets,
    getCutsets: getCutsets,
    eventKey: _eventKey,
    flattenTransfers: flattenTransfers,
    enumerateForWorker: enumerateForWorker,
    BDD: BDD,
    buildBDDFromFT: buildBDDFromFT,
    computeExactProbability: computeExactProbability,
    computeImportanceMeasures: computeImportanceMeasures,
    computeImportanceForWorker: computeImportanceForWorker,
    computeFailureFrequency: computeFailureFrequency
};

// Expose the namespace + the historical globals (so safety_lab.js's existing calls and the
// Worker both resolve them). Function declarations above are already global in classic-script
// and Worker scopes; we also publish the namespace and the budget for explicit access.
try { root.SLFTAEngine = SLFTAEngine; } catch (_) {}
try { root._CUTSET_BUDGET = _CUTSET_BUDGET; } catch (_) {}
try { root.getCutsets = getCutsets; root.multiplyCutsets = multiplyCutsets; root.getCombinations = getCombinations; root._eventKey = _eventKey; root.CutsetExplosionError = CutsetExplosionError; } catch (_) {}

})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this)));
