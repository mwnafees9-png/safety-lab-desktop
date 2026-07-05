// ============================================================================
// fault_sim.js — v1.0 — M4: fault injection / what-if on the CEA page (MBSA-2).
//
// "Click two failures — or a whole zone (M7) — and watch the aircraft
// respond." A read-only overlay on the EXISTING Cascading Effects page (no
// new tab): toggle systems and resources failed, and three deterministic
// engines report the consequences —
//
//   1. CASCADE closure — the CEA graph's own BFS (provides/feeds/interface
//      edges): everything the injected failures reach, with paths.
//   2. MAC clause arithmetic — every L0 rule re-evaluated against the downed
//      systems (available members < min → breach), naming the arithmetic:
//      "SF-04: min 1 of [PRL, PRR] — 0 available". Breached rules trip the
//      failure conditions on their functions, severity attached.
//   3. Compiled-BDD corroboration — the same injection evaluated on the
//      MF&MS pages' BDDs (macsys:* variables set true). The two lanes are
//      equivalence-proven at compile time, so they must agree; any
//      disagreement renders as a named finding, never silently.
//
// Injection state is SESSION-ONLY (window state, never persisted, never
// autosaved): this is a lens, not an artifact. Clearing the injection or
// leaving the page restores the ordinary CEA view untouched.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}; }
    function _sevRank(s) { return (typeof SEVERITY_RANK !== 'undefined' ? SEVERITY_RANK[s] : 0) || 0; }
    function _sysList() { return (typeof systemsData !== 'undefined' ? systemsData : []) || []; }

    // --------------------------------------------------- session-only state
    window._fsFailed = window._fsFailed || new Set();

    // ------------------------------------------------- M7: the spatial join
    // A zone is a propagation node: a single zonal event reaches every
    // function HOUSED in the zone (ZSA) and every function ROUTED through it
    // (routing paths), resolved to the owning systems. Conservative at L0 —
    // zone loss downs the owning system — documented and consistent with the
    // MAC abstraction (rules are over systems).
    function fsZoneDown(zoneId) {
        const systems = new Set();
        const subIds = new Set();
        const via = [];
        const ambiguous = [];
        const ownersOf = subId => _sysList().filter(s => (s.functions || []).some(f =>
            (Array.isArray(f.traceIds) ? f.traceIds : (f.traceId ? [f.traceId] : [])).indexOf(subId) >= 0));
        // A function reference downs its owner only when ownership is UNIQUE.
        // Shared functions (e.g. deceleration, owned by brakes + both
        // reversers + spoilers) are zone-ambiguous at L0 — the zone holds one
        // system's equipment, not every contributor — so they are flagged for
        // refinement (route the ITEMS) instead of over-propagated.
        const addFn = (subId, how) => {
            subIds.add(subId);
            const owners = ownersOf(subId);
            if (owners.length === 1) { systems.add(owners[0].id); via.push(subId + ' ' + how + ' → ' + (owners[0].name || owners[0].id)); }
            else if (owners.length > 1) ambiguous.push(subId + ' ' + how + ' has ' + owners.length + ' owning systems — housing ambiguous at L0; route the items to resolve');
        };
        const z = ((typeof zsaData !== 'undefined' ? zsaData : []) || []).find(x => x && x.zoneId === zoneId);
        if (z && Array.isArray(z.housedFunctions)) z.housedFunctions.forEach(sf => addFn(sf, 'housed in ' + zoneId));
        const items = (typeof itemsData !== 'undefined' ? itemsData : []) || [];
        ((typeof routingData !== 'undefined' ? routingData : []) || []).forEach(rt => {
            if (!rt || !Array.isArray(rt.routesThroughZones) || rt.routesThroughZones.indexOf(zoneId) < 0) return;
            // routed ITEMS resolve precisely via owningSystemId
            (rt.carriesItems || []).forEach(itemId => {
                const it = items.find(i => i && i.itemId === itemId);
                if (it && it.owningSystemId) { systems.add(it.owningSystemId); via.push(itemId + ' routed through ' + zoneId + ' (' + (rt.routingId || '') + ')'); }
            });
            (rt.carriesFunctions || []).forEach(sf => addFn(sf, 'routed through ' + zoneId + ' (' + (rt.routingId || rt.name || '') + ')'));
        });
        return { systems, subIds, via, ambiguous };
    }
    function fsZones() {
        const ids = new Set();
        ((typeof zsaData !== 'undefined' ? zsaData : []) || []).forEach(z => { if (z && z.zoneId) ids.add(z.zoneId); });
        ((typeof routingData !== 'undefined' ? routingData : []) || []).forEach(rt =>
            (rt && rt.routesThroughZones || []).forEach(zid => ids.add(zid)));
        return Array.from(ids).sort();
    }

    // ------------------------------------------------------------ evaluate
    function fsEvaluate(failedIds) {
        const injected = new Set(failedIds || window._fsFailed);
        // expand zone:* injections into their downed systems
        const failed = new Set();
        const zoneNotes = [];
        injected.forEach(id => {
            if (String(id).indexOf('zone:') === 0) {
                const zd = fsZoneDown(String(id).slice(5));
                zd.systems.forEach(s => failed.add(s));
                zoneNotes.push({ zone: String(id).slice(5), systems: Array.from(zd.systems), via: zd.via, ambiguous: zd.ambiguous });
            } else failed.add(id);
        });
        const g = (typeof ceaGraph === 'function') ? ceaGraph() : { nodes: new Map(), edges: [] };

        // 1. cascade closure — union of BFS from every injected failure.
        // SEMANTICS: availability propagates through provides/feeds edges only
        // (no power → down). Interface edges are INFLUENCE surveillance — a
        // corrupted signal is a common-cause question the interdependence
        // table and CMA own, not a loss of the neighboring system — so
        // interface-reached nodes are reported as "influenced" and are NOT
        // counted down for the model evaluation.
        const availReach = new Set();
        (function availBfs() {
            const seen = new Set(failed);
            let frontier = Array.from(failed);
            let guard = 0;
            while (frontier.length && guard++ < 10) {
                const next = [];
                frontier.forEach(cur => {
                    g.edges.filter(e => e.from === cur && e.kind !== 'interface').forEach(e => {
                        if (seen.has(e.to)) return;
                        seen.add(e.to);
                        availReach.add(e.to);
                        next.push(e.to);
                    });
                });
                frontier = next;
            }
        })();
        const closure = new Map();   // id → {id,name,kind,hops,path,from,down}
        failed.forEach(fid => {
            if (typeof ceaCascade !== 'function') return;
            ceaCascade(fid, g).forEach(c => {
                if (failed.has(c.id)) return;
                const prev = closure.get(c.id);
                if (!prev || c.hops < prev.hops)
                    closure.set(c.id, Object.assign({ from: (g.nodes.get(fid) || {}).name || fid, down: availReach.has(c.id) }, c));
            });
        });
        // systems considered DOWN for model evaluation: injected + availability closure
        const downSystems = new Set();
        failed.forEach(id => { const n = g.nodes.get(id); if (n && n.kind === 'system') downSystems.add(id); });
        availReach.forEach(id => { const n = g.nodes.get(id); if (n && n.kind === 'system') downSystems.add(id); });

        // 2. MAC clause arithmetic
        const rules = (_pc().macModels || []).filter(Boolean);
        const fhaAll = [];
        (typeof acFhaData !== 'undefined' ? acFhaData : []).forEach(f => f && fhaAll.push(f));
        const sysName = id => { const s = _sysList().find(x => x.id === id); return s ? (s.name || s.id) : id; };
        const breaches = [];
        rules.forEach(rule => {
            (rule.clauses || []).forEach(cl => {
                const members = cl.of || [];
                const avail = members.filter(m => !downSystems.has(m));
                if (avail.length >= (cl.min || 1)) return;
                const fcs = fhaAll
                    .filter(f => f.subId === rule.subId || (Array.isArray(f.subIds) && f.subIds.indexOf(rule.subId) >= 0))
                    .map(f => ({ fcId: f.fcId || '', severity: f.severity || '' }));
                breaches.push({
                    ruleId: rule.id, subId: rule.subId, phase: rule.phase || '',
                    detail: 'min ' + (cl.min || 1) + ' of [' + members.map(sysName).join(', ') + '] — ' + avail.length + ' available',
                    fcs
                });
            });
        });

        // 3. compiled-BDD corroboration (macsys:* variables)
        const bddTrips = [];
        const disagreements = [];
        const store = _pc().macCompiled || {};
        const build = (typeof buildBDDFromFT === 'function') ? buildBDDFromFT
            : (typeof SLFTAEngine !== 'undefined' && SLFTAEngine.buildBDDFromFT) || null;
        if (build) {
            rules.forEach(rule => {
                const rec = store[rule.id];
                if (!rec || !rec.pageId) return;
                const page = ((typeof ftaPages !== 'undefined' ? ftaPages : []) || []).find(p => p && p.id === rec.pageId);
                if (!page || !page.root) return;
                let built;
                try { built = build(page.root); } catch (_) { return; }
                const { bdd, varOrder } = built;
                if (!bdd) return;
                // evaluate under the injection: macsys:<sysId> true iff system down
                let n = bdd;
                while (!n.isTerminal) {
                    const node = varOrder[n.varIdx];
                    const lid = node && (node.logicalId != null ? node.logicalId : node.id);
                    const down = typeof lid === 'string' && lid.indexOf('macsys:') === 0 && downSystems.has(lid.slice(7));
                    n = down ? n.high : n.low;
                }
                const tripped = n.value === true;
                const clauseSays = breaches.some(b => b.ruleId === rule.id);
                bddTrips.push({ ruleId: rule.id, subId: rule.subId, page: page.name, tripped, agrees: tripped === clauseSays });
                if (tripped !== clauseSays)
                    disagreements.push(rule.id + ' (' + rule.subId + '): clause arithmetic says ' + (clauseSays ? 'BREACH' : 'holds') + ', compiled BDD says ' + (tripped ? 'TRIP' : 'holds') + ' — investigate the compile');
            });
        }

        // consolidated tripped-FC list (worst severity first, deduped)
        const fcMap = new Map();
        breaches.forEach(b => b.fcs.forEach(fc => {
            const prev = fcMap.get(fc.fcId);
            if (!prev || _sevRank(fc.severity) > _sevRank(prev.severity)) fcMap.set(fc.fcId, fc);
        }));
        const trippedFcs = Array.from(fcMap.values()).sort((a, b) => _sevRank(b.severity) - _sevRank(a.severity));

        return {
            failed: Array.from(failed),
            injected: Array.from(injected),
            zoneNotes,
            closure: Array.from(closure.values()).sort((a, b) => a.hops - b.hops),
            downSystems: Array.from(downSystems),
            breaches, trippedFcs, bddTrips, disagreements,
            rulesEvaluated: rules.length,
            rulesHolding: rules.length - new Set(breaches.map(b => b.ruleId)).size
        };
    }

    // ---------------------------------------- M7: zonal fail-safe invariants
    // The computable form of the ZSA separation claim: a SINGLE zonal event
    // must not trip a Catastrophic FC (hard, with signed dispositions for
    // accepted residual risks — e.g. a PRA-carried threat), and Hazardous
    // trips are listed for review (advisory). Registered into the same
    // invariants sweep as everything else.
    function _zonalStore() {
        const pc = _pc();
        if (!pc.zonalAccepted) pc.zonalAccepted = {};
        return pc.zonalAccepted;
    }
    function fsZonalFindings() {
        const out = [];
        fsZones().forEach(zid => {
            const zd = fsZoneDown(zid);
            if (!zd.systems.size) return;
            const r = fsEvaluate(['zone:' + zid]);
            r.trippedFcs.forEach(fc => {
                if (_sevRank(fc.severity) < 4) return;
                const key = 'zone:' + zid + '|' + fc.fcId;
                const fp = Array.from(zd.systems).sort().join(',') + '|' + r.breaches.map(b => b.ruleId).sort().join(',');
                const rec = _zonalStore()[key];
                out.push({
                    key, zone: zid, fcId: fc.fcId, severity: fc.severity,
                    detail: r.breaches.map(b => b.subId + ': ' + b.detail).join(' · '),
                    via: zd.via.join(' · '),
                    fingerprint: fp,
                    state: rec ? (rec.fingerprint === fp ? 'accepted' : 'reopened') : 'open',
                    rec
                });
            });
        });
        return out;
    }
    function _fsZonalAccept(key, by, basis) {
        const row = fsZonalFindings().find(x => x.key === key);
        if (!row || !by) return false;
        _zonalStore()[key] = { by, at: new Date().toISOString(), basis: basis || '', fingerprint: row.fingerprint };
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        return true;
    }
    (function registerZonal() {
        function reg() {
            if (typeof window.invRegister !== 'function') return false;
            window.invRegister({
                id: 'MC-04', name: 'No unaccepted single zonal event trips a Catastrophic FC (spatial model)', sev: 'hard',
                run: () => {
                    const rows = fsZonalFindings().filter(x => x.severity === 'Catastrophic');
                    return { checked: rows.length, fails: rows.filter(x => x.state !== 'accepted')
                        .map(x => 'Zone ' + x.zone + ' → ' + x.fcId + ' [Catastrophic] (' + x.detail + ')' +
                            (x.state === 'reopened' ? ' — acceptance REOPENED (spatial content changed since ' + x.rec.by + ' signed)' : ' — no signed disposition')) };
                }
            });
            window.invRegister({
                id: 'MC-05', name: 'Single zonal event reaching a Hazardous FC (review list)', sev: 'advisory',
                run: () => {
                    const rows = fsZonalFindings().filter(x => x.severity === 'Hazardous');
                    return { checked: rows.length, fails: rows.filter(x => x.state !== 'accepted')
                        .map(x => 'Zone ' + x.zone + ' → ' + x.fcId + ' [Hazardous] (' + x.detail + ')') };
                }
            });
            return true;
        }
        if (!reg()) { let tries = 20; const t = setInterval(() => { if (reg() || --tries <= 0) clearInterval(t); }, 300); }
    })();

    // -------------------------------------------------- zonal accept modal
    function _ensureZonalModal() {
        let modal = document.getElementById('fs-zonal-modal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'fs-zonal-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML =
            '<div class="modal-content" style="max-width: 600px;">' +
            '<div class="modal-header"><h2>Accept Zonal Residual Risk</h2>' +
            '<button class="btn-red" style="margin:0;" onclick="fsCloseZonalModal()">Cancel</button></div>' +
            '<div class="modal-body" style="padding: 18px 22px;">' +
            '<div id="fs-zonal-pair" style="font-size:13px; border:1px solid var(--color-border-strong); background:var(--color-surface-2); padding:10px 14px; margin-bottom:14px;"></div>' +
            '<p style="font-size:12.5px; color:var(--color-text-secondary); margin:0;">Accepting records that this zonal single-event path is understood and carried elsewhere — typically a PRA retention requirement with installation protection. The acceptance reopens if the zone’s housed or routed content changes.</p>' +
            '<label style="display:block; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; margin:12px 0 4px;">Signature (required)</label>' +
            '<input id="fs-zonal-by" type="text" style="width:100%; box-sizing:border-box; font-size:13px; padding:7px 10px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary);" placeholder="Your name">' +
            '<label style="display:block; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; margin:12px 0 4px;">Engineering basis (required)</label>' +
            '<textarea id="fs-zonal-basis" rows="3" style="width:100%; box-sizing:border-box; font-size:13px; padding:7px 10px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary); resize:vertical;" placeholder="PRA reference · installation protection · separation provision …"></textarea>' +
            '<div style="display:flex; justify-content:flex-end; margin-top:16px;">' +
            '<button class="ckpt-m-btn" style="font-size:13px; padding:6px 18px;" onclick="_fsZonalModalSubmit()">Accept</button></div>' +
            '<p id="fs-zonal-err" style="color:#8E2A2A; font-size:12px; font-weight:600; margin:8px 0 0; display:none;"></p>' +
            '</div></div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) window.fsCloseZonalModal(); });
        return modal;
    }
    window.fsZonalAcceptUi = function (key) {
        const r = fsZonalFindings().find(x => x.key === key);
        if (!r) return;
        const modal = _ensureZonalModal();
        modal._fsKey = key;
        document.getElementById('fs-zonal-pair').innerHTML =
            '<b>Zone ' + _esc(r.zone) + ' → ' + _esc(r.fcId) + ' [' + _esc(r.severity) + ']</b>' +
            '<div style="color:var(--color-text-secondary); margin-top:4px;">' + _esc(r.detail) + '<br>' + _esc(r.via) + '</div>';
        document.getElementById('fs-zonal-err').style.display = 'none';
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);
        setTimeout(() => { const el = document.getElementById('fs-zonal-by'); if (el) el.focus(); }, 260);
    };
    window.fsCloseZonalModal = function () {
        const modal = document.getElementById('fs-zonal-modal');
        if (!modal) return;
        modal.classList.remove('show');
        setTimeout(() => { modal.style.display = 'none'; }, 250);
    };
    window._fsZonalModalSubmit = function () {
        const modal = document.getElementById('fs-zonal-modal');
        if (!modal) return;
        const by = (document.getElementById('fs-zonal-by').value || '').trim();
        const basis = (document.getElementById('fs-zonal-basis').value || '').trim();
        const err = document.getElementById('fs-zonal-err');
        if (!by) { err.textContent = 'A signature is required.'; err.style.display = 'block'; return; }
        if (!basis) { err.textContent = 'An engineering basis is required.'; err.style.display = 'block'; return; }
        if (_fsZonalAccept(modal._fsKey, by, basis)) {
            window.fsCloseZonalModal();
            try { if (typeof showToast === 'function') showToast('Zonal residual risk accepted with basis. MC-04 updates on the next sweep.', 'success', 3600); } catch (_) {}
            renderFaultSim();
        }
    };

    // ------------------------------------------------------------- actions
    window.fsToggle = function (id) {
        if (window._fsFailed.has(id)) window._fsFailed.delete(id);
        else window._fsFailed.add(id);
        renderFaultSim();
    };
    window.fsClear = function () {
        window._fsFailed.clear();
        renderFaultSim();
    };

    // ------------------------------------------------------------ the panel
    function renderFaultSim() {
        const ceaHost = document.getElementById('cea-host');
        if (!ceaHost || !ceaHost.parentNode) return;
        let host = document.getElementById('fault-sim-host');
        if (!host) {
            host = document.createElement('div');
            host.id = 'fault-sim-host';
            ceaHost.parentNode.insertBefore(host, ceaHost.nextSibling);
        }
        const g = (typeof ceaGraph === 'function') ? ceaGraph() : { nodes: new Map() };
        const failed = window._fsFailed;
        const chip = n => {
            const isFailed = failed.has(n.id);
            return '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px; margin:2px;' +
                (isFailed ? ' background:#8E2A2A; color:#fff; border-color:#8E2A2A;' : '') +
                '" onclick="fsToggle(\'' + _esc(n.id) + '\')">' + (isFailed ? '✗ ' : '') + _esc((n.name || n.id).slice(0, 30)) + '</button>';
        };
        const systems = [...g.nodes.values()].filter(n => n.kind === 'system');
        const resources = [...g.nodes.values()].filter(n => n.kind === 'resource');

        const zoneChip = zid => {
            const id = 'zone:' + zid;
            const isFailed = failed.has(id);
            return '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px; margin:2px;' +
                (isFailed ? ' background:#8E2A2A; color:#fff; border-color:#8E2A2A;' : '') +
                '" onclick="fsToggle(\'' + _esc(id) + '\')">' + (isFailed ? '✗ ' : '') + _esc(zid) + '</button>';
        };
        let body =
            '<div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; margin:8px 0 2px;">Systems</div><div>' + systems.map(chip).join('') + '</div>' +
            '<div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; margin:8px 0 2px;">Resources</div><div>' + resources.map(chip).join('') + '</div>' +
            '<div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; margin:8px 0 2px;">Zones (single zonal event — housed + routed content)</div><div>' + fsZones().map(zoneChip).join('') + '</div>';

        if (failed.size) {
            const r = fsEvaluate();
            const sevColor = s => s === 'Catastrophic' ? '#8E2A2A' : (s === 'Hazardous' ? '#B7791F' : 'var(--color-text-secondary)');
            body += '<div style="border-top:1px solid var(--color-border-strong); margin-top:12px; padding-top:10px;">';
            // zone expansions
            if (r.zoneNotes.length) {
                body += r.zoneNotes.map(z =>
                    '<div style="font-size:11.5px; color:var(--color-text-secondary); padding:2px 0;" class="u-mono">Zone ' + _esc(z.zone) + ' downs: ' +
                    (z.systems.length ? z.systems.map(_esc).join(', ') : '—') + ' <span style="color:var(--color-text-tertiary);">(' + _esc(z.via.join(' · ')) + ')</span>' +
                    (z.ambiguous && z.ambiguous.length ? '<div style="color:#B7791F;">⚠ ' + z.ambiguous.map(_esc).join('<br>⚠ ') + '</div>' : '') + '</div>').join('');
            }
            // headline: tripped FCs
            body += '<div style="font-size:13px; margin-bottom:6px;"><b>' +
                (r.trippedFcs.length
                    ? r.trippedFcs.length + ' failure condition(s) tripped: ' + r.trippedFcs.map(fc =>
                        '<span class="u-mono" style="font-weight:700; color:' + sevColor(fc.severity) + ';">' + _esc(fc.fcId) + ' [' + _esc(fc.severity) + ']</span>').join(' · ')
                    : 'No modeled failure condition tripped') + '</b>' +
                ' <span style="color:var(--color-text-tertiary); font-size:11px;" class="u-mono">(' + r.rulesHolding + '/' + r.rulesEvaluated + ' MAC rules holding · ' + r.downSystems.length + ' system(s) down)</span></div>';
            // breach arithmetic
            if (r.breaches.length) {
                body += r.breaches.map(b =>
                    '<div style="font-size:12px; padding:3px 0;" class="u-mono"><span style="color:#8E2A2A; font-weight:700;">BREACH</span> ' +
                    _esc(b.subId) + (b.phase ? ' <span style="color:var(--color-text-tertiary);">(' + _esc(b.phase) + ')</span>' : '') + ': ' + _esc(b.detail) + '</div>').join('');
            }
            // two-engine agreement
            if (r.bddTrips.length) {
                body += '<div style="font-size:11px; color:' + (r.disagreements.length ? '#8E2A2A' : 'var(--color-text-tertiary)') + '; margin-top:6px;" class="u-mono">' +
                    (r.disagreements.length
                        ? 'ENGINE DISAGREEMENT: ' + r.disagreements.map(_esc).join(' · ')
                        : 'Corroborated on ' + r.bddTrips.length + ' compiled MF&MS BDD(s) — clause arithmetic and compiled logic agree ✓') + '</div>';
            }
            // cascade closure
            if (r.closure.length) {
                body += '<div style="margin-top:10px;"><b style="font-size:12px;">Cascade closure (' + r.closure.length + ' reached)</b>' +
                    '<table class="data-table" style="width:100%; font-size:11.5px; margin-top:4px;"><thead><tr><th>Hops</th><th>Reached</th><th>Via</th></tr></thead><tbody>' +
                    r.closure.map(c => '<tr><td class="u-mono">' + c.hops + '</td><td><b>' + _esc(c.name) + '</b> <span style="font-size:10px; color:var(--color-text-tertiary);">' + c.kind + '</span> ' +
                        (c.down ? '<span class="u-mono" style="font-size:10px; color:#8E2A2A; font-weight:700;">DOWN</span>' : '<span class="u-mono" style="font-size:10px; color:#B7791F;">influenced (interface) — review, not counted down</span>') + '</td>' +
                        '<td class="u-mono" style="font-size:10px;">' + _esc(c.path) + '</td></tr>').join('') + '</tbody></table></div>';
            }
            body += '</div>';
        }

        // M7: standing zonal-disposition block (independent of the injection)
        const zf = fsZonalFindings();
        let zonal = '';
        if (zf.length) {
            const openN = zf.filter(x => x.state !== 'accepted').length;
            zonal = '<div style="border-top:1px solid var(--color-border-strong); margin-top:12px; padding-top:10px;">' +
                '<b style="font-size:12.5px;">Zonal single-event findings</b> <span class="u-mono" style="font-size:11px;' + (openN ? ' color:#8E2A2A;' : ' color:var(--color-text-tertiary);') + '">' + (zf.length - openN) + '/' + zf.length + ' dispositioned</span>' +
                zf.map(x => {
                    const color = x.state === 'accepted' ? 'var(--color-text-tertiary)' : (x.severity === 'Catastrophic' ? '#8E2A2A' : '#B7791F');
                    return '<div style="font-size:12px; padding:4px 0;">' +
                        '<span class="u-mono" style="font-weight:700; color:' + color + ';">' + (x.state === 'accepted' ? 'ACCEPTED' : x.state.toUpperCase()) + '</span> · ' +
                        'Zone <b>' + _esc(x.zone) + '</b> → ' + _esc(x.fcId) + ' [' + _esc(x.severity) + '] <span style="color:var(--color-text-tertiary);" class="u-mono">' + _esc(x.detail) + '</span>' +
                        (x.state === 'accepted'
                            ? '<div style="color:var(--color-text-tertiary); font-size:11px;">Accepted by ' + _esc(x.rec.by) + ' on ' + _esc(String(x.rec.at).slice(0, 10)) + (x.rec.basis ? ' — ' + _esc(x.rec.basis) : '') + '</div>'
                            : ' <button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px; margin-left:6px;" onclick="fsZonalAcceptUi(\'' + _esc(x.key) + '\')">Accept with basis…</button>') +
                        '</div>';
                }).join('') + '</div>';
        }

        host.innerHTML =
            '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); padding:12px 14px; margin-top:16px;">' +
            '<div style="display:flex; justify-content:space-between; align-items:center;"><b>Fault injection — what-if</b>' +
            '<span>' + (failed.size ? '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 12px;" onclick="fsClear()">Clear injection</button>' : '<span style="font-size:11px; color:var(--color-text-tertiary);" class="u-mono">read-only lens · nothing is stored</span>') + '</span></div>' +
            '<p style="font-size:12px; color:var(--color-text-secondary); margin:6px 0 0;">Toggle systems, resources, or whole zones failed. Three deterministic engines respond: the dependency cascade (CEA graph), the MAC clause arithmetic (min-of availability per rule), and the compiled MF&MS BDDs — the last two cross-checked against each other on every evaluation. Zonal single-event findings feed MC-04/MC-05 in the invariants sweep.</p>' +
            body + zonal + '</div>';
    }

    // ------------------------------------------------- navigation hook
    // The CEA module's nav wrapper calls its INTERNAL render — hook switchTab
    // (after it) and render our sibling panel; #cea-host rewrites never touch us.
    (function wrap() {
        if (typeof window.switchTab === 'function' && !window.switchTab._fsWrapped) {
            const orig = window.switchTab;
            const wrapped = function (tabId) {
                const r = orig.apply(this, arguments);
                try { if (tabId === 'cea') setTimeout(renderFaultSim, 130); } catch (_) {}
                return r;
            };
            wrapped._fsWrapped = true;
            window.switchTab = wrapped;
        }
    })();

    // ------------------------------------------------------------- exports
    window.fsEvaluate = fsEvaluate;
    window.fsZoneDown = fsZoneDown;
    window.fsZones = fsZones;
    window.fsZonalFindings = fsZonalFindings;
    window._fsZonalAccept = _fsZonalAccept;
    window.renderFaultSim = renderFaultSim;
})();
