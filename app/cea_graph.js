// ============================================================================
// cea_graph.js — Phase P5 (gap A11): Cascading Effects Analysis on the
// system-dependency graph the project already carries.
//
// The model holds three kinds of dependency edges nobody has assembled into
// one structure: resource provision/consumption (Resources store), declared
// system interfaces (projectConfig.interfaces), and the interdependence
// table's asserted contribution cells. This module compiles them into a
// single directed graph, runs deterministic cascade closures over it, and —
// the audit-grade part — RECONCILES the graph against the interdependence
// table: a cascade path that reaches a system whose failure conditions the
// source has never been reviewed against is a finding; a path that
// contradicts a manually CLEARED cell is a conflict.
//
// Two lanes: the graph and its cascades are computed; the interdependence
// cells are elicited. Neither overwrites the other — disagreement renders as
// findings, exactly like the CoFFE dual-lane discipline.
//
// Born modular: classic script, zero monolith edits, wraps switchTab for the
// 'cea' tab, pushes one auto item onto the PASA checklist. No stored state —
// the whole analysis derives from the live model on every render.
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ------------------------------------------------------------- graph
    // Nodes: systems and resources. Edges (directed, "failure flows along"):
    //   system --provides--> resource      (provider fails, resource degrades)
    //   resource --feeds--> system         (resource lost, consumer degrades)
    //   system --interface--> system       (declared lateral reliance)
    function ceaGraph() {
        const nodes = new Map();   // id -> { id, kind, name }
        const edges = [];
        ((typeof systemsData !== 'undefined' && systemsData) || []).forEach(s =>
            nodes.set(s.id, { id: s.id, kind: 'system', name: s.name || s.id }));
        ((typeof resourcesData !== 'undefined' && resourcesData) || []).forEach(r => {
            const rid = 'res:' + (r.resId || r.internalId);
            nodes.set(rid, { id: rid, kind: 'resource', name: r.name || r.resId });
            (r.providedBy || []).forEach(p => { if (nodes.has(p)) edges.push({ from: p, to: rid, kind: 'provides', label: r.resId }); });
            (r.consumedBySystems || []).forEach(c => { if (nodes.has(c)) edges.push({ from: rid, to: c, kind: 'feeds', label: r.resId }); });
            // consumedBy holds aircraft sub-function ids — resolve to the systems
            // whose functions trace to them, so function-level consumption still
            // lands on a system node.
            (r.consumedBy || []).forEach(subId => {
                ((typeof systemsData !== 'undefined' && systemsData) || []).forEach(s => {
                    const owns = (s.functions || []).some(f =>
                        (Array.isArray(f.traceIds) ? f.traceIds : (f.traceId ? [f.traceId] : [])).includes(subId));
                    if (owns && !edges.some(e => e.from === rid && e.to === s.id))
                        edges.push({ from: rid, to: s.id, kind: 'feeds', label: r.resId + ' (via ' + subId + ')' });
                });
            });
        });
        const ifaces = (typeof projectConfig !== 'undefined' && projectConfig && Array.isArray(projectConfig.interfaces)) ? projectConfig.interfaces : [];
        ifaces.forEach(i => {
            const a = String(i.fromSystemId), b = String(i.toSystemId);
            if (!nodes.has(a) || !nodes.has(b)) return;
            const lbl = i.medium || i.kind || 'interface';
            // Failure propagates against the direction of reliance: if A feeds B,
            // A's failure cascades to B. Declared direction is taken as the flow
            // of the dependency itself.
            if (i.direction !== 'b_to_a') edges.push({ from: a, to: b, kind: 'interface', label: lbl });
            if (i.direction === 'b_to_a' || i.direction === 'bidirectional') edges.push({ from: b, to: a, kind: 'interface', label: lbl });
        });
        return { nodes, edges };
    }

    // ------------------------------------------------------------ cascade
    // BFS from a failed node; every reached node carries its shortest path.
    function ceaCascade(sourceId, graph) {
        const g = graph || ceaGraph();
        const out = [];   // { id, kind, name, hops, path: 'A —feeds→ B —…' }
        if (!g.nodes.has(sourceId)) return out;
        const seen = new Set([sourceId]);
        let frontier = [{ id: sourceId, path: [] }];
        let hops = 0;
        while (frontier.length && hops < 8) {
            hops++;
            const next = [];
            frontier.forEach(cur => {
                g.edges.filter(e => e.from === cur.id).forEach(e => {
                    if (seen.has(e.to)) return;
                    seen.add(e.to);
                    const n = g.nodes.get(e.to);
                    const path = cur.path.concat([(g.nodes.get(e.from) || {}).name + ' —' + e.kind + (e.label ? '(' + e.label + ')' : '') + '→ ' + (n || {}).name]);
                    out.push({ id: e.to, kind: n.kind, name: n.name, hops, path: path.join(' ; ') });
                    next.push({ id: e.to, path });
                });
            });
            frontier = next;
        }
        return out;
    }

    // ----------------------------------------- reconciliation vs the table
    // For every system X: cascade from X; for every REACHED system S, X can
    // influence the failure conditions S owns. The interdependence table must
    // have reviewed X against those FCs. Three outcomes per (FC, X) pair:
    //   corroborated — cell contributes (table already knows)
    //   unreviewed   — cascade path exists, cell never reviewed  → FINDING
    //   conflict     — cascade path exists, cell manually CLEARED → CONFLICT
    function _fcsOwnedBy(s) {
        const out = [];
        const acFha = (typeof acFhaData !== 'undefined' && acFhaData) || [];
        const subIds = new Set();
        (s.functions || []).forEach(f =>
            (Array.isArray(f.traceIds) ? f.traceIds : (f.traceId ? [f.traceId] : [])).forEach(t => subIds.add(t)));
        acFha.forEach(f => { if (f.subId && subIds.has(f.subId)) out.push(f); });
        (s.fha || []).forEach(f => {
            if (!f.acTrace) return;
            const ac = acFha.find(x => String(x.internalId) === String(f.acTrace));
            if (ac && !out.includes(ac)) out.push(ac);
        });
        return out;
    }

    function ceaFindings() {
        const g = ceaGraph();
        const systems = ((typeof systemsData !== 'undefined' && systemsData) || []);
        const rows = [];
        let corroborated = 0;
        if (typeof idpCell !== 'function') return { rows, corroborated, pairs: 0 };
        let pairs = 0;
        systems.forEach(x => {
            const reached = ceaCascade(x.id, g).filter(n => n.kind === 'system');
            reached.forEach(r => {
                const s = systems.find(z => z.id === r.id);
                if (!s) return;
                _fcsOwnedBy(s).forEach(fc => {
                    pairs++;
                    const cell = idpCell(fc, x.id);
                    if (cell.state === 'contributes') { corroborated++; return; }
                    rows.push({
                        kind: cell.state === 'cleared' ? 'conflict' : 'unreviewed',
                        source: x.name || x.id, sourceId: x.id,
                        fc: fc.fcId, severity: fc.severity,
                        via: r.path, hops: r.hops,
                        detail: cell.state === 'cleared'
                            ? 'cell manually cleared by ' + (cell.by || '?') + ' — a dependency path contradicts the clearance'
                            : 'dependency path exists but the interdependence cell was never reviewed',
                    });
                });
            });
        });
        rows.sort((a, b) => (a.kind === 'conflict' ? 0 : 1) - (b.kind === 'conflict' ? 0 : 1) || a.hops - b.hops);
        return { rows, corroborated, pairs };
    }

    // ---------------------------------------------------------------- SVG
    window._ceaSelected = window._ceaSelected || '';
    window.ceaSelect = function (id) { window._ceaSelected = (window._ceaSelected === id) ? '' : id; renderCeaPage(); };

    function _svgGraph(g) {
        const systems = [...g.nodes.values()].filter(n => n.kind === 'system');
        const resources = [...g.nodes.values()].filter(n => n.kind === 'resource');
        // W=1000 with the resource column pushed right: the graph owns the whole
        // panel instead of huddling in the left 700 units with dead space beside.
        const rowH = 46, boxW = 230, boxH = 34, colSys = 46, W = 1000, colRes = W - boxW - 46;
        const H = Math.max(systems.length, resources.length) * rowH + 40;
        const pos = new Map();
        systems.forEach((n, i) => pos.set(n.id, { x: colSys, y: 24 + i * rowH }));
        resources.forEach((n, i) => pos.set(n.id, { x: colRes, y: 24 + i * rowH * Math.max(1, systems.length / Math.max(1, resources.length)) }));
        const sel = window._ceaSelected;
        const reach = sel ? new Set(ceaCascade(sel, g).map(r => r.id)) : null;
        const active = id => !sel || id === sel || (reach && reach.has(id));

        // pan/zoom: the viewBox is the camera. Persisted across re-renders in
        // window._ceaView; _ceaBindPanZoom drives it (wheel = zoom at cursor,
        // drag = pan, double-click = reset). Node clicks survive because a
        // drag beyond 4px suppresses the click in the capture phase.
        window._ceaDefView = { w: W, h: H };
        const v = window._ceaView || { x: 0, y: 0, w: W, h: H };
        let s = '<svg id="cea-svg" viewBox="' + v.x + ' ' + v.y + ' ' + v.w + ' ' + v.h + '" style="width:100%; font-family:var(--font-mono); cursor:grab; touch-action:none;" xmlns="http://www.w3.org/2000/svg">';
        s += '<defs><marker id="cea-arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="currentColor"/></marker></defs>';
        g.edges.forEach(e => {
            const a = pos.get(e.from), b = pos.get(e.to);
            if (!a || !b) return;
            const onPath = sel && (e.from === sel || (reach && reach.has(e.from))) && reach && reach.has(e.to);
            const color = onPath ? '#8E2A2A' : (e.kind === 'interface' ? '#0A63CC' : e.kind === 'provides' ? '#9A6200' : '#4A6741');
            const op = sel && !onPath ? 0.14 : 0.75;
            let x1, y1, x2, y2;
            if (e.kind === 'interface') {   // sys→sys: arc left of the column
                x1 = a.x; y1 = a.y + boxH / 2; x2 = b.x; y2 = b.y + boxH / 2;
                const bend = 34 + Math.abs(y2 - y1) / 8;
                s += '<path d="M' + x1 + ',' + y1 + ' C' + (x1 - bend) + ',' + y1 + ' ' + (x2 - bend) + ',' + y2 + ' ' + x2 + ',' + y2 +
                    '" fill="none" stroke="' + color + '" stroke-width="1.4" opacity="' + op + '" marker-end="url(#cea-arr)" style="color:' + color + '"/>';
            } else {
                const fromRes = e.kind === 'feeds';
                x1 = fromRes ? a.x : a.x + boxW; y1 = a.y + boxH / 2;
                x2 = fromRes ? b.x + boxW : b.x; y2 = b.y + boxH / 2;
                const mx = (x1 + x2) / 2;
                s += '<path d="M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2 +
                    '" fill="none" stroke="' + color + '" stroke-width="1.4" opacity="' + op + '" marker-end="url(#cea-arr)" style="color:' + color + '"/>';
            }
        });
        [...g.nodes.values()].forEach(n => {
            const p = pos.get(n.id);
            if (!p) return;
            const isSel = n.id === sel;
            const on = active(n.id);
            const fill = n.kind === 'resource' ? 'var(--color-surface-2)' : 'var(--color-surface-1)';
            const stroke = isSel ? '#8E2A2A' : (sel && reach && reach.has(n.id) ? '#8E2A2A' : 'var(--color-border-strong)');
            s += '<g style="cursor:pointer;" opacity="' + (on ? 1 : 0.3) + '" onclick="ceaSelect(\'' + _esc(n.id) + '\')">' +
                '<rect x="' + p.x + '" y="' + p.y + '" width="' + boxW + '" height="' + boxH + '" rx="4" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (isSel ? 2.5 : 1.2) + '"/>' +
                '<text x="' + (p.x + 10) + '" y="' + (p.y + 21) + '" font-size="11.5" fill="var(--color-text-primary)">' + _esc((n.name || n.id).slice(0, 28)) + '</text></g>';
        });
        s += '</svg>';
        return s;
    }

    // ------------------------------------------------------------ pan/zoom
    function _ceaBindPanZoom() {
        const svg = document.getElementById('cea-svg');
        if (!svg || svg._pzBound) return;
        svg._pzBound = true;
        const def = () => window._ceaDefView || { w: 700, h: 400 };
        const vb = () => window._ceaView || { x: 0, y: 0, w: def().w, h: def().h };
        const apply = v => { window._ceaView = v; svg.setAttribute('viewBox', v.x + ' ' + v.y + ' ' + v.w + ' ' + v.h); };
        let drag = null, moved = false;
        svg.addEventListener('pointerdown', e => {
            drag = { px: e.clientX, py: e.clientY, v: vb() }; moved = false;
            try { svg.setPointerCapture(e.pointerId); } catch (_) {}
            svg.style.cursor = 'grabbing';
        });
        svg.addEventListener('pointermove', e => {
            if (!drag) return;
            const r = svg.getBoundingClientRect();
            if (!r.width || !r.height) return;
            if (Math.abs(e.clientX - drag.px) + Math.abs(e.clientY - drag.py) > 4) moved = true;
            apply({
                x: drag.v.x - (e.clientX - drag.px) * drag.v.w / r.width,
                y: drag.v.y - (e.clientY - drag.py) * drag.v.h / r.height,
                w: drag.v.w, h: drag.v.h
            });
        });
        const end = () => { drag = null; svg.style.cursor = 'grab'; };
        svg.addEventListener('pointerup', end);
        svg.addEventListener('pointercancel', end);
        svg.addEventListener('pointerleave', end);
        // a drag is not a click: suppress node selection after real movement
        svg.addEventListener('click', e => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
        svg.addEventListener('wheel', e => {
            // ⌘/Ctrl + scroll zooms (trackpad pinch arrives as ctrl+wheel);
            // plain scroll stays what it always was — the page scrolling.
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            const v = vb(), r = svg.getBoundingClientRect();
            if (!r.width || !r.height) return;
            const k = e.deltaY > 0 ? 1.12 : 1 / 1.12;
            const nw = v.w * k;
            if (nw > def().w * 4 || nw < def().w / 10) return;   // zoom bounds: ×0.25 … ×10
            const mx = v.x + (e.clientX - r.left) * v.w / r.width;
            const my = v.y + (e.clientY - r.top) * v.h / r.height;
            apply({ x: mx - (mx - v.x) * k, y: my - (my - v.y) * k, w: nw, h: v.h * k });
        }, { passive: false });
        svg.addEventListener('dblclick', e => { e.preventDefault(); apply({ x: 0, y: 0, w: def().w, h: def().h }); });
    }

    // ---------------------------------------------------------------- page
    function renderCeaPage() {
        const host = document.getElementById('cea-host');
        if (!host) return;
        const g = ceaGraph();
        const f = ceaFindings();
        const sel = window._ceaSelected;

        const conflicts = f.rows.filter(r => r.kind === 'conflict');
        const unreviewed = f.rows.filter(r => r.kind === 'unreviewed');
        const tile = (lbl, val, sub, warn) => '<div style="border:1px solid var(--color-border-hair); border-radius:10px; padding:12px 14px; background:var(--color-surface-1);">' +
            '<div style="font-size:11px; color:var(--color-text-tertiary); text-transform:uppercase; letter-spacing:0.05em;">' + lbl + '</div>' +
            '<div style="font-size:24px; font-weight:700; margin-top:2px;' + (warn ? ' color:#8E2A2A;' : '') + '">' + val + '</div>' +
            (sub ? '<div style="font-size:11px; color:var(--color-text-tertiary);">' + sub + '</div>' : '') + '</div>';

        let html = '<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:16px;">' +
            tile('Graph', g.nodes.size + ' nodes', g.edges.length + ' dependency edges') +
            tile('Pairs reconciled', f.pairs, f.corroborated + ' corroborated by the table') +
            tile('Unreviewed paths', unreviewed.length, 'cascade exists, cell never reviewed', unreviewed.length > 0) +
            tile('Conflicts', conflicts.length, 'cleared cell vs live dependency path', conflicts.length > 0) + '</div>';

        html += '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); padding:12px 14px; margin-bottom:16px;">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;"><b>Dependency graph</b>' +
            '<span style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">' +
            (sel ? 'cascade from ' + _esc((g.nodes.get(sel) || {}).name || sel) + ' — click again to clear' : 'click a node to trace its cascade') +
            ' · drag to pan · ⌘/Ctrl+scroll to zoom · double-click to reset</span></div>' +
            _svgGraph(g) +
            '<div style="font-size:10.5px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:4px;">' +
            '<span style="color:#9A6200;">━</span> provides · <span style="color:#4A6741;">━</span> feeds · <span style="color:#0A63CC;">━</span> interface · <span style="color:#8E2A2A;">━</span> selected cascade</div></div>';

        if (sel) {
            const casc = ceaCascade(sel, g);
            html += '<div style="margin-bottom:16px;"><b style="font-size:13px;">Cascade closure (' + casc.length + ' reached)</b>' +
                '<table class="data-table" style="width:100%; font-size:12px; margin-top:6px;"><thead><tr><th>Hops</th><th>Reached</th><th>Path</th></tr></thead><tbody>' +
                casc.map(c => '<tr><td class="u-mono">' + c.hops + '</td><td><b>' + _esc(c.name) + '</b> <span style="font-size:10px; color:var(--color-text-tertiary);">' + c.kind + '</span></td>' +
                    '<td class="u-mono" style="font-size:10.5px;">' + _esc(c.path) + '</td></tr>').join('') +
                '</tbody></table></div>';
        }

        if (f.rows.length) {
            html += '<b style="font-size:13px;">Reconciliation findings — graph vs interdependence table</b>' +
                '<table class="data-table" style="width:100%; font-size:12px; margin-top:6px;"><thead><tr><th>Kind</th><th>Source system</th><th>FC at risk</th><th>Severity</th><th>Dependency path</th><th>Detail</th></tr></thead><tbody>' +
                f.rows.slice(0, 40).map(r => '<tr><td>' +
                    '<span style="display:inline-block; padding:2px 8px; font-size:10px; font-weight:600; text-transform:uppercase; border-radius:var(--r-full); ' +
                    (r.kind === 'conflict' ? 'color:#8E2A2A; background:rgba(255,59,48,0.12);' : 'color:#9A6200; background:rgba(255,149,0,0.12);') + '">' + r.kind + '</span></td>' +
                    '<td>' + _esc(r.source) + '</td><td class="u-mono">' + _esc(r.fc) + '</td><td>' + _esc(r.severity || '—') + '</td>' +
                    '<td class="u-mono" style="font-size:10.5px;">' + _esc(r.via) + '</td><td style="font-size:11px; color:var(--color-text-secondary);">' + _esc(r.detail) + '</td></tr>').join('') +
                '</tbody></table>' +
                (f.rows.length > 40 ? '<p class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary);">… ' + (f.rows.length - 40) + ' more</p>' : '');
        } else {
            html += '<p style="color:var(--color-text-tertiary); font-size:13px;">Every cascade path is corroborated by the interdependence table — no findings.</p>';
        }
        html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">The graph is compiled from Resources (provides/feeds), declared interfaces, and nothing else — it is the model\'s own dependency structure. ' +
            'Findings are disagreements between the computed lane (cascade closure) and the elicited lane (interdependence cells). Resolve by reviewing the cell, not by editing the graph.</p>';
        host.innerHTML = html;
        try { _ceaBindPanZoom(); } catch (_) {}
    }

    // ---------------------------------------- runtime graft: the PASA gate
    (function graftGate() {
        try {
            if (typeof CKPT_CHECKLISTS === 'undefined' || !Array.isArray(CKPT_CHECKLISTS.PASA)) return;
            if (CKPT_CHECKLISTS.PASA.some(i => i.id === 'cea')) return;
            CKPT_CHECKLISTS.PASA.push({
                id: 'cea', kind: 'auto', ref: 'B.3',
                label: 'Cascade paths reconciled with the interdependence table',
                eval: () => {
                    const f = ceaFindings();
                    if (!f.pairs) return { pass: true, detail: 'no dependency paths in the model' };
                    return { pass: f.rows.length === 0,
                        detail: f.rows.length ? f.rows.filter(r => r.kind === 'conflict').length + ' conflict(s) · ' + f.rows.filter(r => r.kind === 'unreviewed').length + ' unreviewed path(s)' : f.corroborated + ' path(s), all corroborated' };
                },
            });
        } catch (_) {}
    })();

    // ------------------------------------------------- navigation wrapper
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._ceaWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-cea');
                if (v) v.style.display = (tabId === 'cea') ? 'block' : 'none';
                const s = document.getElementById('snav-cea');
                if (s) s.classList.toggle('snav-active', tabId === 'cea');
                if (tabId === 'cea') renderCeaPage();
            } catch (_) {}
            return r;
        };
        wrapped._ceaWrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------ exports
    window.ceaGraph = ceaGraph;
    window.ceaCascade = ceaCascade;
    window.ceaFindings = ceaFindings;
    window.renderCeaPage = renderCeaPage;
})();
