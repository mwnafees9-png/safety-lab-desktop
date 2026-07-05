// engine_modules.js — BDD / SLDB, extracted verbatim from safety_lab.js (Phase 76).
// Classic script, shared lexical scope, loaded AFTER safety_lab.js (no top-level refs to
// them in the monolith; loading after also covers any definition-time deps). Byte-identical.

const BDD = (function () {
    const T0 = { id: 0, isTerminal: true, value: false, varIdx: Infinity };
    const T1 = { id: 1, isTerminal: true, value: true,  varIdx: Infinity };
    let nextId = 2;
    const uniqueTable  = new Map(); // canonical reduction: (var,low,high) → node
    const computedTable = new Map(); // memoize apply / not results across one BDD build
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
    // apply(op, f, g) — Shannon expansion at the top variable.
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
    // probability(f, probMap) — DFS with memoization. probMap: varIdx → P.
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
    // Count unique non-terminal nodes (useful for diagnostics on tree complexity).
    function size(f, seen) {
        seen = seen || new Set();
        if (f.isTerminal) return 0;
        if (seen.has(f.id)) return 0;
        seen.add(f.id);
        return 1 + size(f.low, seen) + size(f.high, seen);
    }
    return { T0, T1, reset, makeNode, variable, apply, not, probability, size };
})();

const SLDB = (function () {
    const DB = 'safetyLabAero', STORE = 'kv', VER = 1;
    let _dbp = null;
    function _open() {
        if (_dbp) return _dbp;
        _dbp = new Promise(function (res, rej) {
            let req;
            try { req = indexedDB.open(DB, VER); } catch (e) { return rej(e); }
            req.onupgradeneeded = function () { try { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); } catch (_) {} };
            req.onsuccess = function () { res(req.result); };
            req.onerror = function () { rej(req.error); };
        });
        return _dbp;
    }
    function available() { try { return typeof indexedDB !== 'undefined' && !!indexedDB; } catch (_) { return false; } }
    function get(key) { return _open().then(function (db) { return new Promise(function (res, rej) { const t = db.transaction(STORE, 'readonly'); const r = t.objectStore(STORE).get(key); r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }); }
    function set(key, val) { return _open().then(function (db) { return new Promise(function (res, rej) { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(val, key); t.oncomplete = function () { res(true); }; t.onerror = function () { rej(t.error); }; }); }); }
    function del(key) { return _open().then(function (db) { return new Promise(function (res, rej) { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).delete(key); t.oncomplete = function () { res(true); }; t.onerror = function () { rej(t.error); }; }); }); }
    return { available: available, get: get, set: set, del: del };
})();
