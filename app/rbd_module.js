// rbd_module.js — Phase F7: Reliability Block Diagrams.
// BORN MODULAR: new file, zero monolith edits; store under projectConfig.rbd.
//
// Two ways in, both exact:
//   AUTOMATED — derive the RBD from any fault tree: the RBD is the structural
//     dual (failure OR → success SERIES, failure AND → success PARALLEL,
//     VOTING k-of-n failure → (n−k+1)-of-n success). Mission reliability
//     R(t) = 1 − P_top(t) with per-event q = 1−e^(−λt); recomputed live, so
//     the RBD can never drift from the tree.
//   MANUAL — a text DSL for architectures that have no tree:
//     series( block(Engine, 1e-4), parallel( block(PumpA, 2e-5),
//     block(PumpB, 2e-5) ), koon(2, block(G1,1e-4), block(G2,1e-4),
//     block(G3,1e-4) ) )
//
// Metrics: R(t) at mission points, system MTBF by Simpson integration of
// R(t) (exact identities verified in tests: 2-parallel MTBF = 1.5/λ,
// 2oo3 MTBF = (5/6)/λ, series R = e^(−Σλt)).

(function () {
    'use strict';

    function _store() {
        if (!projectConfig.rbd) projectConfig.rbd = { models: [] };
        if (!Array.isArray(projectConfig.rbd.models)) projectConfig.rbd.models = [];
        return projectConfig.rbd;
    }
    function _save() { try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {} }
    function _toast(m, k, t) { try { if (typeof showToast === 'function') showToast(m, k || 'info', t || 3000); } catch (_) {} }
    async function _ask(msg, dflt) {
        try { if (typeof slPrompt === 'function') return await slPrompt(msg, dflt || ''); } catch (_) {}
        return window.prompt(msg, dflt || '');
    }
    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    function _access() { return (typeof window._ramHasAccess === 'function') ? window._ramHasAccess() : true; }
    const _chip = (l, v, warn) => '<div style="height:32px; display:inline-flex; align-items:center; padding:0 12px; border:1px solid var(--color-border-strong); font-family:var(--font-mono); font-size:12px;">' + l + ' <b style="margin-left:6px;' + (warn ? ' color:#B45309;' : '') + '">' + v + '</b></div>';

    // ============================================================ structure
    // node: { kind:'block', name, lambda } | { kind:'series'|'parallel', children }
    //     | { kind:'koon', k, children }   (k = required SURVIVORS)
    // Failure probability of the structure at time t (independent, exponential):
    function qOf(node, t) {
        if (node.kind === 'block') return -Math.expm1(-(node.lambda || 0) * t);
        const qs = node.children.map(c => qOf(c, t));
        if (node.kind === 'series') return 1 - qs.reduce((a, q) => a * (1 - q), 1);   // any block fails
        if (node.kind === 'parallel') return qs.reduce((a, q) => a * q, 1);           // all blocks fail
        if (node.kind === 'koon') {
            // fails when survivors < k  ⇔  failures ≥ n−k+1 (exact Poisson-binomial)
            const need = node.children.length - node.k + 1;
            let dist = [1];
            qs.forEach(q => {
                const next = new Array(dist.length + 1).fill(0);
                for (let j = 0; j < dist.length; j++) { next[j] += dist[j] * (1 - q); next[j + 1] += dist[j] * q; }
                dist = next;
            });
            let s = 0;
            for (let j = need; j < dist.length; j++) s += dist[j];
            return s;
        }
        return 0;
    }
    const rOf = (node, t) => 1 - qOf(node, t);

    // System MTBF = ∫₀^∞ R(t) dt — composite Simpson with a doubling horizon.
    function rbdMtbf(node) {
        let T = 1;
        let guard = 0;
        while (rOf(node, T) > 1e-9 && guard++ < 60) T *= 2;
        const n = 4096;                       // even
        const h = T / n;
        let s = rOf(node, 0) + rOf(node, T);
        for (let i = 1; i < n; i++) s += rOf(node, i * h) * (i % 2 ? 4 : 2);
        return s * h / 3;
    }

    // ------------------------------------------------------------- DSL
    // series(...) parallel(...) koon(k, ...) block(name, lambda)
    function parseDsl(src) {
        let i = 0;
        const err = m => { throw new Error(m + ' at position ' + i); };
        function ws() { while (i < src.length && /\s/.test(src[i])) i++; }
        function ident() {
            ws();
            const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
            if (!m) err('expected a keyword (series/parallel/koon/block)');
            i += m[0].length;
            return m[0].toLowerCase();
        }
        function expect(ch) { ws(); if (src[i] !== ch) err('expected "' + ch + '"'); i++; }
        function nodeExpr() {
            const kw = ident();
            expect('(');
            if (kw === 'block') {
                ws();
                const nm = /^[^,()]+/.exec(src.slice(i)); if (!nm) err('block name');
                i += nm[0].length;
                expect(',');
                ws();
                const lm = /^[0-9.eE+\-]+/.exec(src.slice(i)); if (!lm) err('block λ');
                i += lm[0].length;
                const lambda = parseFloat(lm[0]);
                if (!(lambda >= 0)) err('λ must be ≥ 0');
                expect(')');
                return { kind: 'block', name: nm[0].trim(), lambda };
            }
            let k = null;
            if (kw === 'koon') {
                ws();
                const km = /^\d+/.exec(src.slice(i)); if (!km) err('koon needs k (required survivors)');
                i += km[0].length; k = parseInt(km[0]);
                expect(',');
            }
            if (kw !== 'series' && kw !== 'parallel' && kw !== 'koon') err('unknown construct "' + kw + '"');
            const children = [nodeExpr()];
            ws();
            while (src[i] === ',') { i++; children.push(nodeExpr()); ws(); }
            expect(')');
            if (kw === 'koon') {
                if (!(k >= 1 && k <= children.length)) err('koon k out of range');
                return { kind: 'koon', k, children };
            }
            return { kind: kw, children };
        }
        const root = nodeExpr();
        ws();
        if (i < src.length) err('unexpected trailing input');
        return root;
    }

    // -------------------------------------------- AUTOMATED: FTA → RBD dual
    function _lam(n) {
        try { if (typeof getEffectiveLambda === 'function') return getEffectiveLambda(n) || 0; } catch (_) {}
        return (n && n.lambda) || 0;
    }
    function treeToRbd(node) {
        if (!node) return null;
        if (node.type !== 'gate') return { kind: 'block', name: node.displayId || node.name || ('E' + node.id), lambda: _lam(node) };
        const kids = (node.children || node._children || []).map(treeToRbd).filter(Boolean);
        if (!kids.length) return null;
        if (kids.length === 1) return kids[0];
        const gt = node.gateType;
        if (gt === 'AND' || gt === 'INHIBIT' || gt === 'PAND' || gt === 'SPARE') return { kind: 'parallel', children: kids };
        if (gt === 'VOTING') {
            const kFail = parseInt(node.k || node.voteK || 2) || 2;              // gate: fails when ≥ kFail fail
            return { kind: 'koon', k: kids.length - kFail + 1, children: kids }; // survives with n−kFail+1 alive
        }
        if (gt === 'TRANSFER') return kids[0] || null;
        return { kind: 'series', children: kids };                               // OR family
    }
    function rbdFromPage(pageId) {
        const p = ((typeof ftaPages !== 'undefined' ? ftaPages : []) || []).find(x => String(x.id) === String(pageId));
        if (!p || !p.root) return null;
        // TRANSFER leaves have no λ locally; they resolve through the linked page.
        const resolveTransfers = (n) => {
            if (!n) return null;
            if (n.gateType === 'TRANSFER' && n.linkedPageId) {
                const lp = ftaPages.find(x => String(x.id) === String(n.linkedPageId));
                return lp && lp.root ? resolveTransfersDeep(lp.root) : null;
            }
            return n;
        };
        function resolveTransfersDeep(n) {
            const r = resolveTransfers(n);
            if (!r) return null;
            if (r.type === 'gate') {
                const clone = Object.assign({}, r);
                clone.children = (r.children || r._children || []).map(resolveTransfersDeep).filter(Boolean);
                return clone;
            }
            return r;
        }
        return { structure: treeToRbd(resolveTransfersDeep(p.root)), page: p };
    }

    // --------------------------------------------------------------- render
    function _renderStructure(node) {
        if (!node) return '';
        if (node.kind === 'block') {
            return '<div style="border:1.5px solid var(--color-text-primary); padding:5px 10px; font-size:11.5px; background:var(--color-surface-1); white-space:nowrap;">' +
                _esc(node.name) + '<div class="u-mono" style="font-size:10px; color:var(--color-text-tertiary);">λ ' + (node.lambda > 0 ? node.lambda.toExponential(1) : '0') + '</div></div>';
        }
        const kids = node.children.map(_renderStructure);
        if (node.kind === 'series') {
            return '<div style="display:flex; align-items:center; gap:6px;">' + kids.join('<div style="width:14px; border-top:1.5px solid var(--color-text-primary);"></div>') + '</div>';
        }
        const label = node.kind === 'koon' ? (node.k + 'oo' + node.children.length) : '∥';
        return '<div style="display:flex; align-items:center; gap:6px;">' +
            '<div style="border-left:1.5px solid var(--color-text-primary); padding-left:8px; display:flex; flex-direction:column; gap:6px;">' + kids.join('') + '</div>' +
            '<div class="u-mono" style="font-size:10px; color:var(--color-text-secondary);">' + label + '</div></div>';
    }
    function _metricsHtml(structure) {
        const tMission = (typeof ftaConfig === 'object' && ftaConfig && ftaConfig.exposureTime) || 1;
        const points = [tMission, 10, 100, 1000].filter((v, ix, a) => a.indexOf(v) === ix).sort((a, b) => a - b);
        const mtbf = rbdMtbf(structure);
        return '<div style="display:flex; gap:10px; flex-wrap:wrap; margin:10px 0;">' +
            _chip('R(mission ' + tMission + ' h)', rOf(structure, tMission).toPrecision(6)) +
            _chip('System MTBF (∫R dt)', Math.round(mtbf).toLocaleString() + ' h') + '</div>' +
            '<table class="data-table" style="width:100%; max-width:480px; font-size:12px;"><thead><tr><th>t (h)</th><th>R(t)</th><th>Q(t)</th></tr></thead><tbody>' +
            points.map(t => '<tr><td class="u-mono">' + t + '</td><td class="u-mono">' + rOf(structure, t).toPrecision(6) + '</td><td class="u-mono">' + qOf(structure, t).toExponential(3) + '</td></tr>').join('') +
            '</tbody></table>';
    }

    async function rbdAddManual() {
        if (!_access()) return;
        const name = await _ask('RBD name:'); if (!name || !name.trim()) return;
        const dsl = await _ask('Structure DSL — series(...), parallel(...), koon(k, ...), block(name, λ):',
            'series( block(Engine, 1e-4), parallel( block(Pump A, 2e-5), block(Pump B, 2e-5) ) )');
        if (!dsl || !dsl.trim()) return;
        try { parseDsl(dsl.trim()); } catch (e) { _toast('DSL error: ' + e.message, 'error', 5000); return; }
        _store().models.push({ id: 'RBD-' + Date.now(), name: name.trim(), dsl: dsl.trim(), fromPage: null });
        _save(); renderRamRbdPage();
    }
    async function rbdAddFromTree() {
        if (!_access()) return;
        const pages = ((typeof ftaPages !== 'undefined' ? ftaPages : []) || []).filter(p => p.root);
        if (!pages.length) { _toast('No fault trees to derive from.', 'warning'); return; }
        const pick = (await _ask('Derive the RBD dual of which tree?\n' + pages.slice(0, 15).map(p => '  ' + p.id + ' — ' + (p.name || '')).join('\n') + '\n\nEnter page id:', pages[0].id)) || '';
        if (!rbdFromPage(pick.trim())) { _toast('No tree with that id (or empty root).', 'warning'); return; }
        _store().models.push({ id: 'RBD-' + Date.now(), name: 'RBD dual · ' + pick.trim(), dsl: null, fromPage: pick.trim() });
        _save(); renderRamRbdPage();
    }
    function rbdDelete(id) {
        const s = _store();
        const i = s.models.findIndex(x => x.id === id);
        if (i >= 0 && confirm('Remove this RBD?')) { s.models.splice(i, 1); _save(); renderRamRbdPage(); }
    }

    function renderRamRbdPage() {
        const host = document.getElementById('ram-rbd-host');
        if (!host) return;
        if (!_access()) { host.innerHTML = '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-2); padding:26px 30px; max-width:640px;"><h3 style="margin:0 0 10px; border:none; padding:0;">Reliability Block Diagrams are a Pro+ capability</h3></div>'; return; }
        const S = _store();
        let html = '<div style="margin:0 0 12px;"><button class="btn-cyan" onclick="rbdAddFromTree()">⚙ Derive from fault tree</button> ' +
            '<button class="btn-cyan" onclick="rbdAddManual()">+ Manual RBD (DSL)</button> ' +
            '<span style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">derived RBDs recompute from the live tree every render — they cannot drift</span></div>';
        if (!S.models.length) html += '<p style="color:var(--color-text-tertiary); font-size:13px;">No block diagrams yet. Deriving from a fault tree gives you the success-domain view of the same architecture — series where the tree ORs, parallel where it ANDs.</p>';
        S.models.forEach(m => {
            html += '<h3>' + _esc(m.name) + ' <a href="#" style="font-size:11px;" onclick="rbdDelete(\'' + m.id + '\'); return false;">remove</a></h3>';
            let structure = null, note = '';
            if (m.fromPage) {
                const d = rbdFromPage(m.fromPage);
                if (d) { structure = d.structure; note = 'derived live from "' + (d.page.name || m.fromPage) + '" — failure OR→series, AND→parallel, VOTING dualized; transfers resolved'; }
                else note = 'source tree missing';
            } else if (m.dsl) {
                try { structure = parseDsl(m.dsl); note = 'manual DSL'; } catch (e) { note = 'DSL error: ' + e.message; }
            }
            html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">' + _esc(note) + '</p>';
            if (structure) {
                html += '<div style="overflow-x:auto; padding:12px; border:1px solid var(--color-border-hair); background:var(--color-surface-2);">' + _renderStructure(structure) + '</div>';
                html += _metricsHtml(structure);
            }
        });
        html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">Mission-reliability view: q = 1−e^(−λt) per block, exact OR/AND/k-oo-n combination (Poisson-binomial), MTBF by Simpson integration of R(t). Repairable-system availability lives in the ledger (Ai/Ao); Markov models cover repair dynamics.</p>';
        host.innerHTML = html;
    }

    // ------------------------------------------------- navigation wrapper
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._rbdWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-ram-rbd');
                if (v) v.style.display = (tabId === 'ram-rbd') ? 'block' : 'none';
                const s = document.getElementById('snav-ram-rbd');
                if (s) s.classList.toggle('snav-active', tabId === 'ram-rbd');
                if (tabId === 'ram-rbd') renderRamRbdPage();
            } catch (_) {}
            return r;
        };
        wrapped._rbdWrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------ exports
    window.renderRamRbdPage = renderRamRbdPage;
    window.rbdAddManual = rbdAddManual;
    window.rbdAddFromTree = rbdAddFromTree;
    window.rbdDelete = rbdDelete;
    window._rbdParseDsl = parseDsl;
    window._rbdQ = qOf;
    window._rbdR = rOf;
    window._rbdMtbf = rbdMtbf;
    window._rbdFromPage = rbdFromPage;
    window._rbdTreeToRbd = treeToRbd;
})();
