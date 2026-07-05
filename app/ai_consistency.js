// ============================================================================
// ai_consistency.js — v1.2 — AI-C1/C2/C4/C5: determinism by memoization.
//
// The model cannot be made bit-deterministic (provider batching, version
// bumps), so the lane is made REPRODUCIBLE instead:
//
//   C1 — canonical request: sorted keys, stable field set, no run-specific
//        noise. Identical intent → byte-identical canonical string.
//   C2 — draft cache: sha256(model + params + canonical prompt) → response.
//        The second identical ask returns the RECORDED draft — literally
//        identical, forever. Regeneration only via an explicit redraft
//        (req.noCache / aiRedraftLast()). A draft stops being a dice roll
//        and becomes an artifact with provenance.
//   C5 — output canonicalizer: trailing whitespace stripped, blank runs
//        collapsed, so trivial variation is squeezed before storing/diffing.
//
// BORN MODULAR: wraps window.SafetyLabAI.complete (outermost — the fidelity
// ledger wrap stays inside and still records real provider calls on misses).
// Cache lives in localStorage with an LRU cap; per-browser reproducibility.
// ============================================================================
(function () {
    'use strict';

    var PREFIX = 'slai.cache.';
    var INDEX_KEY = 'slai.cache.index';   // [{h, at, feature, bytes}] — LRU order, oldest first
    var MAX_ENTRIES = 80;
    var MAX_TOTAL_BYTES = 2.5 * 1024 * 1024;   // stay well under the localStorage cap

    // ---------------------------------------------------------- sha-256 (sync)
    // Same construction as lock_seal's; kept self-contained so the AI lane
    // never depends on lock modules being loaded.
    function _sha256hex(msg) {
        function rr(v, n) { return (v >>> n) | (v << (32 - n)); }
        var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
        var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
        var bytes = [];
        for (var i = 0; i < msg.length; i++) {
            var c = msg.charCodeAt(i);
            if (c < 0x80) bytes.push(c);
            else if (c < 0x800) { bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
            else if (c < 0xd800 || c >= 0xe000) { bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
            else { var cp = 0x10000 + (((c & 0x3ff) << 10) | (msg.charCodeAt(++i) & 0x3ff));
                bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)); }
        }
        var l = bytes.length * 8;
        bytes.push(0x80);
        while ((bytes.length % 64) !== 56) bytes.push(0);
        for (var j = 7; j >= 0; j--) bytes.push((j >= 4 ? 0 : (l / Math.pow(2, j * 8))) & 0xff | 0);
        for (var p = 0; p < bytes.length; p += 64) {
            var w = new Array(64);
            for (var t = 0; t < 16; t++) w[t] = (bytes[p + t * 4] << 24) | (bytes[p + t * 4 + 1] << 16) | (bytes[p + t * 4 + 2] << 8) | bytes[p + t * 4 + 3];
            for (t = 16; t < 64; t++) {
                var s0 = rr(w[t - 15], 7) ^ rr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
                var s1 = rr(w[t - 2], 17) ^ rr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
                w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
            }
            var a = H[0], b = H[1], cc = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
            for (t = 0; t < 64; t++) {
                var S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25);
                var ch = (e & f) ^ (~e & g);
                var t1 = (h + S1 + ch + K[t] + w[t]) | 0;
                var S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
                var mj = (a & b) ^ (a & cc) ^ (b & cc);
                var t2 = (S0 + mj) | 0;
                h = g; g = f; f = e; e = (d + t1) | 0; d = cc; cc = b; b = a; a = (t1 + t2) | 0;
            }
            H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + cc) | 0; H[3] = (H[3] + d) | 0;
            H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
        }
        var out = '';
        for (var q = 0; q < 8; q++) out += ('00000000' + ((H[q] >>> 0).toString(16))).slice(-8);
        return out;
    }

    // ------------------------------------------------- C1: canonical request
    // Stable stringify: object keys sorted at every level, arrays kept in
    // order, undefined dropped. Only the SEMANTIC fields of a request join
    // the key — nothing run-specific.
    function _stableStringify(v) {
        if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
        if (Array.isArray(v)) return '[' + v.map(_stableStringify).join(',') + ']';
        var keys = Object.keys(v).filter(function (k) { return v[k] !== undefined; }).sort();
        return '{' + keys.map(function (k) { return JSON.stringify(k) + ':' + _stableStringify(v[k]); }).join(',') + '}';
    }
    function canonicalRequest(req) {
        req = req || {};
        return _stableStringify({
            feature: req.feature || '',
            model: req.model || '',
            system: req.system || '',
            messages: req.messages || [],
            maxTokens: req.maxTokens || null,
            temperature: (typeof req.temperature === 'number') ? req.temperature : null,
        });
    }

    // ------------------------------------------------ C5: output canonicalizer
    function canonicalText(s) {
        return String(s == null ? '' : s)
            .replace(/[ \t]+$/gm, '')          // trailing whitespace per line
            .replace(/\n{3,}/g, '\n\n')        // collapse blank runs
            .replace(/\s+$/, '');              // trailing newline noise
    }

    // ------------------------------------------------ C4: structured output
    // Opt-in per request (req.outputJson = true): the response is parsed
    // (fence-stripped, balanced-slice fallback), retried ONCE on garbage, and
    // re-serialized canonically — sorted keys, no whitespace variance. Two
    // semantically-equal responses with different key order or fencing
    // collapse to identical bytes, so the cache and any diff see ONE form.
    function _extractJson(t) {
        if (!t) return null;
        t = String(t).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
        try { return JSON.parse(t); } catch (_) {}
        var mo = t.match(/\{[\s\S]*\}/);
        if (mo) { try { return JSON.parse(mo[0]); } catch (_) {} }
        var ma = t.match(/\[[\s\S]*\]/);
        if (ma) { try { return JSON.parse(ma[0]); } catch (_) {} }
        return null;
    }
    function canonicalJson(v) { return _stableStringify(v); }

    // ----------------------------------------------------------- cache store
    function _idx() { try { return JSON.parse(localStorage.getItem(INDEX_KEY)) || []; } catch (_) { return []; } }
    function _saveIdx(ix) { try { localStorage.setItem(INDEX_KEY, JSON.stringify(ix)); } catch (_) {} }
    function _get(h) { try { return JSON.parse(localStorage.getItem(PREFIX + h)); } catch (_) { return null; } }
    function _put(h, rec, feature) {
        try {
            var s = JSON.stringify(rec);
            var ix = _idx().filter(function (e) { return e.h !== h; });
            ix.push({ h: h, at: Date.now(), feature: feature || '', bytes: s.length });
            // LRU + size cap
            var total = ix.reduce(function (a, e) { return a + (e.bytes || 0); }, 0);
            while (ix.length > MAX_ENTRIES || total > MAX_TOTAL_BYTES) {
                var old = ix.shift();
                if (!old) break;
                total -= (old.bytes || 0);
                try { localStorage.removeItem(PREFIX + old.h); } catch (_) {}
            }
            localStorage.setItem(PREFIX + h, s);
            _saveIdx(ix);
        } catch (_) { /* quota — cache is best-effort, calls still work */ }
    }
    function _touch(h) {
        var ix = _idx();
        var e = ix.find(function (x) { return x.h === h; });
        if (e) { ix = ix.filter(function (x) { return x.h !== h; }); e.at = Date.now(); ix.push(e); _saveIdx(ix); }
    }

    var _stats = { hits: 0, misses: 0, lastHash: null };

    // ------------------------------------------------------ the provider wrap
    function _wrap() {
        var P = (typeof window !== 'undefined') ? window.SafetyLabAI : null;
        if (!P || typeof P.complete !== 'function' || P.complete._acWrapped) return false;
        var orig = P.complete.bind(P);
        var wrapped = async function (req) {
            req = req || {};
            // AI-C3 — deterministic seed by default (honored by OpenAI-compatible
            // local endpoints; harmlessly ignored by providers without seed support)
            if (typeof req.seed !== 'number') req.seed = 4761;
            var canon = canonicalRequest(req);
            var h = _sha256hex(canon);
            _stats.lastHash = h;
            if (!req.noCache) {
                var hit = _get(h);
                if (hit && typeof hit.text === 'string') {
                    _stats.hits++;
                    _touch(h);
                    var hr = { text: hit.text, model: hit.model, raw: null, cached: true,
                        provenance: { promptHash: h, model: hit.model, at: hit.at, params: hit.params } };
                    if (req.outputJson) { try { hr.json = JSON.parse(hit.text); } catch (_) { hr.json = _extractJson(hit.text); } }
                    return hr;
                }
            }
            _stats.misses++;
            var r = await orig(req);
            try {
                if (r && typeof r.text === 'string') {
                    r.text = canonicalText(r.text);
                    // C4 — structured lane: parse, retry once on garbage, canonical bytes
                    if (req.outputJson) {
                        var j = _extractJson(r.text);
                        if (j == null) {
                            r.jsonRetried = true;
                            try { var r2 = await orig(req); j = _extractJson(canonicalText(r2 && r2.text)); if (j != null) r.model = r2.model || r.model; } catch (_) {}
                        }
                        if (j != null) { r.json = j; r.text = canonicalJson(j); }
                        else r.jsonError = true;
                    }
                    // noCache asks (probes, explicit fresh takes) are non-canonical:
                    // never let them overwrite the recorded draft; unparseable
                    // structured responses are never recorded either
                    if (!req.noCache && !r.jsonError) _put(h, { text: r.text, model: r.model || '', at: new Date().toISOString(),
                        params: { temperature: (typeof req.temperature === 'number') ? req.temperature : null, maxTokens: req.maxTokens || null } }, req.feature);
                    r.provenance = { promptHash: h, model: r.model || '', at: new Date().toISOString() };
                }
            } catch (_) {}
            return r;
        };
        wrapped._acWrapped = true;
        P.complete = wrapped;
        return true;
    }
    // the AI lane loads lazily — keep trying briefly until the surface exists
    if (!_wrap()) { var tries = 40; var t = setInterval(function () { if (_wrap() || --tries <= 0) clearInterval(t); }, 250); }

    // ---------------------------------------------------------------- surface
    function aiCacheStats() {
        var ix = _idx();
        return { entries: ix.length, bytes: ix.reduce(function (a, e) { return a + (e.bytes || 0); }, 0),
            hits: _stats.hits, misses: _stats.misses, lastHash: _stats.lastHash };
    }
    function aiCacheClear() {
        _idx().forEach(function (e) { try { localStorage.removeItem(PREFIX + e.h); } catch (_) {} });
        _saveIdx([]);
        return true;
    }
    // explicit regeneration: drop the recorded draft for the LAST request key
    function aiRedraftLast() {
        if (!_stats.lastHash) return false;
        try { localStorage.removeItem(PREFIX + _stats.lastHash); } catch (_) {}
        _saveIdx(_idx().filter(function (e) { return e.h !== _stats.lastHash; }));
        return true;
    }

    // ------------------------------------------------ AI-C6: repeatability probe
    // Run-to-run variance, MEASURED: fire each probe prompt k times with the
    // cache bypassed, canonicalize, and report how many runs came back
    // byte-identical plus a trigram-similarity score. User-triggered only
    // (it spends real tokens). Result is stored so AI settings can show the
    // variance floor for the pinned model, and drift after provider updates.
    var PROBES = [
        { id: 'probe-classify', system: 'You are a safety analyst. Answer with exactly one word.',
          user: 'A transport-category aircraft loses all wheel braking on landing rollout. One word severity classification per the standard FHA scale:' },
        { id: 'probe-extract', system: 'Extract facts. No prose.',
          user: 'From: "Elevator servo channel A (LRU-FCS-01) and channel B (LRU-FCS-02) are dissimilar and independently powered." List the two item ids only, comma-separated:' },
        { id: 'probe-draft', system: 'You draft failure condition effect text. One sentence, no numbers.',
          user: 'Effect text for: erroneous airspeed displayed to both pilots during approach.' },
    ];
    function _trigrams(s) { var t = {}; s = s.toLowerCase(); for (var i = 0; i + 3 <= s.length; i++) t[s.substr(i, 3)] = 1; return t; }
    function _sim(a, b) {
        if (a === b) return 1;
        var ta = _trigrams(a), tb = _trigrams(b), inter = 0, uni = 0, k;
        for (k in ta) { uni++; if (tb[k]) inter++; }
        for (k in tb) { if (!ta[k]) uni++; }
        return uni ? inter / uni : 1;
    }
    async function aiConsistencyProbe(k, probes) {
        k = k || 3;
        probes = probes || PROBES;
        var P = window.SafetyLabAI;
        if (!P || typeof P.complete !== 'function') throw new Error('AI lane not loaded');
        var out = { at: new Date().toISOString(), k: k, prompts: [], model: '' };
        for (var i = 0; i < probes.length; i++) {
            var pr = probes[i], runs = [];
            for (var j = 0; j < k; j++) {
                var r = await P.complete({ feature: 'consistency.probe', system: pr.system,
                    messages: [{ role: 'user', content: pr.user }], maxTokens: 120, temperature: 0, noCache: true });
                runs.push(canonicalText(r.text || ''));
                out.model = r.model || out.model;
            }
            var identical = runs.every(function (x) { return x === runs[0]; });
            var simSum = 0, pairs = 0;
            for (var a = 0; a < runs.length; a++) for (var b = a + 1; b < runs.length; b++) { simSum += _sim(runs[a], runs[b]); pairs++; }
            out.prompts.push({ id: pr.id, identical: identical, similarity: pairs ? +(simSum / pairs).toFixed(3) : 1, sample: runs[0].slice(0, 120) });
        }
        out.identicalRate = +(out.prompts.filter(function (p) { return p.identical; }).length / out.prompts.length).toFixed(2);
        out.meanSimilarity = +(out.prompts.reduce(function (s, p) { return s + p.similarity; }, 0) / out.prompts.length).toFixed(3);
        try { localStorage.setItem('slai.consistency.last', JSON.stringify(out)); } catch (_) {}
        return out;
    }
    function aiConsistencyLast() { try { return JSON.parse(localStorage.getItem('slai.consistency.last')); } catch (_) { return null; } }

    if (typeof window !== 'undefined') {
        window.aiConsistencyProbe = aiConsistencyProbe;
        window.aiConsistencyLast = aiConsistencyLast;
        window.aiCanonicalRequest = canonicalRequest;
        window.aiCanonicalText = canonicalText;
        window.aiCacheStats = aiCacheStats;
        window.aiCacheClear = aiCacheClear;
        window.aiRedraftLast = aiRedraftLast;
        window._aiConsistencyWrap = _wrap;
        window._aiSha256 = _sha256hex;
    }
})();
