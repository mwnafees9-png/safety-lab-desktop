// ============================================================================
// cca_models.js — v1.0 — proper zone models (ZSA) + dynamic threat models (PRA).
//
// ZSA and PRA were elicited tables that never consulted the aircraft model.
// Now each row carries its MODEL, computed live on every render:
//
//   ZONE MODEL (per ZSA row): what the zone actually contains — housed
//   functions resolved to owning systems, routing paths through it with
//   their items — and what a single zonal event DOES: the availability
//   cascade, the MAC rules that break with their arithmetic, the failure
//   conditions that trip. The separation claim's disposition state (M7's
//   MC-04/05 machinery) sits beside it, and the model's computed worst
//   consequence is RECONCILED against the elicited zone severity — the
//   computed lane annotates, never overwrites; disagreement is a named
//   finding (INV-18).
//
//   THREAT MODEL (per PRA row): the postulated risk evaluated dynamically —
//   its affected zones expanded through housing and routing, the combined
//   blast radius cascaded, tripped FCs with severities, and the retention
//   claim checked against the zonal-acceptance ledger. Re-computed from the
//   live model on every visit: change the routing, the threat model moves.
//
// Both panels carry "Simulate →": one click pre-loads the injection into
// the fault simulator on the Cascading Effects page. Read-only throughout.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _sevRank(s) { return (typeof SEVERITY_RANK !== 'undefined' ? SEVERITY_RANK[s] : 0) || 0; }
    function _zsa() { return (typeof zsaData !== 'undefined' ? zsaData : []) || []; }
    function _pra() { return (typeof praData !== 'undefined' ? praData : []) || []; }
    function _routing() { return (typeof routingData !== 'undefined' ? routingData : []) || []; }

    // ------------------------------------------------------------ zone model
    function zsaZoneModel(zoneId) {
        const z = _zsa().find(x => x && x.zoneId === zoneId);
        if (!z) return null;
        const down = (typeof fsZoneDown === 'function') ? fsZoneDown(zoneId) : { systems: new Set(), via: [], ambiguous: [] };
        const routes = _routing().filter(rt => rt && (rt.routesThroughZones || []).indexOf(zoneId) >= 0)
            .map(rt => ({ id: rt.routingId || '', name: rt.name || '', items: rt.carriesItems || [], functions: rt.carriesFunctions || [] }));
        const ev = (typeof fsEvaluate === 'function') ? fsEvaluate(['zone:' + zoneId]) : { trippedFcs: [], breaches: [], closure: [], rulesEvaluated: 0, rulesHolding: 0 };
        const computedWorst = ev.trippedFcs.length ? ev.trippedFcs[0].severity : null;
        const elicited = z.severity || null;
        let reconcile = 'agree';
        if (computedWorst && elicited && _sevRank(computedWorst) > _sevRank(elicited)) reconcile = 'conflict';       // model says WORSE than elicited
        else if (computedWorst && elicited && _sevRank(computedWorst) < _sevRank(elicited)) reconcile = 'conservative'; // elicited is stricter — fine, noted
        else if (computedWorst && !elicited) reconcile = 'unclassified';
        const findings = (typeof fsZonalFindings === 'function') ? fsZonalFindings().filter(f => f.zone === zoneId) : [];
        return {
            zoneId, desc: z.desc || '', elicited, housed: z.housedFunctions || [],
            downs: Array.from(down.systems), via: down.via, ambiguous: down.ambiguous || [],
            routes,
            tripped: ev.trippedFcs, breaches: ev.breaches,
            rules: { evaluated: ev.rulesEvaluated, holding: ev.rulesHolding },
            computedWorst, reconcile,
            findings: findings.map(f => ({ fcId: f.fcId, severity: f.severity, state: f.state })),
            mitigation: z.mitigation || ''
        };
    }

    // ---------------------------------------------------------- threat model
    function praDynamicModel(praIdOrInternal) {
        const p = _pra().find(x => x && (x.praId === praIdOrInternal || String(x.internalId) === String(praIdOrInternal)));
        if (!p) return null;
        const zones = Array.isArray(p.affectedZones) ? p.affectedZones.slice() : [];
        const inj = zones.map(z => 'zone:' + z);
        const ev = (typeof fsEvaluate === 'function' && inj.length) ? fsEvaluate(inj) : { trippedFcs: [], breaches: [], closure: [], downSystems: [], rulesEvaluated: 0, rulesHolding: 0 };
        // retention check: every Cat trip must be an ACCEPTED zonal finding
        const findings = (typeof fsZonalFindings === 'function') ? fsZonalFindings() : [];
        const catTrips = ev.trippedFcs.filter(fc => fc.severity === 'Catastrophic');
        const retention = catTrips.map(fc => {
            const f = findings.find(x => zones.indexOf(x.zone) >= 0 && x.fcId === fc.fcId);
            return { fcId: fc.fcId, state: f ? f.state : 'no-finding-record' };
        });
        const retained = retention.every(r => r.state === 'accepted');
        return {
            praId: p.praId || String(p.internalId), threat: p.threat || '', zones,
            downSystems: ev.downSystems || [], tripped: ev.trippedFcs, breaches: ev.breaches,
            cascade: (ev.closure || []).length,
            rules: { evaluated: ev.rulesEvaluated, holding: ev.rulesHolding },
            retention, retained,
            mitigation: p.mitigation || ''
        };
    }

    // -------------------------------------------------- INV-18: two-lane ZSA
    (function register() {
        function reg() {
            if (typeof window.invRegister !== 'function') return false;
            window.invRegister({
                id: 'INV-18', name: 'Elicited zone severity agrees with the computed zonal consequence', sev: 'advisory',
                run: () => {
                    const fails = []; let checked = 0;
                    _zsa().forEach(z => {
                        if (!z || !z.zoneId) return;
                        const m = zsaZoneModel(z.zoneId);
                        if (!m || !m.computedWorst) return;
                        checked++;
                        if (m.reconcile === 'conflict')
                            fails.push('Zone ' + z.zoneId + ': elicited ' + (m.elicited || '(none)') + ' but the model computes ' + m.computedWorst + ' (' + m.tripped.map(t => t.fcId).join(', ') + ') — review the zone classification');
                        if (m.reconcile === 'unclassified')
                            fails.push('Zone ' + z.zoneId + ': model computes ' + m.computedWorst + ' consequence but the zone row carries no severity');
                    });
                    return { checked, fails };
                }
            });
            return true;
        }
        if (!reg()) { let tries = 20; const t = setInterval(() => { if (reg() || --tries <= 0) clearInterval(t); }, 300); }
    })();

    // ------------------------------------------------------------- simulate
    window.ccaSimulate = function (ids) {
        try {
            window._fsFailed = new Set(Array.isArray(ids) ? ids : [ids]);
            if (typeof switchTab === 'function') switchTab('cea');
        } catch (_) {}
    };

    // ------------------------------------------------------------ rendering
    const sevSpan = s => '<span class="cell-' + _esc(s || '') + '">' + _esc(s || '—') + '</span>';

    function renderZsaModels() {
        const view = document.getElementById('view-zsa');
        if (!view) return;
        let host = document.getElementById('zsa-models-host');
        if (!host) { host = document.createElement('div'); host.id = 'zsa-models-host'; view.appendChild(host); }
        const zones = _zsa().filter(z => z && z.zoneId);
        if (!zones.length) { host.innerHTML = ''; return; }
        host.innerHTML =
            '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-top:18px;">' +
            '<div style="padding:9px 14px; border-bottom:2px solid var(--color-text-primary);"><b>Zone models — computed from housing, routing, and the MAC model</b></div>' +
            '<p style="font-size:12px; color:var(--color-text-secondary); padding:8px 14px 4px;">The elicited lane above says what you classified; this lane says what the model computes when the zone takes a single event. Disagreement is a named finding (INV-18) — resolve it by reviewing the classification or the model, never by editing this panel.</p>' +
            zones.map(z => {
                const m = zsaZoneModel(z.zoneId);
                if (!m) return '';
                const badge = m.reconcile === 'conflict'
                    ? '<span class="u-mono" style="color:#8E2A2A; font-weight:700;">CONFLICT — model computes ' + _esc(m.computedWorst) + '</span>'
                    : (m.reconcile === 'conservative' ? '<span class="u-mono" style="color:var(--color-text-tertiary);">elicited stricter than computed ✓</span>'
                        : (m.computedWorst ? '<span class="u-mono" style="color:#1D9E75;">agrees ✓</span>' : '<span class="u-mono" style="color:var(--color-text-tertiary);">no modeled consequence</span>'));
                return '<div style="padding:8px 14px; border-top:1px solid var(--color-border-hair); font-size:12px;">' +
                    '<b>' + _esc(m.zoneId) + '</b> ' + _esc(m.desc.slice(0, 50)) + ' · elicited ' + sevSpan(m.elicited) + ' · ' + badge +
                    ' <button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px; margin-left:8px;" onclick="ccaSimulate(\'zone:' + _esc(m.zoneId) + '\')">Simulate →</button>' +
                    '<div style="color:var(--color-text-secondary); margin-top:4px;" class="u-mono">downs: ' + (m.downs.length ? m.downs.map(_esc).join(', ') : '—') +
                    (m.routes.length ? ' · routes: ' + m.routes.map(r => _esc(r.id)).join(', ') : '') +
                    (m.tripped.length ? ' · trips: ' + m.tripped.map(t => _esc(t.fcId) + '[' + _esc(t.severity) + ']').join(', ') : ' · no FC trips') +
                    (m.findings.length ? ' · disposition: ' + m.findings.map(f => _esc(f.state)).join(', ') : '') + '</div>' +
                    (m.ambiguous.length ? '<div style="color:#B7791F; font-size:11px;">⚠ ' + m.ambiguous.map(_esc).join('<br>⚠ ') + '</div>' : '') +
                    '</div>';
            }).join('') + '</div>';
    }

    function renderPraModels() {
        const view = document.getElementById('view-pra');
        if (!view) return;
        let host = document.getElementById('pra-models-host');
        if (!host) { host = document.createElement('div'); host.id = 'pra-models-host'; view.appendChild(host); }
        const pras = _pra().filter(p => p && (p.affectedZones || []).length);
        if (!pras.length) { host.innerHTML = ''; return; }
        host.innerHTML =
            '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-top:18px;">' +
            '<div style="padding:9px 14px; border-bottom:2px solid var(--color-text-primary);"><b>Dynamic threat models — the postulated risk, evaluated against the live aircraft</b></div>' +
            '<p style="font-size:12px; color:var(--color-text-secondary); padding:8px 14px 4px;">Each particular risk expands through its zones — housing, routing, cascade — and reports what actually trips, recomputed from the model on every visit. Catastrophic consequences must be carried by an ACCEPTED zonal disposition; anything else shows red here and in the sweep.</p>' +
            pras.map(p => {
                const m = praDynamicModel(p.praId || p.internalId);
                if (!m) return '';
                const ret = m.tripped.some(t => t.severity === 'Catastrophic')
                    ? (m.retained ? '<span class="u-mono" style="color:#1D9E75; font-weight:700;">retention carried ✓ (accepted disposition)</span>'
                        : '<span class="u-mono" style="color:#8E2A2A; font-weight:700;">RETENTION NOT CARRIED — ' + m.retention.filter(r => r.state !== 'accepted').map(r => _esc(r.fcId) + ':' + _esc(r.state)).join(', ') + '</span>')
                    : '<span class="u-mono" style="color:var(--color-text-tertiary);">no Catastrophic consequence computed</span>';
                return '<div style="padding:8px 14px; border-top:1px solid var(--color-border-hair); font-size:12px;">' +
                    '<b>' + _esc(m.praId) + '</b> ' + _esc(m.threat.slice(0, 56)) + ' · zones ' + m.zones.map(_esc).join(', ') +
                    ' <button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px; margin-left:8px;" onclick=\'ccaSimulate(' + JSON.stringify(m.zones.map(z => 'zone:' + z)) + ')\'>Simulate →</button>' +
                    '<div style="color:var(--color-text-secondary); margin-top:4px;" class="u-mono">downs: ' + (m.downSystems.length ? m.downSystems.map(_esc).join(', ') : '—') +
                    ' · trips: ' + (m.tripped.length ? m.tripped.map(t => _esc(t.fcId) + '[' + _esc(t.severity) + ']').join(', ') : 'none') +
                    ' · MAC ' + m.rules.holding + '/' + m.rules.evaluated + ' holding · cascade ' + m.cascade + '</div>' +
                    '<div style="margin-top:2px;">' + ret + '</div></div>';
            }).join('') + '</div>';
    }

    (function wrap() {
        if (typeof window.switchTab === 'function' && !window.switchTab._ccaModelsWrapped) {
            const orig = window.switchTab;
            const wrapped = function (tabId) {
                const r = orig.apply(this, arguments);
                try {
                    if (tabId === 'zsa') setTimeout(renderZsaModels, 150);
                    if (tabId === 'pra') setTimeout(renderPraModels, 150);
                } catch (_) {}
                return r;
            };
            wrapped._ccaModelsWrapped = true;
            window.switchTab = wrapped;
        }
    })();

    // ------------------------------------------------------------- exports
    window.zsaZoneModel = zsaZoneModel;
    window.praDynamicModel = praDynamicModel;
    window.renderZsaModels = renderZsaModels;
    window.renderPraModels = renderPraModels;
})();
