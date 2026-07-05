// ============================================================================
// nav_sfha_tree.js — v1.0 — per-system assessment dropdowns in the sidebar.
//
// The AFHA entry is a dropdown whose options are the assessment's own steps
// (functions → FCIM → hazard assessment). This module mirrors that PER
// SYSTEM: each system row in the Analyze group expands to the same three
// steps, landing on the corresponding workspace sub-tab. The nav teaches
// the method: every hazard assessment, aircraft or system, is the same
// three moves.
//
// Born-modular: wraps window._renderSidebarContext (top-level monolith
// function — bare internal call sites resolve through the global binding,
// the scheduleAutosave precedent) and rebuilds only the #asb-sys-list
// content from the same systemsData. The '+ Add New System' action and the
// active-system highlight are preserved.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    const STEPS = [
        { tab: 'func', label: '1 · Functions' },
        { tab: 'fcim', label: '2 · Failure condition matrix (FCIM)' },
        { tab: 'fha',  label: '3 · Hazard assessment (SFHA)' },
        // Requirements and assumptions ride ALL the system's analyses —
        // deliberately unnumbered: not sequence steps. Requirements sync with
        // the repository (and thence Jama/Polarion/DOORS via ReqIF).
        { tab: 'req',  label: 'Requirements — system' },
        { tab: 'asm',  label: 'Assumptions — system analyses' },
        // Items live with their owning system (P9 workspace tab); the master
        // list across all systems sits in Analyze beside the component library.
        { tab: 'items', label: 'Items & LRUs' },
    ];

    window._navOpenSysStep = function (sysId, subTab) {
        try {
            if (typeof openSystemWorkspace === 'function') openSystemWorkspace(sysId);
            setTimeout(() => { try { if (typeof switchWorkspaceTab === 'function') switchWorkspaceTab(subTab); } catch (_) {} }, 80);
        } catch (_) {}
    };

    function _rebuildSysList() {
        const host = document.getElementById('asb-sys-list');
        if (!host) return;
        const list = (typeof systemsData !== 'undefined' && systemsData) ? systemsData : [];
        if (!list.length) return;   // monolith's "No systems yet" stands
        const active = (typeof activeSystemId !== 'undefined') ? activeSystemId : null;
        host.innerHTML = list.map(s => {
            const isActive = s.id === active;
            return '<details class="asb-grp asb-nested"' + (isActive ? ' open' : '') + '>' +
                '<summary onclick="event.preventDefault(); var d=this.parentElement; d.open=!d.open; if(d.open) openSystemWorkspace(\'' + _esc(s.id) + '\');">' +
                '<span class="asb-lbl"' + (isActive ? ' style="font-weight:700;"' : '') + '>' + _esc(s.name || '(unnamed system)') + '</span><span class="asb-chev">›</span></summary>' +
                '<div class="asb-sub2">' +
                STEPS.map(st =>
                    '<a class="asb-item sub" role="button" tabindex="0" onclick="_navOpenSysStep(\'' + _esc(s.id) + '\', \'' + st.tab + '\')">' +
                    '<span class="asb-lbl">' + st.label + '</span></a>').join('') +
                '</div></details>';
        }).join('') +
            '<a class="asb-item sub asb-add-system" role="button" tabindex="0" onclick="try{if(typeof promptCreateSystem===\'function\')promptCreateSystem();}catch(_){}"><span class="asb-lbl">+ Add New System</span></a>';
    }

    (function wrap() {
        if (typeof window._renderSidebarContext !== 'function' || window._renderSidebarContext._sfhaTreeWrapped) return;
        const orig = window._renderSidebarContext;
        const wrapped = function () {
            const r = orig.apply(this, arguments);
            try { _rebuildSysList(); } catch (_) {}
            return r;
        };
        wrapped._sfhaTreeWrapped = true;
        window._renderSidebarContext = wrapped;
    })();

    window._rebuildSysNav = _rebuildSysList;
})();
