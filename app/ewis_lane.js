// ============================================================================
// ewis_lane.js — v1.0 — C3: EWIS separation (25.1709 lane). Independence
// claims defeated by common routing are FINDINGS, not footnotes.
//
// The model already knows everything needed: routing runs (routingData —
// which items travel through which zones) and independence claims (CCF
// lookalike pairs under AND-family gates, whose basic events carry
// realizedByItemId). The join is deterministic:
//
//   pair of events claimed/assumed independent
//     → their realizing LRUs
//       → routing runs carrying BOTH through the same zone
//         → CO-ROUTING FINDING: the physical installation undermines the
//           independence the tree arithmetic credits.
//
// INV-26 (advisory) sweeps it continuously; the K350 carries a genuine one
// by design (both brake channels ride RT-001 through the wheel well — the
// same lesson CMA-003 teaches about maintenance independence, now caught
// mechanically for routing). Prints via REG §11c.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _routes() { return (typeof routingData !== 'undefined' ? routingData : []) || []; }

    // find the realizing item of a basic event (walk trees by logicalId)
    function _itemOf(lid) {
        let found = null;
        (((typeof ftaPages !== 'undefined' ? ftaPages : []) || [])).some(p => {
            if (!p || !p.root) return false;
            (function walk(n) {
                if (found || !n) return;
                const nlid = n.logicalId != null ? n.logicalId : n.id;
                if (nlid === lid && n.realizedByItemId) { found = n.realizedByItemId; return; }
                (n.children || []).forEach(walk);
            })(p.root);
            return !!found;
        });
        return found;
    }

    function ewisFindings() {
        const out = [];
        const pairs = (typeof window.ccfPairs === 'function') ? window.ccfPairs() : [];
        pairs.forEach(p => {
            const ia = _itemOf(p.a.logicalId != null ? p.a.logicalId : p.a.id);
            const ib = _itemOf(p.b.logicalId != null ? p.b.logicalId : p.b.id);
            if (!ia || !ib || ia === ib) return;
            _routes().forEach(rt => {
                const carries = rt.carriesItems || [];
                if (carries.indexOf(ia) >= 0 && carries.indexOf(ib) >= 0) {
                    (rt.routesThroughZones || []).forEach(z => out.push({
                        route: rt.routingId || rt.name, zone: z,
                        itemA: ia, itemB: ib,
                        pair: (p.a.name || '') + ' / ' + (p.b.name || ''),
                        pairState: p.state,
                        detail: 'independence pair co-routed through ' + z + ' on ' + (rt.routingId || rt.name) +
                            ' — a single zonal event (fire, chafing, rotor debris) can defeat both channels; 25.1709 separation review required',
                    }));
                }
            });
        });
        return out;
    }

    function ewisRows() {
        return ewisFindings().map(f => ({
            'Route': f.route, 'Zone': f.zone, 'Channel A': f.itemA, 'Channel B': f.itemB,
            'Independence pair': f.pair.slice(0, 70), 'Pair disposition': f.pairState,
            'Finding': f.detail.slice(0, 140),
        }));
    }

    // INV-26 (advisory)
    (function register() {
        function reg() {
            if (typeof window.invRegister !== 'function') return false;
            window.invRegister({
                id: 'INV-26', name: 'No independence pair is co-routed through a single zone (EWIS / 25.1709)', sev: 'advisory',
                run: () => {
                    const f = ewisFindings();
                    const pairs = (typeof window.ccfPairs === 'function') ? window.ccfPairs().length : 0;
                    return { checked: Math.max(pairs, f.length), fails: f.map(x => x.itemA + ' + ' + x.itemB + ' co-routed via ' + x.route + ' through ' + x.zone + ' — physical routing undermines the claimed channel independence') };
                }
            });
            return true;
        }
        if (!reg()) { let tries = 20; const t = setInterval(() => { if (reg() || --tries <= 0) clearInterval(t); }, 300); }
    })();

    // panel on the routing page (view-routing exists in the classic tab set)
    function _render() {
        const view = document.getElementById('view-routing');
        if (!view) return;
        let div = document.getElementById('ewis-panel');
        if (!div) { div = document.createElement('div'); div.id = 'ewis-panel'; view.appendChild(div); }
        const f = ewisFindings();
        div.innerHTML = '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-top:var(--s-5);">' +
            '<div style="padding:8px 14px; border-bottom:1px solid var(--color-border-strong); font-size:11px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase;">EWIS separation — 25.1709 lane (C3)</div>' +
            '<div style="padding:8px 14px; font-size:11.5px; color:var(--color-text-secondary);">Independence pairs from the fault trees, joined against the routing runs: two channels of one claim sharing a zone is a finding. Computed continuously (INV-26); the disposition belongs in the CMA / ZSA, not in editing this panel.</div>' +
            (f.length
                ? f.map(x => '<div style="font-size:12px; margin:6px 14px; padding:6px 10px; border-left:3px solid #8E2A2A;"><b>' + _esc(x.itemA) + ' + ' + _esc(x.itemB) + '</b> via ' + _esc(x.route) + ' through <b>' + _esc(x.zone) + '</b> — ' + _esc(x.detail) + '</div>').join('')
                : '<div style="font-size:12px; margin:8px 14px; color:var(--color-text-tertiary);">No co-routed independence pairs detected.</div>') +
            '</div>';
    }
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._ewisWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try { if (tabId === 'routing') setTimeout(_render, 120); } catch (_) {}
            return r;
        };
        wrapped._ewisWrapped = true;
        window.switchTab = wrapped;
    })();

    // REG §11c print path
    function _extend() {
        if (!window.Reports || !window.Reports.DEFAULT_TEMPLATES || !window.Reports.DEFAULT_TEMPLATES.REG) return false;
        const T = window.Reports.DEFAULT_TEMPLATES;
        if (T.REG.indexOf('{{reg_ewis}}') < 0) {
            T.REG = T.REG.replace('## 11. RAM suite outputs',
                '## 11c. EWIS separation findings (25.1709)\nIndependence pairs whose realizing equipment shares a routing run through a single zone — computed from the fault trees and the routing model.\n{{reg_ewis}}\n\n## 11. RAM suite outputs');
        }
        if (!window.Reports.extractData._ewisWrapped) {
            const orig = window.Reports.extractData;
            const wrapped = function (reportType) {
                const data = orig.apply(this, arguments);
                try { if (reportType === 'REG') data.reg_ewis = ewisRows(); } catch (_) { if (reportType === 'REG') data.reg_ewis = []; }
                return data;
            };
            wrapped._ewisWrapped = true;
            window.Reports.extractData = wrapped;
        }
        return true;
    }
    if (!_extend()) { let tries = 20; const t = setInterval(() => { if (_extend() || --tries <= 0) clearInterval(t); }, 300); }

    window.ewisFindings = ewisFindings;
    window.ewisRows = ewisRows;
})();
