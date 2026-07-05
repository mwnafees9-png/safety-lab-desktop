// ============================================================================
// fc_tree_flow.js — v1.0 — the 1309 chart DRIVES the tree decision (systems).
//
// The chart logic existed (decideAnalysisDepth — severity × certification
// basis × chart properties per AC 25.1309-1B / 23.1309-1E) but nothing acted
// on it, and there was no visible path from a system FC to its fault tree.
//
// Now, on every system's SFHA tab, each failure condition shows its chart
// route and the action it earns:
//
//   PASSES the chart (quantitative analysis demanded)
//     → CREATE FAULT TREE: one click scaffolds the system allocation tree —
//       linked to the FC, top event named for it, FDAL from the safety
//       target, a starter undeveloped event to decompose — and opens the
//       canvas. Already has one → OPEN TREE.
//
//   DOESN'T pass (design appraisal / qualitative / similarity route)
//     → TRADE OPTIONS: a sandbox TRADE tree (standalone — deliberately
//       outside certification roll-up, promotable later via the existing
//       sandbox-promote path), or a signed design-appraisal / similarity
//       disposition recorded on the FC itself.
//
// Deterministic and idempotent: create is refused when a linked allocation
// tree already exists; every act is journaled. No monolith edits.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _sys() {
        const id = (typeof activeSystemId !== 'undefined') ? activeSystemId : null;
        return ((typeof systemsData !== 'undefined' ? systemsData : []) || []).find(s => s && s.id === id) || null;
    }
    function _pages() { return (typeof ftaPages !== 'undefined' ? ftaPages : []) || []; }
    function _nid() { return (typeof internalIdCounter !== 'undefined') ? internalIdCounter++ : Date.now(); }

    // ------------------------------------------------------ the chart verdict
    function fcChartRoute(fha) {
        let depth = null;
        try { if (typeof AutoReq !== 'undefined' && AutoReq.decideAnalysisDepth) depth = AutoReq.decideAnalysisDepth(fha); } catch (_) {}
        if (!depth) return { route: 'unknown', label: 'chart unavailable' };
        if (depth.skip) return { route: 'trade', label: 'design & installation appraisal (¶17a/b) — no quantitative tree demanded', depth };
        if (depth.mode === 'similarity') return { route: 'trade', label: 'similarity argument route — no quantitative tree demanded', depth };
        if (depth.mode === 'qualitative') return { route: 'trade', label: 'qualitative assessment route — quantitative tree optional', depth };
        return { route: 'quant', label: 'quantitative analysis demanded (' + (depth.clause ? '§' + depth.clause : 'chart') + ')', depth };
    }

    function _linkedTree(fha) {
        return _pages().find(p => {
            if (!p || !p.root || p.verifies) return false;
            const ids = (Array.isArray(p.linkedFhaIds) ? p.linkedFhaIds : []).concat(p.linkedFhaId != null ? [p.linkedFhaId] : []);
            return ids.map(x => String(x).replace(/^(AC_|SYS_)/, '')).indexOf(String(fha.internalId)) >= 0;
        });
    }

    // ---------------------------------------------------------- the actions
    function fcTreeCreate(sysId, fhaInternalId) {
        const s = ((typeof systemsData !== 'undefined' ? systemsData : []) || []).find(x => x && x.id === sysId);
        const fha = s && (s.fha || []).find(f => f && String(f.internalId) === String(fhaInternalId));
        if (!s || !fha) return null;
        const existing = _linkedTree(fha);
        if (existing) return existing;                     // idempotent — never a duplicate
        let dal = '';
        try { if (typeof getSafetyTarget === 'function') dal = (getSafetyTarget(fha.severity) || {}).dal || ''; } catch (_) {}
        const starter = {
            id: _nid(), name: 'Decompose: causes of ' + (fha.fcDesc || fha.fcId || 'this condition'),
            type: 'undeveloped', lambda: 0, probability: 0, inputMode: 'probability', children: []
        };
        const root = {
            id: _nid(), name: fha.fcDesc || fha.fcId || 'Failure condition',
            type: 'gate', gateType: 'OR', probability: 0, children: [starter]
        };
        if (dal) root.allocatedDAL = dal;
        [root, starter].forEach(n => { n.logicalId = n.id; n.displayId = (n.type === 'gate' ? 'G-' : 'UD-') + n.id; });
        const page = {
            id: 'fc-tree-' + fha.internalId,
            name: 'PSSA · ' + (fha.fcId || '') + ' ' + (fha.fcDesc || '').slice(0, 44),
            treeLevel: 'system', systemId: s.id, mode: 'top-down',
            linkedFhaIds: [fha.internalId], root
        };
        _pages().push(page);
        try { if (typeof window.jrnl === 'function') window.jrnl('tree-created', page.name + ' scaffolded from the 1309 chart verdict'); } catch (_) {}
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        return page;
    }

    function fcTradeTree(sysId, fhaInternalId) {
        const s = ((typeof systemsData !== 'undefined' ? systemsData : []) || []).find(x => x && x.id === sysId);
        const fha = s && (s.fha || []).find(f => f && String(f.internalId) === String(fhaInternalId));
        if (!s || !fha) return null;
        const pid = 'trade-tree-' + fha.internalId;
        const existing = _pages().find(p => p && p.id === pid);
        if (existing) return existing;
        const root = {
            id: _nid(), name: 'TRADE STUDY — ' + (fha.fcDesc || fha.fcId || ''),
            type: 'gate', gateType: 'OR', probability: 0, children: []
        };
        root.logicalId = root.id; root.displayId = 'G-' + root.id;
        // treeLevel 'standalone' = the SANDBOX: excluded from certification
        // roll-up, AutoReq, and DAL allocation by the existing machinery;
        // promotable out of the sandbox later if the trade earns its keep.
        const page = {
            id: pid, name: 'TRADE · ' + (fha.fcId || '') + ' ' + (fha.fcDesc || '').slice(0, 40),
            treeLevel: 'standalone', systemId: s.id, mode: 'top-down',
            linkedFhaIds: [fha.internalId], root
        };
        _pages().push(page);
        try { if (typeof window.jrnl === 'function') window.jrnl('trade-tree', page.name + ' opened as a sandbox trade study (no certification roll-up)'); } catch (_) {}
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        return page;
    }

    function _disposition(sysId, fhaInternalId, kind, by) {
        const s = ((typeof systemsData !== 'undefined' ? systemsData : []) || []).find(x => x && x.id === sysId);
        const fha = s && (s.fha || []).find(f => f && String(f.internalId) === String(fhaInternalId));
        if (!fha || !by) return false;
        const stamp = kind + ' route accepted per the 1309 chart — ' + by + ', ' + new Date().toISOString().slice(0, 10);
        fha.comments = ((fha.comments || '') + (fha.comments ? ' · ' : '') + stamp).slice(0, 600);
        try { if (typeof window.jrnl === 'function') window.jrnl('fc-route', (fha.fcId || fha.internalId) + ': ' + stamp); } catch (_) {}
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        return true;
    }

    // ------------------------------------------------------------- UI hooks
    window.fcFlowCreate = function (sysId, iid) {
        const p = fcTreeCreate(sysId, iid);
        if (p && typeof openFTAPageById === 'function') openFTAPageById(p.id);
        _renderPanel();
    };
    window.fcFlowOpen = function (pageId) {
        if (typeof openFTAPageById === 'function') openFTAPageById(pageId);
    };
    window.fcFlowTradeUi = function (sysId, iid) {
        let m = document.getElementById('fc-trade-modal');
        if (m) m.remove();
        m = document.createElement('div');
        m.id = 'fc-trade-modal';
        m.className = 'modal-overlay';
        m.innerHTML = '<div class="modal-content" style="max-width: 560px;">' +
            '<div class="modal-header"><h2>Chart Route — Options</h2>' +
            '<button class="btn-red" style="margin:0;" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button></div>' +
            '<div class="modal-body" style="padding: 18px 22px;">' +
            '<p style="font-size:12.5px; color:var(--color-text-secondary); margin:0 0 12px;">The 1309 chart does not demand a quantitative tree for this condition. Pick the route — each is recorded.</p>' +
            '<div style="display:flex; flex-direction:column; gap:8px;">' +
            '<button class="ckpt-m-btn" style="font-size:13px; padding:8px 14px; text-align:left;" onclick="fcFlowTrade(\'' + _esc(sysId) + '\',\'' + _esc(String(iid)) + '\')">🧪 Open a TRADE tree (sandbox — no certification roll-up, promotable later)</button>' +
            '<button class="ckpt-m-btn" style="font-size:13px; padding:8px 14px; text-align:left;" onclick="fcFlowDispo(\'' + _esc(sysId) + '\',\'' + _esc(String(iid)) + '\',\'Design & installation appraisal\')">📋 Record design &amp; installation appraisal disposition</button>' +
            '<button class="ckpt-m-btn" style="font-size:13px; padding:8px 14px; text-align:left;" onclick="fcFlowDispo(\'' + _esc(sysId) + '\',\'' + _esc(String(iid)) + '\',\'Similarity argument\')">🔁 Record similarity-argument disposition</button>' +
            '</div></div></div>';
        document.body.appendChild(m);
        m.addEventListener('click', e => { if (e.target === m) m.remove(); });
        m.style.display = 'flex';
        setTimeout(() => m.classList.add('show'), 10);
    };
    window.fcFlowTrade = function (sysId, iid) {
        const m = document.getElementById('fc-trade-modal'); if (m) m.remove();
        const p = fcTradeTree(sysId, iid);
        if (p && typeof openFTAPageById === 'function') openFTAPageById(p.id);
        _renderPanel();
    };
    window.fcFlowDispo = function (sysId, iid, kind) {
        const by = prompt('Sign the ' + kind.toLowerCase() + ' disposition:');
        if (!by || !by.trim()) return;
        const m = document.getElementById('fc-trade-modal'); if (m) m.remove();
        _disposition(sysId, iid, kind, by.trim());
        try { if (typeof showToast === 'function') showToast(kind + ' disposition recorded and journaled.', 'success', 3200); } catch (_) {}
        _renderPanel();
    };

    // ------------------------------------------------------------ the panel
    function _renderPanel() {
        const view = document.getElementById('ws-view-fha');
        if (!view) return;
        const s = _sys();
        let host = document.getElementById('fc-flow-host');
        if (!host) {
            host = document.createElement('div');
            host.id = 'fc-flow-host';
            view.appendChild(host);
        }
        if (!s || !(s.fha || []).length) { host.innerHTML = ''; return; }
        const rows = (s.fha || []).filter(Boolean).map(f => {
            const route = fcChartRoute(f);
            const tree = _linkedTree(f);
            let action;
            if (tree) action = '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px;" onclick="fcFlowOpen(\'' + _esc(tree.id) + '\')">Open tree ↗</button>';
            else if (route.route === 'quant') action = '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px; font-weight:700;" onclick="fcFlowCreate(\'' + _esc(s.id) + '\',\'' + _esc(String(f.internalId)) + '\')">⚡ Create fault tree</button>';
            else action = '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px;" onclick="fcFlowTradeUi(\'' + _esc(s.id) + '\',\'' + _esc(String(f.internalId)) + '\')">Trade options…</button>';
            const routeColor = route.route === 'quant' ? (tree ? '#1D9E75' : '#B7791F') : 'var(--color-text-tertiary)';
            return '<tr><td class="u-mono"><b>' + _esc(f.fcId || '') + '</b></td>' +
                '<td>' + _esc((f.fcDesc || '').slice(0, 60)) + '</td>' +
                '<td class="cell-' + _esc(f.severity || '') + '">' + _esc(f.severity || '—') + '</td>' +
                '<td style="font-size:11px; color:' + routeColor + ';">' + _esc(route.label) + (tree ? ' · tree in place ✓' : '') + '</td>' +
                '<td>' + action + '</td></tr>';
        }).join('');
        host.innerHTML =
            '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-top:18px;">' +
            '<div style="padding:9px 14px; border-bottom:2px solid var(--color-text-primary);"><b>1309 chart → analysis route</b></div>' +
            '<p style="font-size:12px; color:var(--color-text-secondary); padding:8px 14px 4px;">The chart decides, per this project’s certification basis. Conditions that pass get their fault tree in one click — scaffolded, linked, FDAL set, canvas open. Conditions that don’t get the trade options: a sandbox trade tree (outside certification roll-up) or a signed appraisal/similarity disposition.</p>' +
            '<div style="overflow-x:auto; padding:0 14px 12px;"><table class="data-table" style="width:100%; font-size:12px;">' +
            '<thead><tr><th>FC</th><th>Condition</th><th>Severity</th><th>Chart route</th><th></th></tr></thead>' +
            '<tbody>' + rows + '</tbody></table></div></div>';
    }

    (function wrap() {
        if (typeof window.switchTab === 'function' && !window.switchTab._fcFlowWrapped) {
            const orig = window.switchTab;
            const wrapped = function (tabId) {
                const r = orig.apply(this, arguments);
                try { if (tabId === 'sys-workspace') setTimeout(_renderPanel, 200); } catch (_) {}
                return r;
            };
            wrapped._fcFlowWrapped = true;
            window.switchTab = wrapped;
        }
        if (typeof window.switchWorkspaceTab === 'function' && !window.switchWorkspaceTab._fcFlowWrapped) {
            const orig = window.switchWorkspaceTab;
            const wrapped = function (subTab) {
                const r = orig.apply(this, arguments);
                try { if (subTab === 'fha') setTimeout(_renderPanel, 150); } catch (_) {}
                return r;
            };
            wrapped._fcFlowWrapped = true;
            window.switchWorkspaceTab = wrapped;
        }
    })();

    // ------------------------------------------------------------- exports
    window.fcChartRoute = fcChartRoute;
    window.fcTreeCreate = fcTreeCreate;
    window.fcTradeTree = fcTradeTree;
    window._fcFlowRender = _renderPanel;
})();
