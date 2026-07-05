// ============================================================================
// pssa_ssa_pages.js — v1.0 — PSSA and SSA become PROPER PAGES.
//
// PASA is a full workspace and ASA is a real page, but PSSA and SSA were
// naked checkpoint modals — a nav click that popped a checklist. Worse, the
// content they SHOULD hold existed nowhere: the cross-system roll-up. The
// per-system work lives in each system workspace; the program-level "where
// does every system stand" view was missing.
//
//   PSSA page — system safety, planned: one row per system — SFHA rows
//     (classified/total), allocation trees, DAL allocations, open CMAs,
//     requirements — plus the checkpoint state and a jump into each
//     system's workspace. "Is every system's planned analysis in place?"
//
//   SSA page — system safety, as-built: one row per system — verification
//     mirrors vs allocation trees, BUDGET COMPLIANCE (mirror-computed P vs
//     allocated P per tree, the INV-03 comparison itemized per system),
//     FMES rows, field-data verdicts — plus checkpoint state and jumps.
//     "Does the as-built aircraft meet what the plan allocated?"
//
// The checkpoint modal stays one click away (button on each page). Views
// are created at runtime (born-modular; no static HTML), nav entries are
// rewired from openCockpitModal(...) to switchTab('pssa-page'/'ssa-page').
// Read-only aggregation — these pages derive, they never store.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _sysList() { return (typeof systemsData !== 'undefined' ? systemsData : []) || []; }
    function _pages() { return (typeof ftaPages !== 'undefined' ? ftaPages : []) || []; }
    function _sevRank(s) { return (typeof SEVERITY_RANK !== 'undefined' ? SEVERITY_RANK[s] : 0) || 0; }

    // ------------------------------------------------------------- the data
    function pssaPageData() {
        return _sysList().map(s => {
            const fha = (s.fha || []).filter(Boolean);
            const classified = fha.filter(f => f.severity).length;
            const catHaz = fha.filter(f => _sevRank(f.severity) >= 4).length;
            const alloc = _pages().filter(p => p && p.root && !p.verifies && p.systemId === s.id);
            let dals = 0;
            alloc.forEach(p => { (function walk(n) { if (!n) return; if (n.allocatedDAL) dals++; (n.children || []).forEach(walk); })(p.root); });
            const gateKeys = new Set();
            alloc.forEach(p => { (function walk(n) { if (!n) return; if (n.type === 'gate') gateKeys.add(p.id + ':' + n.id); (n.children || []).forEach(walk); })(p.root); });
            const cmas = ((typeof cmaData !== 'undefined' ? cmaData : []) || []).filter(c =>
                c && (c.linkedGateIds || []).some(g => gateKeys.has(g)));
            const cmaOpen = cmas.filter(c => !['Mitigated', 'Closed — Accepted'].includes(c.status || 'Open')).length;
            return {
                id: s.id, name: s.name || s.id,
                fhaTotal: fha.length, fhaClassified: classified, catHaz,
                allocTrees: alloc.length, dals, cmas: cmas.length, cmaOpen,
                reqs: (s.req || []).filter(Boolean).length,
                gap: fha.length === 0 ? 'no SFHA yet'
                    : (classified < fha.length ? (fha.length - classified) + ' unclassified FC(s)'
                        : (catHaz > 0 && alloc.length === 0 ? 'Cat/Haz FCs with no allocation tree' : null))
            };
        });
    }

    function ssaPageData() {
        return _sysList().map(s => {
            const alloc = _pages().filter(p => p && p.root && !p.verifies && p.systemId === s.id);
            const mirrors = _pages().filter(p => p && p.root && p.verifies && p.systemId === s.id);
            // budget compliance per mirrored pair (the INV-03 comparison, itemized).
            // Roots without a computed roll-up (page never opened this session)
            // fall back to the BDD engine's exact P(top) — deterministic either way.
            const _rootP = root => {
                const p = parseFloat(root.probability) || 0;
                if (p > 0) return p;
                try {
                    if (typeof computeExactProbability === 'function') return computeExactProbability(root).prob || 0;
                    if (typeof SLFTAEngine !== 'undefined' && SLFTAEngine.computeExactProbability) return SLFTAEngine.computeExactProbability(root).prob || 0;
                } catch (_) {}
                return 0;
            };
            const pairs = [];
            mirrors.forEach(m => {
                const a = alloc.find(p => p.id === m.verifies);
                if (!a) return;
                const budget = _rootP(a.root);
                const actual = _rootP(m.root);
                if (budget > 0 && actual > 0)
                    pairs.push({ page: a.name, budget, actual, ok: actual <= budget * 1.000001 });
            });
            const fmes = ((typeof fmeaData !== 'undefined' ? fmeaData : []) || []).filter(r =>
                r && (r.owningSystemId === s.id || r.systemId === s.id)).length;
            // field verdicts on events inside this system's trees (via RAM suite)
            let field = { n: 0, findings: 0 };
            try {
                if (typeof ramFieldRows === 'function') {
                    const lids = new Set();
                    _pages().filter(p => p && p.systemId === s.id && p.root).forEach(p =>
                        (function walk(n) { if (!n) return; if (n.displayId) lids.add(n.displayId); (n.children || []).forEach(walk); })(p.root));
                    const rows = ramFieldRows().filter(x => x && x.f && lids.has(x.f.beRef));
                    field = { n: rows.length, findings: rows.filter(x => x.verdict === 'finding').length };
                }
            } catch (_) {}
            return {
                id: s.id, name: s.name || s.id,
                allocTrees: alloc.length, mirrors: mirrors.length,
                pairs, pairsOk: pairs.filter(p => p.ok).length,
                fmes, field,
                gap: alloc.length && !mirrors.length ? 'no verification mirror yet'
                    : (pairs.some(p => !p.ok) ? 'BUDGET EXCEEDED on ' + pairs.filter(p => !p.ok).map(p => p.page).join(', ') : null)
            };
        });
    }

    // ---------------------------------------------------------- gate badge
    function _gateBadge(which) {
        try {
            const st = (typeof applyCockpitStatuses === 'function' && typeof computePhaseStatus === 'function')
                ? applyCockpitStatuses(computePhaseStatus()) : null;
            const g = st && st[which];
            if (!g) return '';
            const label = String(g.status || '').replace(/-/g, ' ');
            const good = g.status === 'handed-off' || g.status === 'complete';
            return '<span class="u-mono" style="font-size:11px; font-weight:700; padding:2px 10px; border-radius:var(--r-full);' +
                (good ? ' color:#1D9E75; background:rgba(29,158,117,0.12);' : ' color:#B7791F; background:rgba(255,149,0,0.12);') + '">' +
                _esc(label || 'in progress') + '</span>';
        } catch (_) { return ''; }
    }

    // ------------------------------------------------------------- render
    function _shell(id, title, subtitle, which, bodyHtml) {
        return '<div class="header-with-export"><h3>' + title + '</h3>' +
            '<div style="display:flex; gap:10px; align-items:center;">' + _gateBadge(which) +
            '<button class="ckpt-m-btn" style="font-size:12px; padding:4px 14px;" onclick="openCockpitModal(\'' + which + '\')">Checkpoint…</button></div></div>' +
            '<p style="font-size:12.5px; color:var(--color-text-secondary); margin:4px 0 14px;">' + subtitle + '</p>' + bodyHtml;
    }

    function renderPssaPage() {
        const host = document.getElementById('view-pssa-page');
        if (!host) return;
        const rows = pssaPageData();
        const body = rows.length
            ? '<div style="overflow-x:auto;"><table class="data-table" style="width:100%; font-size:12px;">' +
              '<thead><tr><th>System</th><th>Hazards (SFHA)</th><th>Cat/Haz</th><th>Allocation trees</th><th>DAL allocations</th><th>CMAs (open)</th><th>Requirements</th><th>Standing</th><th></th></tr></thead><tbody>' +
              rows.map(r =>
                  '<tr><td><b>' + _esc(r.name) + '</b></td>' +
                  '<td class="u-mono">' + r.fhaClassified + '/' + r.fhaTotal + ' classified</td>' +
                  '<td class="u-mono">' + r.catHaz + '</td>' +
                  '<td class="u-mono">' + r.allocTrees + '</td>' +
                  '<td class="u-mono">' + r.dals + '</td>' +
                  '<td class="u-mono">' + r.cmas + (r.cmaOpen ? ' <span style="color:#B7791F; font-weight:700;">(' + r.cmaOpen + ' open)</span>' : '') + '</td>' +
                  '<td class="u-mono">' + r.reqs + '</td>' +
                  '<td>' + (r.gap ? '<span style="color:#B7791F; font-size:11px; font-weight:600;">' + _esc(r.gap) + '</span>' : '<span style="color:#1D9E75; font-size:11px; font-weight:700;">in place ✓</span>') + '</td>' +
                  '<td><button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px;" onclick="activeSystemId=\'' + _esc(r.id) + '\'; switchTab(\'sys-workspace\')">open →</button></td></tr>'
              ).join('') + '</tbody></table></div>'
            : '<p style="color:var(--color-text-tertiary);">No systems yet — add systems in the Systems directory and their planned analyses appear here.</p>';
        host.innerHTML = _shell('pssa', 'System safety — planned <span style="color:var(--color-text-tertiary); font-weight:400;">(PSSA)</span>',
            'The program-level roll-up: where every system’s PLANNED analysis stands — hazards classified, trees built, DALs allocated, common-mode analyses dispositioned. Row-level gaps are named; the detail lives in each system’s workspace.', 'PSSA', body);
    }

    function renderSsaPage() {
        const host = document.getElementById('view-ssa-page');
        if (!host) return;
        const rows = ssaPageData();
        const body = rows.length
            ? '<div style="overflow-x:auto;"><table class="data-table" style="width:100%; font-size:12px;">' +
              '<thead><tr><th>System</th><th>Mirrors / trees</th><th>Budget compliance</th><th>FMES rows</th><th>Field data</th><th>Standing</th><th></th></tr></thead><tbody>' +
              rows.map(r =>
                  '<tr><td><b>' + _esc(r.name) + '</b></td>' +
                  '<td class="u-mono">' + r.mirrors + '/' + r.allocTrees + '</td>' +
                  '<td>' + (r.pairs.length
                      ? r.pairs.map(p => '<div class="u-mono" style="font-size:11px;' + (p.ok ? '' : ' color:#8E2A2A; font-weight:700;') + '">' +
                          _esc(p.page.slice(0, 34)) + ': ' + p.actual.toExponential(1) + ' ≤ ' + p.budget.toExponential(1) + (p.ok ? ' ✓' : ' ✗ EXCEEDED') + '</div>').join('')
                      : '<span style="color:var(--color-text-tertiary);">—</span>') + '</td>' +
                  '<td class="u-mono">' + r.fmes + '</td>' +
                  '<td class="u-mono">' + (r.field.n ? r.field.n + (r.field.findings ? ' <span style="color:#8E2A2A; font-weight:700;">(' + r.field.findings + ' finding)</span>' : ' ✓') : '—') + '</td>' +
                  '<td>' + (r.gap ? '<span style="color:' + (r.gap.indexOf('EXCEEDED') >= 0 ? '#8E2A2A' : '#B7791F') + '; font-size:11px; font-weight:600;">' + _esc(r.gap) + '</span>' : '<span style="color:#1D9E75; font-size:11px; font-weight:700;">verified ✓</span>') + '</td>' +
                  '<td><button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px;" onclick="activeSystemId=\'' + _esc(r.id) + '\'; switchTab(\'sys-workspace\')">open →</button></td></tr>'
              ).join('') + '</tbody></table></div>'
            : '<p style="color:var(--color-text-tertiary);">No systems yet.</p>';
        host.innerHTML = _shell('ssa', 'System safety — as-built <span style="color:var(--color-text-tertiary); font-weight:400;">(SSA)</span>',
            'Does the as-built aircraft meet what the plan allocated? Verification mirrors against allocation trees, computed probability against budget (itemized per tree), failure-mode summaries, and in-service field verdicts — per system.', 'SSA', body);
    }

    // ------------------------------------------------ views + nav wiring
    function _ensureViews() {
        const ref = document.getElementById('view-trace');
        if (!ref || !ref.parentNode) return false;
        ['pssa-page', 'ssa-page'].forEach(id => {
            if (!document.getElementById('view-' + id)) {
                const d = document.createElement('div');
                d.id = 'view-' + id;
                d.style.display = 'none';
                ref.parentNode.insertBefore(d, ref);
            }
        });
        return true;
    }
    (function rewireNav() {
        const p = document.getElementById('snav-pssa');
        if (p) { p.setAttribute('onclick', "switchTab('pssa-page')"); }
        const s = document.getElementById('snav-ssa');
        if (s) { s.setAttribute('onclick', "switchTab('ssa-page')"); }
    })();
    (function wrap() {
        if (typeof window.switchTab === 'function' && !window.switchTab._pssaPagesWrapped) {
            const orig = window.switchTab;
            const wrapped = function (tabId) {
                const r = orig.apply(this, arguments);
                try {
                    if (!_ensureViews()) return r;
                    ['pssa-page', 'ssa-page'].forEach(id => {
                        const v = document.getElementById('view-' + id);
                        if (v) v.style.display = (tabId === id) ? 'block' : 'none';
                        const n = document.getElementById('snav-' + id.replace('-page', ''));
                        if (n) n.classList.toggle('snav-active', tabId === id);
                    });
                    if (tabId === 'pssa-page') renderPssaPage();
                    if (tabId === 'ssa-page') renderSsaPage();
                } catch (_) {}
                return r;
            };
            wrapped._pssaPagesWrapped = true;
            window.switchTab = wrapped;
        }
    })();

    // ------------------------------------------------------------- exports
    window.pssaPageData = pssaPageData;
    window.ssaPageData = ssaPageData;
    window.renderPssaPage = renderPssaPage;
    window.renderSsaPage = renderSsaPage;
})();
