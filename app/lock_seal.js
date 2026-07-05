// ============================================================================
// lock_seal.js — v1.0 — L1 + L2: locked means locked, even against a hex
// editor — and a PR is a scalpel, not a master key.
//
// L1 — SEALED BASELINES (+ INV-19, HARD):
//   Baselining a gate now computes a SHA-256 seal over that gate's scoped
//   content (the exact stores documented in CONTENT_FOR below, serialized
//   deterministically). The seal lives in the baseline record and INV-19
//   recomputes it on EVERY sweep: content hash ≠ seal on a locked gate is a
//   named hard failure. This catches what the UI lock cannot — an edit made
//   outside the app entirely (a hex editor on the .slab file, a hand-edited
//   JSON import). The hash implementation is synchronous, pure-JS SHA-256,
//   so a DER can re-derive any seal from the project file with ten lines of
//   any language. SC1 alignment: the gate seal plays the same role at gate
//   level that the configuration-item sha plays per item (ARP4754B §5.6) —
//   one custody discipline, two granularities.
//
// L2 — SURGICAL REOPEN:
//   The PR reopen modal already demands an affected-artifacts list; now the
//   list is ENFORCED. A reopened gate unlocks only the artifact families the
//   PR names — every other family stays inert with a banner naming the PR
//   and the boundary. The PR opens exactly the doors it declared, nothing
//   else. Re-baselining computes a fresh seal over the changed content.
//
// Born-modular: wraps window._blApply / _blReopenApply (lock_enforce exports)
// and window.switchTab / switchWorkspaceTab for surgical enforcement.
// ============================================================================
(function () {
    'use strict';

    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}; }
    function _bl() { const pc = _pc(); if (!pc.gateBaselines) pc.gateBaselines = {}; return pc.gateBaselines; }

    // ------------------------------------------------- sync SHA-256 (pure JS)
    // Deliberately synchronous so the invariant sweep (sync by design) can
    // verify seals inline. Standard FIPS 180-4; verified against test vectors
    // in the regression suite.
    function sha256hex(msg) {
        const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
                   0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
                   0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
                   0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
                   0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
                   0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
                   0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
                   0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
        let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
        // UTF-8 encode
        const bytes = [];
        for (let i = 0; i < msg.length; i++) {
            let c = msg.codePointAt(i);
            if (c > 0xFFFF) i++;
            if (c < 0x80) bytes.push(c);
            else if (c < 0x800) bytes.push(0xC0 | c >> 6, 0x80 | c & 63);
            else if (c < 0x10000) bytes.push(0xE0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
            else bytes.push(0xF0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63);
        }
        const l = bytes.length;
        bytes.push(0x80);
        while (bytes.length % 64 !== 56) bytes.push(0);
        const hi = Math.floor(l / 0x20000000), lo = (l << 3) >>> 0;
        bytes.push(hi >>> 24 & 255, hi >>> 16 & 255, hi >>> 8 & 255, hi & 255,
                   lo >>> 24 & 255, lo >>> 16 & 255, lo >>> 8 & 255, lo & 255);
        const w = new Array(64);
        const rr = (x, n) => (x >>> n) | (x << (32 - n));
        for (let i = 0; i < bytes.length; i += 64) {
            for (let t = 0; t < 16; t++) w[t] = (bytes[i+4*t] << 24) | (bytes[i+4*t+1] << 16) | (bytes[i+4*t+2] << 8) | bytes[i+4*t+3];
            for (let t = 16; t < 64; t++) {
                const s0 = rr(w[t-15], 7) ^ rr(w[t-15], 18) ^ (w[t-15] >>> 3);
                const s1 = rr(w[t-2], 17) ^ rr(w[t-2], 19) ^ (w[t-2] >>> 10);
                w[t] = (w[t-16] + s0 + w[t-7] + s1) >>> 0;
            }
            let [a,b,c,d,e,f,g,h] = H;
            for (let t = 0; t < 64; t++) {
                const S1 = rr(e,6) ^ rr(e,11) ^ rr(e,25);
                const ch = (e & f) ^ (~e & g);
                const t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
                const S0 = rr(a,2) ^ rr(a,13) ^ rr(a,22);
                const mj = (a & b) ^ (a & c) ^ (b & c);
                const t2 = (S0 + mj) >>> 0;
                h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
            }
            H = H.map((x, j) => (x + [a,b,c,d,e,f,g,h][j]) >>> 0);
        }
        return H.map(x => x.toString(16).padStart(8, '0')).join('');
    }

    // ------------------------------------------ gate content scoping (L1)
    // THE CONTRACT — what each gate's seal covers. Deterministic, documented,
    // re-derivable: JSON.stringify of the stores below, in this order.
    function _g(name) { try { return (0, eval)('typeof ' + name + ' !== "undefined" ? ' + name + ' : null'); } catch (_) { return null; } }
    function _acTrees(verifies) {
        return (((typeof ftaPages !== 'undefined' ? ftaPages : []) || []))
            .filter(p => p && p.treeLevel !== 'system' && p.treeLevel !== 'standalone' && !!p.verifies === verifies);
    }
    function _sysTrees(verifies) {
        return (((typeof ftaPages !== 'undefined' ? ftaPages : []) || []))
            .filter(p => p && p.treeLevel === 'system' && !!p.verifies === verifies);
    }
    function _sysSlice(fields) {
        return (((typeof systemsData !== 'undefined' ? systemsData : []) || []))
            .map(s => { const o = { id: s.id }; fields.forEach(f => { o[f] = s[f] || null; }); return o; });
    }
    const CONTENT_FOR = {
        AFHA: () => [_g('acFunctionsData'), _g('acFcimData'), _g('acFhaData'), _g('acAssumptionsData')],
        PASA: () => [CONTENT_FOR.AFHA(), _g('acReqData'), _pc().macModels || [], (_pc().interdep || {}).cells || {}, (_pc().coffe || {}).verdicts || {}, _acTrees(false)],
        ASA:  () => [CONTENT_FOR.PASA(), _g('praData'), _g('zsaData'), _g('cmaData'), _acTrees(true)],
        SFHA: () => [_sysSlice(['functions', 'fcim', 'fha'])],
        PSSA: () => [CONTENT_FOR.SFHA(), _sysSlice(['req', 'asm']), _sysTrees(false), _g('itemsData')],
        SSA:  () => [CONTENT_FOR.PSSA(), _sysTrees(true), _g('fmeaData')],
    };
    function blContentHash(gate) {
        const fn = CONTENT_FOR[gate];
        if (!fn) return null;
        try { return sha256hex(JSON.stringify(fn())); } catch (_) { return null; }
    }

    // seal on baseline — wrap the exported apply
    (function wrapApply() {
        if (typeof window._blApply !== 'function' || window._blApply._sealWrapped) return;
        const orig = window._blApply;
        const wrapped = function (gate, by, note) {
            const ok = orig.apply(this, arguments);
            if (ok) {
                try {
                    const seal = blContentHash(gate);
                    if (seal) {
                        _bl()[gate].seal = seal;
                        _bl()[gate].sealAt = Date.now();
                        if (typeof window.jrnl === 'function') window.jrnl('baseline-seal', gate + ' content sealed: ' + seal.slice(0, 16) + '… (SHA-256 over the gate’s scoped stores)');
                    }
                } catch (_) {}
            }
            return ok;
        };
        wrapped._sealWrapped = true;
        window._blApply = wrapped;
    })();

    // ------------------------------------------------------ INV-19 (HARD)
    (function register() {
        function reg() {
            if (typeof window.invRegister !== 'function') return false;
            window.invRegister({
                id: 'INV-19', name: 'Every locked baseline’s content matches its cryptographic seal', sev: 'hard',
                run: () => {
                    const fails = []; let checked = 0;
                    const bl = _pc().gateBaselines || {};
                    Object.keys(bl).forEach(g => {
                        const b = bl[g];
                        if (!b || b.state !== 'locked') return;   // reopened gates are expected to drift — under their PR
                        checked++;
                        if (!b.seal) { fails.push(g + ': baseline is UNSEALED (predates L1) — re-baseline to seal it'); return; }
                        const now = blContentHash(g);
                        if (now !== b.seal) fails.push(g + ': content hash ' + String(now).slice(0, 12) + '… ≠ seal ' + b.seal.slice(0, 12) + '… — baselined content changed WITHOUT a Problem Report');
                    });
                    return { checked, fails };
                }
            });
            return true;
        }
        if (!reg()) { let tries = 20; const t = setInterval(() => { if (reg() || --tries <= 0) clearInterval(t); }, 300); }
    })();

    // ================================================== L2 — surgical reopen
    // The PR's artifact list maps to artifact FAMILIES; each editing surface
    // belongs to exactly one family. On a reopened gate, surfaces outside the
    // PR's families stay blocked.
    const FAMILY_FOR_TAB = {           // aircraft-scope tabs
        'ac-func': 'Hazard assessments (FHA rows)',
        'ac-fcim': 'Hazard assessments (FHA rows)',
        'ac-fha':  'Hazard assessments (FHA rows)',
        'ac-req':  'Requirements & V&V',
        'ac-asm':  'Assumptions',
    };
    const FAMILY_FOR_SUBTAB = {        // system-workspace sub-tabs
        'func': 'Hazard assessments (FHA rows)',
        'fcim': 'Hazard assessments (FHA rows)',
        'fha':  'Hazard assessments (FHA rows)',
        'req':  'Requirements & V&V',
        'asm':  'Assumptions',
        'items': 'R&M / dispatch data',
    };
    function _reopenedFor(scope) {
        const bl = _pc().gateBaselines || {};
        const scopes = window._blGateScopes || {};
        return Object.keys(bl).map(g => Object.assign({ gate: g }, bl[g]))
            .find(b => b.state === 'reopened' && scopes[b.gate] === scope) || null;
    }
    function _prArtifacts(prId) {
        const pr = (_pc().problemReports || []).find(p => p && p.id === prId);
        return (pr && pr.reopen && pr.reopen.artifacts) || [];
    }
    // The verdict: may this surface be edited, given surgical reopen state?
    window.slSurgicalAllowed = function (scope, family) {
        const ro = _reopenedFor(scope);
        if (!ro) return { allowed: true };
        if (!family) return { allowed: true };   // surfaces with no family (cockpits, read-only views)
        const arts = _prArtifacts(ro.prId);
        if (arts.indexOf(family) >= 0) return { allowed: true, prId: ro.prId, gate: ro.gate };
        return { allowed: false, prId: ro.prId, gate: ro.gate, family };
    };

    function _surgBanner(view, verdict) {
        let b = view.querySelector(':scope > .sl-surgbanner');
        if (verdict.allowed) { if (b) b.remove(); if (view.inert && !view.querySelector(':scope > .sl-lockbanner')) view.inert = false; return; }
        view.inert = true;
        if (!b) {
            b = document.createElement('div');
            b.className = 'sl-surgbanner';
            b.style.cssText = 'position:sticky; top:0; z-index:50; margin:0 0 10px; padding:10px 16px;' +
                'background:#B7791F; color:#fff; font-size:13px; font-weight:600; border-radius:var(--r-md, 8px);';
            view.insertBefore(b, view.firstChild);
        }
        b.textContent = '🔬 SURGICAL REOPEN — ' + verdict.gate + ' is open under ' + verdict.prId +
            ', but "' + verdict.family + '" is NOT in that PR’s declared scope. Editing here stays blocked; raise or amend a PR to include it.';
    }

    function _enforceSurgical(tab) {
        try {
            const fam = FAMILY_FOR_TAB[tab];
            if (fam !== undefined) {
                const view = document.getElementById('view-' + tab);
                if (view) _surgBanner(view, window.slSurgicalAllowed('ac', fam));
            }
        } catch (_) {}
    }
    function _enforceSurgicalSub(sub) {
        try {
            const fam = FAMILY_FOR_SUBTAB[sub];
            if (fam === undefined) return;
            const view = document.getElementById('ws-view-' + sub);
            if (view) _surgBanner(view, window.slSurgicalAllowed('system', fam));
        } catch (_) {}
    }

    (function wrapNav() {
        if (typeof window.switchTab === 'function' && !window.switchTab._surgWrapped) {
            const orig = window.switchTab;
            const wrapped = function (tabId) {
                const r = orig.apply(this, arguments);
                // after lock_enforce's own 150ms pass
                try { setTimeout(() => _enforceSurgical(tabId), 260); } catch (_) {}
                return r;
            };
            wrapped._surgWrapped = true;
            window.switchTab = wrapped;
        }
        if (typeof window.switchWorkspaceTab === 'function' && !window.switchWorkspaceTab._surgWrapped) {
            const orig2 = window.switchWorkspaceTab;
            const wrapped2 = function (sub) {
                const r = orig2.apply(this, arguments);
                try { setTimeout(() => _enforceSurgicalSub(sub), 260); } catch (_) {}
                return r;
            };
            wrapped2._surgWrapped = true;
            window.switchWorkspaceTab = wrapped2;
        }
    })();

    // reopen journal gains the surgical scope; re-baseline reminder rides the toast
    (function wrapReopen() {
        if (typeof window._blReopenApply !== 'function' || window._blReopenApply._sealWrapped) return;
        const orig = window._blReopenApply;
        const wrapped = function (gate, p) {
            const r = orig.apply(this, arguments);
            if (r && r.ok) {
                try { if (typeof window.jrnl === 'function') window.jrnl('baseline-surgical', gate + ' reopen scope (' + r.prId + '): ONLY [' + (p.artifacts || []).join('; ') + '] — all other families stay blocked'); } catch (_) {}
            }
            return r;
        };
        wrapped._sealWrapped = true;
        window._blReopenApply = wrapped;
    })();

    // ------------------------------------------------------------- exports
    window.blContentHash = blContentHash;
    window.slSha256 = sha256hex;
    window._slSurgFamilies = { tabs: FAMILY_FOR_TAB, subtabs: FAMILY_FOR_SUBTAB };
})();
