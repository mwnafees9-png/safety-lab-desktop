// mod_impact.js — v1.6 — Phase P6: Modification Impact Wizard (inline picker + P6.3 wiring: journal acts, REG §5c, carried PRs, INV-28).
// BORN MODULAR: new file, zero monolith edits; store under projectConfig.mods.
//
// The question a modification asks BEFORE it is made: what does this change
// touch, which analyses must be revisited, and which hand-offs will reopen?
// The answer here is a DETERMINISTIC CLOSURE over the live model graph —
// declare the scope (systems / functions / LRUs), and the wizard walks:
//
//   systems → their functions → traced aircraft sub-functions → failure
//   conditions (including interdependence-derived contributions) → linked
//   trees with TRANSFER closure → requirements traced to those FCs →
//   MAC rules / CoFFE verdicts / CCA rows / zones → independence principles
//   whose members live in the affected trees → maintenance tasks, MMEL items
//   and MSG-3 MSIs hanging off the affected events → the completion gates
//   whose fingerprinted domains intersect the change.
//
// Every impacted artifact carries its WHY (the trace edge that pulled it in).
// The assessment is a signed act; the mod register tracks assessed →
// implemented → re-verified, and re-verification CHECKS the prediction:
// which gates actually reopened, which were re-handed-off. Impact analysis
// that grades its own homework.

