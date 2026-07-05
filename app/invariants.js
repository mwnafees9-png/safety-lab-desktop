// ============================================================================
// invariants.js — v1.0 — Q8: cross-artifact invariant sweep.
//
// Every module keeps its own lane consistent; nothing asserted the CROSS-lane
// truths — the properties that must hold across FHA ↔ FTA ↔ DALgebra ↔ Items
// ↔ ZSA ↔ requirements ↔ problem reports simultaneously. A project can be
// locally green in every view and still violate "every Catastrophic failure
// condition has a fault tree" or "the item realizing a DAL-A event is itself
// DAL A". This sweep asserts those truths in one deterministic pass.
//
// Eleven invariants, each: id · name · severity (hard / advisory) · checked
// count · named failures (never a bare boolean). Hard failures are golden-
// thread breaks; advisories are pending-work honesty (e.g. DAL reductions
// awaiting CMA substantiation).
//
// Surfaces: a live panel on the Thread Integrity page (runs on open — the
// sweep is cheap), the last result stamped into projectConfig.invariantsLast
// (and thence the evidence package §10i), window.invRun() for the harness.
// Detection only — the sweep never mutates project data.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _sysList() { return (typeof systemsData !== 'undefined' ? systemsData : []) || []; }
    function _pages() { return (typeof ftaPages !== 'undefined' ? ftaPages : []) || []; }
    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}; }
    function _sevRank(s) { return (typeof SEVERITY_RANK !== 'undefined' ? SEVERITY_RANK[s] : 0) || 0; }
    function _dalRank(d) { return (typeof DAL_RANK_MAP !== 'undefined' ? DAL_RANK_MAP[d] : 0) || 0; }
    function _isCatHaz(sev) { return _sevRank(sev) >= 4; }

    // every FHA row with scope labels
    function _allFha() {
        const out = [];
        (typeof acFhaData !== 'undefined' ? acFhaData : []).forEach(f => f && out.push({ f, scope: 'AC', sys: null }));
        _sysList().forEach(s => (s.fha || []).forEach(f => f && out.push({ f, scope: s.name || s.id, sys: s })));
        return out;
    }
    function _walkLeaves(root, cb) {
        (function walk(n) {
            if (!n) return;
            if (n.type === 'basic' || n.type === 'undeveloped') cb(n);
            (n.children || []).forEach(walk);
        })(root);
    }
    function _walkGates(root, cb) {
        (function walk(n) {
            if (!n) return;
            if (n.type === 'gate') cb(n);
            (n.children || []).forEach(walk);
        })(root);
    }
    function _pageLinkedIds(p) {
        const ids = Array.isArray(p.linkedFhaIds) ? p.linkedFhaIds.slice() : [];
        if (p.linkedFhaId != null) ids.push(p.linkedFhaId);
        // ids may carry AC_/SYS_ prefixes in some flows — normalize to bare
        return ids.map(x => String(x).replace(/^(AC_|SYS_)/, ''));
    }
    // AC↔system linkage: a sys FC may be analyzed/covered at AC level via its
    // acTrace, and an AC FC via a sys FC that traces to it. Mirrors the
    // AutoReq linkage-dedup philosophy — coverage follows the link.
    function _acTraceIds(f) {
        const ids = Array.isArray(f.acTraces) ? f.acTraces.slice() : [];
        if (f.acTrace != null) ids.push(f.acTrace);
        return ids.map(String);
    }
    function _linkedFcInternalIds(f, sys) {
        const out = [String(f.internalId)];
        if (sys) {
            _acTraceIds(f).forEach(id => out.push(id));                       // sys → its AC FCs
        } else {
            _sysList().forEach(s => (s.fha || []).forEach(sf => {             // AC → sys FCs tracing to it
                if (sf && _acTraceIds(sf).indexOf(String(f.internalId)) >= 0) out.push(String(sf.internalId));
            }));
        }
        return out;
    }
    function _fcTreeCovered(f) {
        const linked = new Set();
        _pages().forEach(p => { if (p && p.root && !p.verifies) _pageLinkedIds(p).forEach(id => linked.add(String(id))); });
        const sys = _sysList().find(s => (s.fha || []).indexOf(f) >= 0) || null;
        return _linkedFcInternalIds(f, sys).some(id => linked.has(id));
    }

    // ------------------------------------------------------- the invariants
    const INVARIANTS = [
        {
            id: 'INV-01', name: 'Every failure condition is classified', sev: 'hard',
            run: () => {
                const fails = []; let checked = 0;
                _allFha().forEach(({ f, scope }) => {
                    checked++;
                    if (!f.severity) fails.push(scope + ' FC ' + (f.fcId || f.internalId) + ' has no severity classification');
                });
                return { checked, fails };
            }
        },
        {
            id: 'INV-02', name: 'Every Catastrophic failure condition has an allocation fault tree', sev: 'hard',
            run: () => {
                const fails = []; let checked = 0;
                _allFha().forEach(({ f, scope }) => {
                    if (f.severity !== 'Catastrophic') return;
                    checked++;
                    if (!_fcTreeCovered(f))
                        fails.push(scope + ' FC ' + (f.fcId || f.internalId) + ' [Catastrophic] has no linked allocation tree (directly or via AC↔system linkage)');
                });
                return { checked, fails };
            }
        },
        {
            id: 'INV-03', name: 'Verified probability within allocated budget (mirrored trees)', sev: 'hard',
            run: () => {
                const fails = []; let checked = 0;
                if (typeof _findVerificationMirror !== 'function') return { checked, fails };
                _pages().forEach(p => {
                    if (!p || !p.root || p.verifies) return;
                    const mirror = _findVerificationMirror(p);
                    if (!mirror || !mirror.root) return;
                    const budget = parseFloat(p.root.probability) || 0;
                    const actual = parseFloat(mirror.root.probability) || 0;
                    if (!(budget > 0) || !(actual > 0)) return;
                    checked++;
                    if (actual > budget * 1.000001)
                        fails.push('Page "' + p.name + '": verified P=' + actual.toExponential(2) + ' exceeds allocated budget ' + budget.toExponential(2));
                });
                return { checked, fails };
            }
        },
        {
            id: 'INV-04', name: 'Latent-failure credit is backed by a detection parameter', sev: 'hard',
            run: () => {
                const fails = []; let checked = 0;
                _pages().forEach(p => {
                    if (!p || !p.root) return;
                    _walkLeaves(p.root, n => {
                        if (n.repairModel === 'periodic') {
                            checked++;
                            if (!(parseFloat(n.tau) > 0)) fails.push((n.displayId || n.name || '?') + ' on "' + p.name + '": periodic-test model with no τ');
                        } else if (n.repairModel === 'monitored') {
                            checked++;
                            if (!(parseFloat(n.mu) > 0)) fails.push((n.displayId || n.name || '?') + ' on "' + p.name + '": monitored model with no μ');
                        }
                    });
                });
                return { checked, fails };
            }
        },
        {
            id: 'INV-05', name: 'DAL reductions substantiated by CMA', sev: 'advisory',
            run: () => {
                const fails = []; let checked = 0;
                _pages().forEach(p => {
                    if (!p || !p.root || p.verifies) return;
                    _walkGates(p.root, g => {
                        if (!g._independenceReq) return;
                        checked++;
                        if (g._independenceReq.status !== 'substantiated')
                            fails.push('Gate ' + (g.displayId || g.id) + ' on "' + p.name + '": DAL reduction rests on CLAIMED independence — CMA substantiation pending');
                    });
                });
                return { checked, fails };
            }
        },
        {
            id: 'INV-06', name: 'Every Cat/Haz failure condition is covered by a requirement', sev: 'hard',
            run: () => {
                const fails = []; let checked = 0;
                const collect = reqs => {
                    const keys = new Set();
                    (reqs || []).forEach(r => {
                        if (!r || r.deleted) return;
                        if (r.traceId) keys.add(r.traceId);
                        (Array.isArray(r.traceIds) ? r.traceIds : []).forEach(t => keys.add(t));
                    });
                    return keys;
                };
                const acKeys = collect(typeof acReqData !== 'undefined' ? acReqData : []);
                // resolve any FHA row (either level) by internalId for linkage-following
                const byIid = new Map();
                _allFha().forEach(x => byIid.set(String(x.f.internalId), x.f));
                const candsOf = f => [f.fcId, f.subId].concat(Array.isArray(f.subIds) ? f.subIds : []).filter(Boolean);
                _allFha().forEach(({ f, scope, sys }) => {
                    if (!_isCatHaz(f.severity)) return;
                    checked++;
                    const keys = sys ? new Set([...collect(sys.req), ...acKeys]) : acKeys;
                    // coverage follows AC↔system linkage: the linked FC's ids count too
                    let candidates = candsOf(f);
                    _linkedFcInternalIds(f, sys).forEach(id => {
                        const lf = byIid.get(id);
                        if (lf && lf !== f) candidates = candidates.concat(candsOf(lf));
                    });
                    if (!candidates.some(c => keys.has(c)))
                        fails.push(scope + ' FC ' + (f.fcId || f.internalId) + ' [' + f.severity + ']: no requirement traces to it (by FC id, function id, or linked FC)');
                });
                return { checked, fails };
            }
        },
        {
            id: 'INV-07', name: 'Items meet the DAL of the events they realize', sev: 'hard',
            run: () => {
                const fails = []; let checked = 0;
                const items = (typeof itemsData !== 'undefined' ? itemsData : []) || [];
                _pages().forEach(p => {
                    if (!p || !p.root) return;
                    _walkLeaves(p.root, n => {
                        if (!n.allocatedDAL || n.realizedByItemId == null) return;
                        checked++;
                        const item = items.find(i => i && String(i.internalId) === String(n.realizedByItemId));
                        if (!item) { fails.push((n.displayId || '?') + ' on "' + p.name + '": realized-by item not found'); return; }
                        if (item.dal && _dalRank(item.dal) < _dalRank(n.allocatedDAL))
                            fails.push('Item ' + (item.itemId || item.internalId) + ' is DAL ' + item.dal + ' but realizes ' + (n.displayId || '?') + ' allocated ' + n.allocatedDAL + ' on "' + p.name + '"');
                    });
                });
                return { checked, fails };
            }
        },
        {
            id: 'INV-08', name: 'Zone-housed functions resolve to live functions', sev: 'hard',
            run: () => {
                const fails = []; let checked = 0;
                const live = new Set();
                (typeof acFunctionsData !== 'undefined' ? acFunctionsData : []).forEach(f => f && f.subId && live.add(f.subId));
                // system functions carry their id in funcId (subId is the legacy field)
                _sysList().forEach(s => (s.functions || []).forEach(f => { if (f && (f.subId || f.funcId)) live.add(f.subId || f.funcId); }));
                (typeof zsaData !== 'undefined' ? zsaData : []).forEach(z => {
                    (z && Array.isArray(z.housedFunctions) ? z.housedFunctions : []).forEach(sf => {
                        checked++;
                        if (!live.has(sf)) fails.push('Zone ' + z.zoneId + ' houses "' + sf + '" — no live function carries that id');
                    });
                });
                return { checked, fails };
            }
        },
        {
            id: 'INV-09', name: 'Problem-report closures and deferrals are signed', sev: 'hard',
            run: () => {
                const fails = []; let checked = 0;
                (_pc().problemReports || []).forEach(p => {
                    if (!p) return;
                    if (p.state === 'closed') {
                        checked++;
                        const h = (p.history || []).filter(x => x.state === 'closed').pop();
                        if (!h || !h.by) fails.push(p.id + ' is closed with no signed closure entry');
                    } else if (p.state === 'deferred') {
                        checked++;
                        if (!p.deferral) fails.push(p.id + ' is deferred with no signed deferral record');
                    }
                });
                return { checked, fails };
            }
        },
        {
            id: 'INV-10', name: 'FCIM rows reference live functions', sev: 'hard',
            run: () => {
                const fails = []; let checked = 0;
                const acLive = new Set();
                (typeof acFunctionsData !== 'undefined' ? acFunctionsData : []).forEach(f => f && f.subId && acLive.add(f.subId));
                (typeof acFcimData !== 'undefined' ? acFcimData : []).forEach(r => {
                    if (!r || !r.subId) return;
                    checked++;
                    if (!acLive.has(r.subId)) fails.push('AC FCIM row references function "' + r.subId + '" — not found');
                });
                _sysList().forEach(s => {
                    const live = new Set();
                    (s.functions || []).forEach(f => { if (f && (f.subId || f.funcId)) live.add(f.subId || f.funcId); });
                    (s.fcim || []).forEach(r => {
                        if (!r || !r.subId) return;
                        checked++;
                        if (!live.has(r.subId)) fails.push((s.name || s.id) + ' FCIM row references function "' + r.subId + '" — not found');
                    });
                });
                return { checked, fails };
            }
        },
        {
            id: 'INV-11', name: 'Hazardous failure conditions with analysis pending', sev: 'advisory',
            run: () => {
                const fails = []; let checked = 0;
                _allFha().forEach(({ f, scope }) => {
                    if (f.severity !== 'Hazardous') return;
                    checked++;
                    if (!_fcTreeCovered(f))
                        fails.push(scope + ' FC ' + (f.fcId || f.internalId) + ' [Hazardous]: no allocation tree yet (directly or via linkage) — analysis pending');
                });
                return { checked, fails };
            }
        },
        {
            // M6 — MBSA coverage: is the FC's logic represented in the MAC
            // MODEL (not merely in a hand-built tree)? Advisory by design: it
            // measures model-based maturity, not certification compliance —
            // hand-built trees are legitimate analyses. Flip to hard when a
            // program adopts model coverage as policy.
            id: 'INV-12', name: 'Cat/Haz failure conditions represented in the MAC model (MBSA coverage)', sev: 'advisory',
            run: () => {
                const fails = []; let checked = 0;
                const modelSubs = new Set();
                ((_pc().macModels) || []).forEach(r => { if (r && r.subId) modelSubs.add(r.subId); });
                const byIid = new Map();
                _allFha().forEach(x => byIid.set(String(x.f.internalId), x.f));
                const subsOf = f => [f.subId].concat(Array.isArray(f.subIds) ? f.subIds : []).filter(Boolean);
                _allFha().forEach(({ f, scope, sys }) => {
                    if (!_isCatHaz(f.severity)) return;
                    checked++;
                    let subs = subsOf(f);
                    _linkedFcInternalIds(f, sys).forEach(id => {
                        const lf = byIid.get(id);
                        if (lf && lf !== f) subs = subs.concat(subsOf(lf));
                    });
                    if (!subs.some(su => modelSubs.has(su)))
                        fails.push(scope + ' FC ' + (f.fcId || f.internalId) + ' [' + f.severity + ']: no MAC model rule covers its function(s) — analysis is hand-built only');
                });
                return { checked, fails };
            }
        }
    ];

    // ------------------------------------------------------- extension hook
    // M3+ — other modules contribute checks into the SAME sweep, panel, and
    // evidence stream (no parallel panels, no new tabs). Same shape as the
    // built-ins: { id, name, sev: 'hard'|'advisory', run: () => ({checked, fails}) }.
    // Re-registering an id replaces the entry (idempotent module reloads).
    window.invRegister = function (inv) {
        if (!inv || !inv.id || typeof inv.run !== 'function' || (inv.sev !== 'hard' && inv.sev !== 'advisory')) return false;
        const i = INVARIANTS.findIndex(x => x.id === inv.id);
        if (i >= 0) INVARIANTS[i] = inv; else INVARIANTS.push(inv);
        return true;
    };

    // ------------------------------------------------------------ the sweep
    function invRun() {
        const results = INVARIANTS.map(inv => {
            let r;
            try { r = inv.run(); } catch (e) { r = { checked: 0, fails: ['sweep error: ' + e.message] }; }
            return {
                id: inv.id, name: inv.name, sev: inv.sev,
                checked: r.checked, failCount: r.fails.length,
                failures: r.fails.slice(0, 10),
                pass: r.fails.length === 0
            };
        });
        const hardFails = results.filter(r => !r.pass && r.sev === 'hard');
        const advisories = results.filter(r => !r.pass && r.sev === 'advisory');
        const out = {
            at: new Date().toISOString(),
            pass: hardFails.length === 0,
            hardFails: hardFails.length,
            advisories: advisories.length,
            results
        };
        try {
            const pc = _pc();
            pc.invariantsLast = {
                at: out.at, pass: out.pass, hardFails: out.hardFails, advisories: out.advisories,
                failIds: results.filter(r => !r.pass).map(r => r.id + ' (' + r.failCount + ')')
            };
            if (typeof scheduleAutosave === 'function') scheduleAutosave();
        } catch (_) {}
        return out;
    }

    // ------------------------------------------------------------- the panel
    function _injectPanel() {
        const host = document.getElementById('gt-integrity-host');
        if (!host) return;
        let div = document.getElementById('gt-invariants-panel');
        if (!div) {
            div = document.createElement('div');
            div.id = 'gt-invariants-panel';
            host.appendChild(div);
        }
        const r = invRun();
        const rows = r.results.map(x => {
            const color = x.pass ? 'var(--color-text-tertiary)' : (x.sev === 'hard' ? '#8E2A2A' : '#B7791F');
            const badge = x.pass ? 'PASS' : (x.sev === 'hard' ? 'FAIL' : 'PENDING');
            return '<div style="padding:6px 14px; border-top:1px solid var(--color-border-hair); font-size:12px;">' +
                '<span class="u-mono" style="font-weight:700; color:' + color + ';">' + badge + '</span> · ' +
                '<b>' + _esc(x.id) + '</b> ' + _esc(x.name) +
                ' <span style="color:var(--color-text-tertiary);">(' + x.checked + ' checked)</span>' +
                (x.pass ? '' :
                    '<ul style="margin:4px 0 2px 18px; padding:0; color:' + color + ';">' +
                    x.failures.map(f => '<li>' + _esc(f) + '</li>').join('') +
                    (x.failCount > x.failures.length ? '<li>… +' + (x.failCount - x.failures.length) + ' more</li>' : '') +
                    '</ul>') +
                '</div>';
        }).join('');
        div.innerHTML =
            '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-top:18px;">' +
            '<div style="padding:9px 14px; border-bottom:2px solid var(--color-text-primary); display:flex; justify-content:space-between; align-items:center;">' +
            '<b>Cross-artifact invariants</b>' +
            '<span class="u-mono" style="font-size:11px; font-weight:700; color:' + (r.pass ? 'inherit' : '#8E2A2A') + ';">' +
            (r.pass ? 'ALL HOLD ✓' : r.hardFails + ' BROKEN') + (r.advisories ? ' · ' + r.advisories + ' advisory' : '') + '</span></div>' +
            '<p style="font-size:12px; color:var(--color-text-secondary); padding:8px 14px 6px;">Truths that must hold ACROSS artifacts — FHA ↔ trees ↔ DALs ↔ items ↔ zones ↔ requirements ↔ problem reports. Runs live on every visit; the result is stamped into the evidence package. Detection only: the sweep never modifies data.</p>' +
            rows + '</div>';
    }

    (function wrap() {
        if (typeof window.switchTab === 'function' && !window.switchTab._invWrapped) {
            const orig = window.switchTab;
            const wrapped = function (tabId) {
                const r = orig.apply(this, arguments);
                try { if (tabId === 'gt-integrity') setTimeout(_injectPanel, 120); } catch (_) {}
                return r;
            };
            wrapped._invWrapped = true;
            window.switchTab = wrapped;
        }
    })();

    // ------------------------------------------------------------- exports
    window.invRun = invRun;
    window._invList = INVARIANTS;
})();
