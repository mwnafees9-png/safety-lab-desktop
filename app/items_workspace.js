// ============================================================================
// items_workspace.js — Phase P9: the Items/LRU lane collapses into each
// system workspace, so a system's equipment is edited where the system's
// functions, FCs, requirements and FMEA already live.
//
// The global Items library page stays (it is the cross-system view and owns
// the full form with zone/trace pickers). What this module adds is an
// "Items / LRUs" sub-tab inside every system workspace showing exactly that
// system's items, with per-row jump-to-edit (reusing the monolith's own
// editItem, so one form, one truth), quick-add scoped to the system, and the
// derived posture columns the workspace wants at a glance: DAL, DO-178/254
// lane, λ from the reliability library, and thread membership.
//
// Born modular: classic script, zero monolith edits. The sub-tab button and
// host div are injected at runtime next to the existing workspace tabs; the
// monolith's switchWorkspaceTab is wrapped (flag _itemsWsWrapped) so the new
// tab participates in the same show/hide cycle.
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // -------------------------------------------------------- DOM injection
    function _ensureHost() {
        // tab button, after the PSSA tab
        const pssaBtn = document.getElementById('ws-tab-pssa');
        if (pssaBtn && !document.getElementById('ws-tab-items')) {
            const b = document.createElement('button');
            b.id = 'ws-tab-items';
            b.textContent = 'Items / LRUs';
            b.onclick = () => switchWorkspaceTab('items');
            pssaBtn.parentNode.insertBefore(b, pssaBtn.nextSibling);
        }
        // view host, sibling of the other ws views
        const ref = document.getElementById('ws-view-pssa') || document.getElementById('ws-view-func');
        if (ref && !document.getElementById('ws-view-items')) {
            const d = document.createElement('div');
            d.id = 'ws-view-items';
            d.style.display = 'none';
            ref.parentNode.insertBefore(d, ref.nextSibling);
        }
    }

    // ------------------------------------------------------------- helpers
    function _sysItems(sysId) {
        return ((typeof itemsData !== 'undefined' && itemsData) || []).filter(i => i.owningSystemId === sysId || i.sysId === sysId);
    }
    function _lambda(item) {
        try {
            if (typeof getEffectiveLambda === 'function') {
                const v = getEffectiveLambda(item);
                if (v > 0) return v;
            }
            if (item.libraryKey && typeof projectConfig !== 'undefined' && projectConfig.customLibrary && projectConfig.customLibrary[item.libraryKey])
                return projectConfig.customLibrary[item.libraryKey].lambda || null;
        } catch (_) {}
        return null;
    }
    function _threadCount(item) {
        // how many FTA basic events reference this item (rough thread membership)
        let n = 0;
        try {
            const key = String(item.itemId || item.internalId);
            const walk = node => {
                if (!node) return;
                if (String(node.itemRef || node.itemId || '') === key) n++;
                (node.children || []).forEach(walk);
            };
            ((typeof ftaPages !== 'undefined' && ftaPages) || []).forEach(p => walk(p.root));
        } catch (_) {}
        return n;
    }

    // --------------------------------------------------------------- panel
    function renderWsItemsPanel() {
        const host = document.getElementById('ws-view-items');
        if (!host) return;
        const sysId = (typeof activeSystemId !== 'undefined') ? activeSystemId : null;
        const sys = ((typeof systemsData !== 'undefined' && systemsData) || []).find(s => s.id === sysId);
        if (!sys) { host.innerHTML = '<p style="color:var(--color-text-tertiary); font-size:13px;">No system selected.</p>'; return; }
        const items = _sysItems(sysId);

        let html = '<div style="display:flex; justify-content:space-between; align-items:center; margin:14px 0 10px;">' +
            '<div><b style="font-size:14px;">Items / LRUs of ' + _esc(sys.name || sys.id) + '</b> ' +
            '<span class="u-mono" style="font-size:11px; color:var(--color-text-tertiary);">' + items.length + ' item(s)</span></div>' +
            '<div><button class="ckpt-m-btn" style="font-size:11.5px; padding:3px 10px;" onclick="itemsWsQuickAdd()">+ add item for this system</button> ' +
            '<a href="#" style="font-size:11px;" onclick="switchTab(\'items\'); return false;">open full library →</a></div></div>';

        if (!items.length) {
            html += '<p style="color:var(--color-text-tertiary); font-size:13px; border:1px dashed var(--color-border-hair); border-radius:8px; padding:18px; text-align:center;">No items recorded for this system yet.</p>';
        } else {
            const dal = d => d ? '<span style="display:inline-block; min-width:18px; text-align:center; padding:1px 6px; border:1px solid var(--color-border-strong); border-radius:3px; font-weight:700; font-size:11px; font-family:var(--font-mono);">' + _esc(d) + '</span>' : '—';
            html += '<table class="data-table" style="width:100%; font-size:12.5px;"><thead><tr>' +
                '<th></th><th>Item</th><th>Name</th><th>Type</th><th>DAL</th><th>Lane</th><th>λ (/FH)</th><th>Tree events</th><th>Description</th></tr></thead><tbody>' +
                items.map(i => {
                    const lam = _lambda(i);
                    const th = _threadCount(i);
                    return '<tr>' +
                        '<td><a href="#" title="edit in the Items library form" onclick="try{editItem(' + JSON.stringify(i.internalId) + ');}catch(_){switchTab(\'items\');} return false;" style="font-size:11px;">edit</a></td>' +
                        '<td class="u-mono"><b>' + _esc(i.itemId || i.internalId) + '</b></td>' +
                        '<td>' + _esc(i.name) + '</td>' +
                        '<td style="font-size:11.5px;">' + _esc(i.type || '—') + '</td>' +
                        '<td>' + dal(i.dal) + '</td>' +
                        '<td style="font-size:11px;">' + _esc(i.daType || '—') + '</td>' +
                        '<td class="u-mono" style="font-size:11px;">' + (lam ? lam.toExponential(1) : '—') + '</td>' +
                        '<td class="u-mono" style="font-size:11px;' + (th ? '' : ' color:var(--color-text-tertiary);') + '">' + (th || '—') + '</td>' +
                        '<td style="font-size:11px; color:var(--color-text-secondary);">' + _esc((i.desc || i.description || '').slice(0, 60)) + '</td></tr>';
                }).join('') + '</tbody></table>';
            // posture strip: DAL mix + λ availability
            const dals = {}; items.forEach(i => { const d = i.dal || '—'; dals[d] = (dals[d] || 0) + 1; });
            const noLam = items.filter(i => !_lambda(i)).length;
            html += '<p class="u-mono" style="font-size:11px; color:var(--color-text-tertiary); margin-top:8px;">DAL mix: ' +
                Object.keys(dals).sort().map(d => d + '×' + dals[d]).join(' · ') +
                (noLam ? ' — ' + noLam + ' item(s) without a library failure rate' : ' — every item carries a failure rate') + '</p>';
        }
        host.innerHTML = html;
    }

    // Quick-add: jump to the library form with the owning system preselected.
    window.itemsWsQuickAdd = function () {
        const sysId = (typeof activeSystemId !== 'undefined') ? activeSystemId : null;
        try {
            switchTab('items');
            setTimeout(() => {
                const sel = document.getElementById('item-owning-system');
                if (sel && sysId) { sel.value = sysId; sel.dispatchEvent(new Event('change')); }
                const idField = document.getElementById('item-id');
                if (idField) idField.focus();
            }, 120);
        } catch (_) {}
    };

    // ------------------------------------------------ workspace-tab wrapper
    (function wrapWsTab() {
        if (typeof window.switchWorkspaceTab !== 'function' || window.switchWorkspaceTab._itemsWsWrapped) return;
        const orig = window.switchWorkspaceTab;
        const wrapped = function (subTab) {
            _ensureHost();
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('ws-view-items');
                if (v) v.style.display = (subTab === 'items') ? 'block' : 'none';
                const b = document.getElementById('ws-tab-items');
                if (b) b.classList.toggle('active', subTab === 'items');
                if (subTab === 'items') renderWsItemsPanel();
            } catch (_) {}
            return r;
        };
        wrapped._itemsWsWrapped = true;
        window.switchWorkspaceTab = wrapped;
    })();

    // ------------------------------------------------------------ exports
    window.renderWsItemsPanel = renderWsItemsPanel;
    window._itemsWsSysItems = _sysItems;
})();