(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    function _toast(m, k, t) { try { if (typeof showToast === 'function') showToast(m, k || 'info', t || 3000); } catch (_) {} }
    async function _ask(msg, dflt) {
        try { if (typeof slPrompt === 'function') return await slPrompt(msg, dflt || ''); } catch (_) {}
        return window.prompt(msg, dflt || '');
    }
    function _store() {
        if (!Array.isArray(projectConfig.mods)) projectConfig.mods = [];
        return projectConfig.mods;
    }
    function _save() { try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {} }

    // ------------------------------------------------------------- closure
    // scope: { systems: [sysId], subIds: [SF-xx], itemIds: [LRU-xx] }
    function modImpact(scope) {
        const S = { systems: scope.systems || [], subIds: (scope.subIds || []).slice(), itemIds: scope.itemIds || [] };
        const why = [];
        const add = (bucket, key, reason) => {
            if (!bucket.has(key)) { bucket.set(key, reason); why.push({ artifact: key, reason }); }
        };

        // 1. functions: selected systems' functions pull in their traced sub-functions
        const subIds = new Set(S.subIds);
        (systemsData || []).forEach(s => {
            if (!S.systems.includes(s.id)) return;
            (s.functions || []).forEach(f => (Array.isArray(f.traceIds) ? f.traceIds : (f.traceId ? [f.traceId] : []))
                .forEach(t => subIds.add(t)));
        });

        // 2. failure conditions: by sub-function, by system ownership, and by
        //    interdependence contribution (a system change touches every FC it
        //    contributes to — that is what the B1 table is FOR)
        const fcs = new Map();   // internalId -> reason
        (acFhaData || []).forEach(f => {
            if (f.subId && subIds.has(f.subId)) add(fcs, String(f.internalId), f.fcId + ' — sub-function ' + f.subId + ' in scope');
        });
        (systemsData || []).forEach(s => {
            (s.fha || []).forEach(f => {
                if (S.systems.includes(s.id)) add(fcs, String(f.internalId), f.fcId + ' — SFHA row of ' + s.name);
                if (f.acTrace) {
                    const ac = (acFhaData || []).find(x => String(x.internalId) === String(f.acTrace));
                    if (ac && fcs.has(String(f.internalId)) && !fcs.has(String(ac.internalId)))
                        add(fcs, String(ac.internalId), ac.fcId + ' — traced from impacted SFHA row ' + f.fcId);
                }
            });
        });
        try {
            if (typeof idpContributors === 'function') {
                (acFhaData || []).forEach(f => {
                    if (fcs.has(String(f.internalId))) return;
                    const contrib = idpContributors(f);
                    const hit = S.systems.find(id => contrib.includes(id));
                    if (hit) add(fcs, String(f.internalId), f.fcId + ' — ' + hit + ' contributes per the interdependence table');
                });
            }
        } catch (_) {}

        // 3. trees: linked to impacted FCs (transfer closure via the thread map),
        //    owned by impacted systems, or compiled from impacted MAC rules
        const pages = new Map();
        const pageFcMap = (typeof window._ramPageFcMap === 'function') ? window._ramPageFcMap() : new Map();
        (ftaPages || []).forEach(p => {
            if (!p.root) return;
            if (p.systemId && S.systems.includes(p.systemId)) { add(pages, String(p.id), (p.name || p.id) + ' — tree of an in-scope system'); return; }
            const linked = pageFcMap.get(String(p.id)) || new Set();
            for (const iid of linked) if (fcs.has(String(iid))) { add(pages, String(p.id), (p.name || p.id) + ' — carries an impacted failure condition'); return; }
        });
        const macRules = new Map();
        ((projectConfig.macModels) || []).forEach(r => {
            const touches = subIds.has(r.subId) || (r.clauses || []).some(c => (c.of || []).some(id => S.systems.includes(id)));
            if (!touches) return;
            add(macRules, r.id, 'MAC floor on ' + r.subId + ' includes an in-scope system');
            const rec = (projectConfig.macCompiled || {})[r.id];
            if (rec && rec.pageId) add(pages, String(rec.pageId), 'compiled MF&MS tree of impacted MAC rule ' + r.id);
        });

        // 4. requirements traced to impacted FCs/sub-functions or owned by systems
        const reqs = new Map();
        const fcIds = new Set([...fcs.keys()].map(k => {
            const f = (acFhaData || []).find(x => String(x.internalId) === k) ||
                (systemsData || []).flatMap(s => s.fha || []).find(x => String(x.internalId) === k);
            return f ? f.fcId : null;
        }).filter(Boolean));
        const reqTouch = r => {
            const traces = Array.isArray(r.traceIds) ? r.traceIds : (r.traceId ? [r.traceId] : []);
            return traces.some(t => fcIds.has(t) || subIds.has(t));
        };
        (acReqData || []).forEach(r => { if (reqTouch(r)) add(reqs, r.id || ('REQ-' + r.internalId), 'traced to an impacted FC/function'); });
        (systemsData || []).forEach(s => (s.req || []).forEach(r => {
            if (S.systems.includes(s.id)) add(reqs, r.id || ('REQ-' + r.internalId), 'requirement of in-scope ' + s.name);
            else if (reqTouch(r)) add(reqs, r.id || ('REQ-' + r.internalId), 'traced to an impacted FC/function');
        }));

        // 5. CCA rows and zones
        const cca = new Map();
        (cmaData || []).forEach(c => {
            if (c.owningSystemId && S.systems.includes(c.owningSystemId)) add(cca, c.cmaId, 'CMA on an in-scope system');
            else if ((c.linkedGateIds || []).some(g => pages.has(String(String(g).split(':')[0])))) add(cca, c.cmaId, 'CMA gate lives on an impacted tree');
        });
        (zsaData || []).forEach(z => {
            if ((z.housedFunctions || []).some(sf => subIds.has(sf))) add(cca, z.zoneId, 'zone houses an in-scope function');
        });
        (praData || []).forEach(p => {
            // prefer the bound id link (Thread Integrity page); text is the fallback
            const bound = (typeof window.gtLink === 'function') ? window.gtLink('pra:' + p.internalId) : null;
            if (bound && (bound.systemIds || []).some(id => S.systems.includes(id))) {
                add(cca, p.praId, 'particular risk strikes an in-scope system (bound link)'); return;
            }
            const names = S.systems.map(id => ((systemsData || []).find(s => s.id === id) || {}).name).filter(Boolean);
            if (names.some(n => String(p.systems || '').includes(n))) add(cca, p.praId, 'particular risk strikes an in-scope system (name match — bind on Thread Integrity)');
        });

        // 6. CoFFE verdicts on impacted FCs
        let coffe = 0;
        Object.keys((projectConfig.coffe || {}).verdicts || {}).forEach(k => {
            if (fcs.has(k.split('§')[0])) coffe++;
        });

        // 7. independence principles whose members live on impacted trees
        const principles = [];
        try {
            const lids = new Set();
            (ftaPages || []).forEach(p => {
                if (!pages.has(String(p.id)) || !p.root) return;
                (function walk(n, seen) {
                    if (!n || seen.has(n.id)) return;
                    seen.add(n.id);
                    if (n.type !== 'gate') lids.add(String(n.logicalId != null ? n.logicalId : n.id));
                    (n.children || n._children || []).forEach(c => walk(c, seen));
                })(p.root, new Set());
            });
            ipLedger(true).forEach(pr => {
                if ((pr.members || []).some(m => lids.has(String(m.lid)))) principles.push(pr.members.map(m => m.label).join(' ⊥ '));
            });
        } catch (_) {}

        // 8. R&M artifacts hanging off impacted events/LRUs
        const ram = { tasks: [], mmel: [], msis: [] };
        try {
            const inPages = beRef => { const h = (typeof _fmesFindBe === 'function') ? _fmesFindBe(beRef) : null; return !!(h && pages.has(String(h.page.id))); };
            ((projectConfig.ram || {}).tasks || []).forEach(t => {
                if ((t.itemId && S.itemIds.includes(t.itemId)) || (t.beRef && inPages(t.beRef))) ram.tasks.push(t.name);
            });
            ((projectConfig.mmel || {}).items || []).forEach(m => {
                if ((m.itemId && S.itemIds.includes(m.itemId)) || (m.beRef && inPages(m.beRef))) ram.mmel.push(m.id + ' ' + m.title);
            });
            ((projectConfig.msg3 || {}).msis || []).forEach(m => {
                if (m.itemId && S.itemIds.includes(m.itemId)) ram.msis.push(m.id + ' ' + m.name);
            });
        } catch (_) {}

        // 9. gates whose domains intersect — these hand-offs WILL reopen
        const gates = [];
        try {
            const phases = applyCockpitStatuses(computePhaseStatus());
            const anyCrit = [...fcs.keys()].some(k => {
                const f = (acFhaData || []).find(x => String(x.internalId) === k);
                return f && (f.severity === 'Catastrophic' || f.severity === 'Hazardous');
            });
            const touched = {
                AFHA: fcs.size > 0, SFHA: S.systems.length > 0,
                PASA: anyCrit, PSSA: S.systems.length > 0 && pages.size > 0,
                SSA: pages.size > 0, ASA: anyCrit,
                CMA: [...cca.keys()].some(k => /^CMA/.test(k)),
                ZSA: [...cca.keys()].some(k => /^Z-/.test(k)),
                PRA: [...cca.keys()].some(k => /^PRA/.test(k)),
            };
            Object.keys(touched).forEach(k => {
                if (!touched[k] || !phases[k]) return;
                gates.push({ assessment: k, status: phases[k].status || 'in work',
                    willReopen: phases[k].status === 'handed-off',
                    note: phases[k].status === 'handed-off' ? 'HANDED OFF — the change will drift its fingerprint and REOPEN it' : 'in work — absorb the change before hand-off' });
            });
        } catch (_) {}

        return {
            scope: S, subIds: [...subIds],
            fcs: [...fcs.entries()].map(([k, v]) => ({ id: k, why: v })),
            pages: [...pages.entries()].map(([k, v]) => ({ id: k, why: v })),
            macRules: [...macRules.entries()].map(([k, v]) => ({ id: k, why: v })),
            reqs: [...reqs.entries()].map(([k, v]) => ({ id: k, why: v })),
            cca: [...cca.entries()].map(([k, v]) => ({ id: k, why: v })),
            coffeVerdicts: coffe, principles, ram, gates,
            counts: { fcs: fcs.size, pages: pages.size, reqs: reqs.size, cca: cca.size, macRules: macRules.size, principles: principles.length,
                      ramTasks: ram.tasks.length, mmel: ram.mmel.length, msis: ram.msis.length,
                      gatesTouched: gates.length, gatesWillReopen: gates.filter(g => g.willReopen).length },
        };
    }

    // ------------------------------------------------- P6.3: the wiring
    function _jr(kind, msg) { try { if (typeof window.jrnl === 'function') window.jrnl(kind, msg); } catch (_) {} }

    // Drift: the blast radius was a PREDICTION — if the model moved underneath
    // an open mod, the prediction is stale. Deterministic compare of counts.
    function _modDrift(m) {
        try {
            if (!m || m.state === 're-verified') return null;
            const now = modImpact(m.scope).counts, then = (m.impact || {}).counts || {};
            const keys = ['fcs', 'pages', 'reqs', 'cca', 'macRules', 'gatesWillReopen'];
            const diffs = keys.filter(k => (now[k] || 0) !== (then[k] || 0))
                .map(k => k + ' ' + (then[k] || 0) + '→' + (now[k] || 0));
            return diffs.length ? diffs : null;
        } catch (_) { return null; }
    }

    // Carried PRs: which Problem Reports actually carried this mod through the
    // seals — every completed reopen cycle on a predicted-reopen gate, closed
    // inside the mod's assess→close window. Computed, never typed.
    function _modCarriedPRs(m) {
        try {
            const gates = ((m.impact || {}).gates || []).filter(g => g.willReopen).map(g => g.assessment);
            if (!gates.length) return [];
            const t0 = Date.parse((m.history[0] || {}).at || 0) || 0;
            const t1 = m.state === 're-verified' ? (Date.parse((m.history[m.history.length - 1] || {}).at || 0) || Date.now()) : Date.now();
            const prs = new Set();
            ((projectConfig.baselineDeltas) || []).forEach(d => {
                const at = Date.parse(d.at || d.to || 0) || 0;
                if (d.prId && gates.indexOf(d.gate) >= 0 && at >= t0 && at <= t1) prs.add(d.prId);
            });
            return [...prs];
        } catch (_) { return []; }
    }

    // REG §5c — the modification register
    function regMods() {
        return _store().map(m => ({
            id: m.id, title: m.title, state: m.state,
            scope: [m.scope.systems.join(','), m.scope.subIds.join(','), m.scope.itemIds.join(',')].filter(Boolean).join(' · ') || '—',
            blast: (m.impact.counts.fcs || 0) + ' FCs · ' + (m.impact.counts.pages || 0) + ' trees · ' + (m.impact.counts.reqs || 0) + ' reqs · ' + (m.impact.counts.cca || 0) + ' CCA',
            reopens: ((m.impact.gates || []).filter(g => g.willReopen).map(g => g.assessment).join(', ')) || 'none predicted',
            carriedPRs: (m.carriedPRs && m.carriedPRs.length ? m.carriedPRs.join(', ') : _modCarriedPRs(m).join(', ')) || '—',
            signatures: (m.history || []).map(h => h.state + ': ' + h.by + ' ' + String(h.at).slice(0, 10)).join('; '),
        }));
    }
    (function extendReg() {
        function ext() {
            if (!window.Reports || !window.Reports.DEFAULT_TEMPLATES || !window.Reports.DEFAULT_TEMPLATES.REG) return false;
            const T = window.Reports.DEFAULT_TEMPLATES;
            if (T.REG.indexOf('{{reg_mods}}') < 0 && T.REG.indexOf('{{reg_deltas}}') >= 0) {
                T.REG = T.REG.replace('{{reg_deltas}}',
                    '{{reg_deltas}}\n\n' +
                    '### 5c. Modification register\n' +
                    'Every modification assessed before it was made: the declared scope, the computed blast radius, the hand-offs predicted to reopen, and the Problem Reports that actually carried the change through the seals. Closure is blocked while a predicted reopen remains un-re-handed-off — the prediction grades itself.\n' +
                    '{{reg_mods}}');
            }
            if (!window.Reports.extractData._modWrapped) {
                const orig = window.Reports.extractData;
                const wrapped = function (reportType) {
                    const data = orig.apply(this, arguments);
                    try { if (reportType === 'REG') data.reg_mods = regMods(); } catch (_) { data.reg_mods = []; }
                    return data;
                };
                wrapped._modWrapped = true;
                window.Reports.extractData = wrapped;
            }
            return true;
        }
        if (!ext()) { let tries = 20; const t = setInterval(() => { if (ext() || --tries <= 0) clearInterval(t); }, 300); }
    })();

    // INV-28 (advisory): open mods whose blast radius has drifted since assessment
    (function registerInv() {
        function reg() {
            if (typeof window.invRegister !== 'function') return false;
            window.invRegister({
                id: 'INV-28', name: 'Assessed modifications still match the live model (no blast-radius drift)', sev: 'advisory',
                run: () => {
                    const fails = []; let checked = 0;
                    _store().forEach(m => {
                        if (m.state === 're-verified') return;
                        checked++;
                        const d = _modDrift(m);
                        if (d) fails.push(m.id + ' \u201C' + m.title + '\u201D (' + m.state + '): impact drifted since assessment \u2014 ' + d.join(', ') + ' \u2014 re-assess');
                    });
                    return { checked: checked, fails: fails };
                },
            });
            return true;
        }
        if (!reg()) { let tries = 20; const t = setInterval(() => { if (reg() || --tries <= 0) clearInterval(t); }, 300); }
    })();

    // --------------------------------------------------------------- actions
    // The scope is SELECTED, not typed — and the wizard lives INLINE on the
    // mod page, not in a modal: assessing a modification is the page's main
    // activity, so the pickers and the live blast radius get the full page
    // width instead of an overlay. modWizard(seed) accepts a pre-seeded scope
    // so "assess a modification" can be launched already pointing at an
    // artifact (e.g. from an item row: modWizard({ itemIds: ['LRU-FCS-03'] })).
    const _fieldCss = 'width:100%; box-sizing:border-box; margin:0; font-size:13px; padding:7px 10px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary);';   // margin:0 beats the global input margin-bottom that broke the flex-end alignment
    const _labelCss = 'display:block; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; margin:12px 0 4px;';
    let _wizOpen = false;
    let _wizSeed = null;

    function _wizPanelHtml(seed) {
        const sysSeed = new Set(seed.systems || []), subSeed = new Set(seed.subIds || []), itemSeed = new Set(seed.itemIds || []);
        const sysRows = (typeof systemsData !== 'undefined' ? systemsData || [] : []).map(s => ({ id: s.id, label: s.name || '' }));
        const seen = new Set();
        const subRows = (typeof acFunctionsData !== 'undefined' ? acFunctionsData || [] : [])
            .filter(f => f.subId && !seen.has(f.subId) && seen.add(f.subId))
            .map(f => ({ id: f.subId, label: f.subName || '' }));
        const sysName = id => ((typeof systemsData !== 'undefined' ? systemsData || [] : []).find(s => s.id === id) || {}).name || id || '';
        const itemRows = (typeof itemsData !== 'undefined' ? itemsData || [] : [])
            .map(i => ({ id: i.itemId, label: (i.name || '') + (i.owningSystemId ? ' · ' + sysName(i.owningSystemId) : '') }));
        return '<div id="mod-wiz-inline" style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin:0 0 18px; padding:16px 18px;">' +
            '<div style="display:flex; justify-content:space-between; align-items:baseline;">' +
            '<div style="font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">New impact assessment</div>' +
            '<button class="btn-red" style="margin:0; font-size:11px; padding:2px 10px;" onclick="modWizClose()">discard</button></div>' +
            '<label style="' + _labelCss + '">Modification title (what is changing)</label>' +
            '<input id="mod-wiz-title" type="text" style="' + _fieldCss + '" value="' + _esc(seed.title || '') + '" placeholder="e.g. Replace elevator servo channel B with vendor C unit">' +
            '<div id="mod-wiz-pickers" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:14px; margin-top:14px;">' +
            _wizGroup('Systems', 'sys', sysRows, sysSeed) +
            _wizGroup('Aircraft sub-functions', 'sub', subRows, subSeed) +
            _wizGroup('Items / LRUs', 'item', itemRows, itemSeed) +
            '</div>' +
            '<div id="mod-wiz-preview" style="font-size:12.5px; border:1px solid var(--color-border-strong); background:var(--color-surface-2); padding:10px 14px; margin-top:14px;"></div>' +
            '<div style="display:flex; gap:14px; align-items:flex-end; margin-top:4px;">' +
            '<div style="flex:1;"><label style="' + _labelCss + '">Signature (required — the assessment is a signed act)</label>' +
            '<input id="mod-wiz-by" type="text" style="' + _fieldCss + ' height:34px;" value="' + _esc(seed.by || '') + '" placeholder="Your name"></div>' +
            '<button id="mod-wiz-submit" class="ckpt-m-btn" style="font-size:13px; height:34px; padding:0 18px; margin:0; box-sizing:border-box; white-space:nowrap;" onclick="_modWizSubmit()">Assess &amp; sign</button>' +
            '</div>' +
            '<p id="mod-wiz-err" style="color:#8E2A2A; font-size:12px; font-weight:600; margin:8px 0 0; display:none;"></p>' +
            '</div>';
    }

    function _wizGroup(title, kind, rows, seedSet) {
        return '<div>' +
            '<div style="' + _labelCss + ' margin-top:0;">' + _esc(title) + '</div>' +
            '<div style="max-height:220px; overflow:auto; border:1px solid var(--color-border-strong); background:var(--color-surface-1); padding:6px 8px;">' +
            (rows.length ? rows.map(r =>
                '<label style="display:flex; gap:8px; align-items:baseline; font-size:12.5px; padding:3px 2px; cursor:pointer;">' +
                '<input type="checkbox" class="mod-wiz-cb" data-kind="' + kind + '" value="' + _esc(r.id) + '"' + (seedSet.has(r.id) ? ' checked' : '') + ' onchange="_modWizPreview()">' +
                '<span class="u-mono" style="white-space:nowrap;">' + _esc(r.id) + '</span>' +
                '<span style="color:var(--color-text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + _esc(r.label) + '</span></label>'
            ).join('') : '<div style="font-size:12px; color:var(--color-text-tertiary); padding:4px 2px;">none in this project</div>') +
            '</div></div>';
    }

    function _wizScope() {
        const scope = { systems: [], subIds: [], itemIds: [] };
        document.querySelectorAll('#mod-wiz-inline .mod-wiz-cb:checked').forEach(cb => {
            if (cb.dataset.kind === 'sys') scope.systems.push(cb.value);
            else if (cb.dataset.kind === 'sub') scope.subIds.push(cb.value);
            else scope.itemIds.push(cb.value);
        });
        return scope;
    }

    window._modWizPreview = function () {
        const el = document.getElementById('mod-wiz-preview');
        if (!el) return;
        const scope = _wizScope();
        if (!scope.systems.length && !scope.subIds.length && !scope.itemIds.length) {
            el.innerHTML = '<span style="color:var(--color-text-tertiary);">Select the systems, functions or LRUs the change touches — the blast radius computes live as you pick.</span>';
            return;
        }
        const im = modImpact(scope);
        const reopen = (im.gates || []).filter(g => g.willReopen).map(g => g.assessment);
        el.innerHTML = '<b>Blast radius:</b> ' + im.counts.fcs + ' FC(s) · ' + im.counts.pages + ' tree(s) · ' +
            im.counts.reqs + ' requirement(s) · ' + im.counts.cca + ' CCA row(s) · ' + im.counts.macRules + ' MAC rule(s) · ' +
            im.counts.principles + ' principle(s) · ' + (im.counts.ramTasks + im.counts.mmel + im.counts.msis) + ' R&amp;M artifact(s)' +
            '<div style="margin-top:6px;' + (reopen.length ? ' color:#8E2A2A; font-weight:600;' : ' color:var(--color-text-secondary);') + '">' +
            (reopen.length ? '⚠ ' + reopen.length + ' hand-off(s) will reopen: ' + reopen.join(', ') : 'No handed-off gates intersect this scope.') + '</div>';
    };

    function modWizard(seed) {
        _wizOpen = true;
        _wizSeed = seed || {};
        try { if (typeof window._slCurrentTab !== 'undefined' && window._slCurrentTab !== 'mod' && typeof switchTab === 'function') switchTab('mod'); } catch (_) {}
        renderModPage();
        const panel = document.getElementById('mod-wiz-inline');
        if (panel) { try { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {} }
        setTimeout(() => { const t = document.getElementById('mod-wiz-title'); if (t && !t.value) t.focus(); }, 120);
    }

    window.modWizClose = function () {
        _wizOpen = false; _wizSeed = null;
        renderModPage();
    };

    window._modWizSubmit = function () {
        const err = document.getElementById('mod-wiz-err');
        const fail = m => { err.textContent = m; err.style.display = 'block'; };
        const title = (document.getElementById('mod-wiz-title').value || '').trim();
        if (!title) return fail('A modification needs a title — what is changing?');
        const scope = _wizScope();
        if (!scope.systems.length && !scope.subIds.length && !scope.itemIds.length) return fail('Empty scope — select at least one system, function or LRU.');
        const by = (document.getElementById('mod-wiz-by').value || '').trim();
        if (!by) return fail('The impact assessment is a signed act — signature required.');
        const impact = modImpact(scope);
        _store().push({
            id: 'MOD-' + String((projectConfig.modCounter = (projectConfig.modCounter || 0) + 1)).padStart(3, '0'),
            title, scope, impact, state: 'assessed',
            history: [{ state: 'assessed', by, at: new Date().toISOString() }],
        });
        const newMod = _store()[_store().length - 1];
        _jr('mod-assess', newMod.id + ' \u201C' + title + '\u201D impact assessed \u2014 ' + impact.counts.fcs + ' FC(s), ' + impact.counts.pages + ' tree(s), ' + impact.counts.gatesWillReopen + ' hand-off(s) predicted to reopen \u2014 signed ' + by);
        _save(); _wizOpen = false; _wizSeed = null; renderModPage();
        _toast('Impact assessed and signed — ' + impact.counts.fcs + ' FC(s), ' + impact.counts.gatesWillReopen + ' hand-off(s) will reopen.', 'success', 4000);
    };
    async function modAdvance(id) {
        const m = _store().find(x => x.id === id); if (!m) return;
        const next = m.state === 'assessed' ? 'implemented' : m.state === 'implemented' ? 're-verified' : null;
        if (!next) return;
        if (next === 're-verified') {
            // grade the prediction: every gate predicted to reopen must have been
            // re-handed-off or be back to complete; reopened gates block closure
            try {
                const phases = applyCockpitStatuses(computePhaseStatus());
                const stillOpen = (m.impact.gates || []).filter(g => g.willReopen && phases[g.assessment] && phases[g.assessment].status === 'reopened');
                if (stillOpen.length) {
                    _toast('Cannot close: ' + stillOpen.map(g => g.assessment).join(', ') + ' reopened by this change and not yet re-handed-off.', 'error', 6000);
                    return;
                }
            } catch (_) {}
        }
        const by = (await _ask('Advance ' + m.id + ' → "' + next + '". Sign with your name:', '')) || '';
        if (!by.trim()) return;
        m.state = next;
        m.history.push({ state: next, by: by.trim(), at: new Date().toISOString() });
        if (next === 're-verified') { try { m.carriedPRs = _modCarriedPRs(m); } catch (_) { m.carriedPRs = []; } }
        _jr('mod-advance', m.id + ' \u2192 ' + next + (next === 're-verified' && m.carriedPRs && m.carriedPRs.length ? ' \u2014 carried by ' + m.carriedPRs.join(', ') : '') + ' \u2014 signed ' + by.trim());
        _save(); renderModPage();
    }
    function modDelete(id) {
        const s = _store();
        const i = s.findIndex(x => x.id === id);
        if (i >= 0 && confirm('Remove this modification record?')) { s.splice(i, 1); _save(); renderModPage(); }
    }

    // --------------------------------------------------------------- render
    const _stamp = (txt, color) => '<span style="font-family:var(--font-mono); font-size:10.5px; font-weight:600; letter-spacing:0.05em; padding:3px 7px; color:' + color + '; background:' + color + '1A; box-shadow:inset 0 0 0 1.5px currentColor; white-space:nowrap;">' + _esc(txt) + '</span>';
    function renderModPage() {
        const host = document.getElementById('mod-host');
        if (!host) return;
        const mods = _store();
        // an in-progress assessment survives re-renders: capture the live
        // selections/fields back into the seed before rebuilding the page
        if (_wizOpen && document.getElementById('mod-wiz-inline')) {
            const s = _wizScope();
            s.title = (document.getElementById('mod-wiz-title') || {}).value || '';
            s.by = (document.getElementById('mod-wiz-by') || {}).value || '';
            _wizSeed = s;
        }
        let html = '<div style="margin:0 0 12px;">' +
            (_wizOpen ? '' : '<button class="btn-cyan" onclick="modWizard()" style="font-size:13px; padding:8px 14px;">⚙ Assess a modification</button> ') +
            '<span style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">deterministic closure over the model graph — every impacted artifact carries the trace edge that pulled it in</span></div>';
        if (_wizOpen) html += _wizPanelHtml(_wizSeed || {});
        if (!mods.length) html += '<p style="color:var(--color-text-tertiary); font-size:13px;">No modifications assessed yet. Declare the scope before touching the model, and the wizard tells you the blast radius.</p>';
        mods.slice().reverse().forEach(m => {
            const c = m.impact.counts;
            html += '<div style="border:1px solid var(--color-border-strong); margin-bottom:16px; background:var(--color-surface-1);">' +
                '<div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; border-bottom:2px solid var(--color-text-primary);">' +
                '<div><b>' + _esc(m.id) + ' — ' + _esc(m.title) + '</b> ' +
                _stamp(m.state.toUpperCase(), m.state === 're-verified' ? '#1D6E3E' : m.state === 'implemented' ? '#9A6200' : '#3D5A80') +
                ((() => { try { const d = _modDrift(m); return d ? _stamp('DRIFTED — RE-ASSESS', '#8E2A2A') : ''; } catch (_) { return ''; } })()) +
                ((() => { try { const prs = m.carriedPRs && m.carriedPRs.length ? m.carriedPRs : _modCarriedPRs(m); return prs.length ? '<span class="u-mono" style="font-size:10px; border:1px solid var(--color-border-hair); padding:1px 7px; margin-left:6px;">carried by ' + _esc(prs.join(', ')) + '</span>' : ''; } catch (_) { return ''; } })()) +
                '<span class="u-mono" style="font-size:10px; color:var(--color-text-tertiary); margin-left:8px;">scope: ' +
                _esc([m.scope.systems.join(','), m.scope.subIds.join(','), m.scope.itemIds.join(',')].filter(Boolean).join(' · ') || '—') + '</span></div>' +
                '<div>' + (m.state !== 're-verified' ? '<button class="ckpt-m-btn" style="font-size:10.5px; padding:1px 8px;" onclick="modAdvance(\'' + m.id + '\')">' + (m.state === 'assessed' ? 'mark implemented →' : 'close (re-verified) →') + '</button> ' : '') +
                '<button class="node-delete-btn-inner" style="font-size:11px;" onclick="modDelete(\'' + m.id + '\')">✕</button></div></div>' +
                '<div style="display:flex; gap:8px; flex-wrap:wrap; padding:10px 14px;">' +
                [['FCs', c.fcs], ['Trees', c.pages], ['Reqs', c.reqs], ['CCA', c.cca], ['MAC rules', c.macRules], ['CoFFE verdicts', m.impact.coffeVerdicts],
                 ['Principles', c.principles], ['Maint tasks', c.ramTasks], ['MMEL', c.mmel], ['MSIs', c.msis]]
                    .map(([l, v]) => '<span class="u-mono" style="font-size:11px; border:1px solid var(--color-border-hair); padding:2px 8px;' + (v ? '' : ' color:var(--color-text-tertiary);') + '">' + l + ' ' + v + '</span>').join('') + '</div>';
            if ((m.impact.gates || []).length) {
                html += '<div style="padding:0 14px 10px;"><table class="data-table" style="width:100%; max-width:720px; font-size:11.5px;"><thead><tr><th>Gate</th><th>Status at assessment</th><th>Prediction</th></tr></thead><tbody>' +
                    m.impact.gates.map(g => '<tr><td class="u-mono">' + _esc(g.assessment) + '</td><td>' + _esc(g.status) + '</td>' +
                        '<td style="color:' + (g.willReopen ? '#8E2A2A' : 'var(--color-text-secondary)') + ';">' + _esc(g.note) + '</td></tr>').join('') +
                    '</tbody></table></div>';
            }
            const whyRows = [].concat(
                m.impact.fcs.slice(0, 6).map(x => ['FC', x.why]),
                m.impact.pages.slice(0, 6).map(x => ['Tree', x.why]),
                m.impact.reqs.slice(0, 4).map(x => ['Req', x.id + ' — ' + x.why]),
                m.impact.cca.slice(0, 4).map(x => ['CCA', x.id + ' — ' + x.why]));
            if (whyRows.length) {
                html += '<div style="padding:0 14px 12px;"><table class="data-table" style="width:100%; font-size:11.5px;"><thead><tr><th style="width:60px">Kind</th><th>Impacted artifact — why</th></tr></thead><tbody>' +
                    whyRows.map(([k, w]) => '<tr><td class="u-mono">' + k + '</td><td>' + _esc(w) + '</td></tr>').join('') +
                    '</tbody></table>' +
                    (m.impact.fcs.length + m.impact.pages.length > 12 ? '<p class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary);">… full register in the Evidence Package</p>' : '') + '</div>';
            }
            html += '</div>';
        });
        html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">Closure paths: system → functions → FCs (incl. interdependence contributions) → trees (transfer closure) → requirements, MAC/CoFFE, CCA/zones, principles, maintenance/MMEL/MSG-3. ' +
            'Closing a mod is blocked while any gate it reopened remains un-re-handed-off — the prediction grades itself.</p>';
        host.innerHTML = html;
        if (_wizOpen) { try { window._modWizPreview(); } catch (_) {} }
    }

    // ------------------------------------------------- navigation wrapper
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._modWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-mod');
                if (v) v.style.display = (tabId === 'mod') ? 'block' : 'none';
                const s = document.getElementById('snav-mod');
                if (s) s.classList.toggle('snav-active', tabId === 'mod');
                if (tabId === 'mod') renderModPage();
            } catch (_) {}
            return r;
        };
        wrapped._modWrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------ exports
    window.renderModPage = renderModPage;
    window.modWizard = modWizard;
    window.modAdvance = modAdvance;
    window.modDelete = modDelete;
    window.modImpact = modImpact;
    window._modStore = _store;
    window.regMods = regMods;
    window._modDrift = _modDrift;
    window._modCarriedPRs = _modCarriedPRs;
})();
