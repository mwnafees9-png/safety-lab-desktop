// mmel_module.js — Phase P7: MMEL / Time-Limited Dispatch analysis.
// BORN MODULAR: new file, zero monolith edits; store under projectConfig.mmel.
//
// The question an MMEL answers: with THIS item inoperative, may the aircraft
// dispatch, in what category, and on what justification? Here the
// justification is not prose — it is the LIVE safety model:
//
//   PROTECTION CHECK (exact, structural): the item's basic event is located
//     in the minimal cut sets of every Cat/Haz failure condition it touches.
//     If it already sits in an order-1 cut set, it IS the protection — no
//     dispatch. If it sits in an order-2 cut set, dispatching it inoperative
//     leaves a SINGLE failure to the condition — prohibited for Catastrophic,
//     heavily flagged for Hazardous.
//   QUANTITATIVE CHECK (transient, through the live engine): the event is
//     forced TRUE (probability 1), the affected trees recompute, and the
//     dispatched-vs-baseline top probabilities and target margins are
//     reported. Transient mutate-and-restore, same discipline as the CCMR
//     τ-bisection.
//   INTERVAL CHECK: the rectification category's calendar allowance
//     (B=3 / C=10 / D=120 consecutive days, A=as specified) converts to FH
//     via the fleet utilization setting and is compared against exposure.
//   TLD: a suggested maximum dispatch exposure from a STATED budget-share
//     assumption (default: the dispatched configuration may consume at most
//     10% of the failure condition's probability budget).
//
// Deterministic derivation: MMEL candidates propose from LRUs with linked
// events, pre-screened by the protection check. States: draft → analyzed →
// proposed → approved, every advance signed.

(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    function _toast(m, k, t) { try { if (typeof showToast === 'function') showToast(m, k || 'info', t || 3000); } catch (_) {} }
    async function _ask(msg, dflt) {
        try { if (typeof slPrompt === 'function') return await slPrompt(msg, dflt || ''); } catch (_) {}
        return window.prompt(msg, dflt || '');
    }
    function _store() {
        if (!projectConfig.mmel) projectConfig.mmel = { items: [], budgetShare: 0.10 };
        if (!Array.isArray(projectConfig.mmel.items)) projectConfig.mmel.items = [];
        if (!(projectConfig.mmel.budgetShare > 0)) projectConfig.mmel.budgetShare = 0.10;
        return projectConfig.mmel;
    }
    function _save() { try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {} }
    function _access() { return (typeof window._ramHasAccess === 'function') ? window._ramHasAccess() : true; }
    function _find(ref) { try { return (typeof _fmesFindBe === 'function') ? _fmesFindBe(ref) : null; } catch (_) { return null; } }
    function _annualFH() { return (projectConfig.mxAnalytics && projectConfig.mxAnalytics.annualFH) || 600; }

    const CATEGORIES = { A: null, B: 3, C: 10, D: 120 };   // consecutive calendar days
    const STATES = ['draft', 'analyzed', 'proposed', 'approved'];

    // ------------------------------------------------- the dispatch analysis
    // All pages whose trees contain the event, with their worst linked Cat/Haz
    // severity (transfer closure via the RAM thread machinery).
    function _affected(beRef) {
        const hit = _find(beRef);
        if (!hit) return null;
        const out = [];
        const pageFcMap = (typeof window._ramPageFcMap === 'function') ? window._ramPageFcMap() : new Map();
        ((typeof ftaPages !== 'undefined' ? ftaPages : []) || []).forEach(p => {
            if (!p.root) return;
            let contains = false;
            (function walk(n, seen) {
                if (!n || contains || seen.has(n.id)) return;
                seen.add(n.id);
                if (String(n.id) === String(hit.node.id) || (n.logicalId != null && String(n.logicalId) === String(hit.node.logicalId))) { contains = true; return; }
                (n.children || n._children || []).forEach(c => walk(c, seen));
            })(p.root, new Set());
            if (!contains) return;
            let worst = null;
            (pageFcMap.get(String(p.id)) || new Set()).forEach(iid => {
                const fc = (acFhaData || []).find(f => String(f.internalId) === String(iid)) ||
                    (systemsData || []).flatMap(s => s.fha || []).find(f => String(f.internalId) === String(iid));
                if (fc && (fc.severity === 'Catastrophic' || (fc.severity === 'Hazardous' && worst !== 'Catastrophic'))) worst = fc.severity;
            });
            out.push({ page: p, severity: worst });
        });
        return { hit, pages: out };
    }

    // Structural protection check via minimal cut sets (exact).
    function _protection(beRef) {
        const aff = _affected(beRef);
        if (!aff) return { ok: false, verdict: 'event not found in any tree', minOrder: null };
        let minOrder = Infinity, worstSev = null;
        aff.pages.forEach(({ page, severity }) => {
            if (!severity) return;   // only Cat/Haz threads constrain dispatch
            let cuts = [];
            try { cuts = bddMinimalCutsets(page.root) || []; } catch (_) {}
            cuts.forEach(cs => {
                const inCs = cs.some(n => String(n.id) === String(aff.hit.node.id) ||
                    (n.logicalId != null && aff.hit.node.logicalId != null && String(n.logicalId) === String(aff.hit.node.logicalId)));
                if (inCs && cs.length < minOrder) { minOrder = cs.length; worstSev = severity; }
            });
        });
        if (!isFinite(minOrder)) return { ok: true, verdict: 'not on any Cat/Haz cut set — dispatch unconstrained by the safety model', minOrder: null };
        if (minOrder === 1) return { ok: false, minOrder, verdict: 'event IS the protection (order-1 cut set on a ' + worstSev + ' condition) — NO DISPATCH', sev: worstSev };
        if (minOrder === 2) {
            return worstSev === 'Catastrophic'
                ? { ok: false, minOrder, verdict: 'dispatch leaves a SINGLE failure to a Catastrophic condition (order-2 cut set) — prohibited', sev: worstSev }
                : { ok: true, caution: true, minOrder, verdict: 'dispatch leaves a single failure to a Hazardous condition — Category A with strict limits and (m)/(o) procedures', sev: worstSev };
        }
        return { ok: true, minOrder, verdict: 'order-' + minOrder + ' protection retained while dispatched (' + worstSev + ' thread)', sev: worstSev };
    }

    // Quantitative check: force the event TRUE transiently, recompute the
    // affected tops, restore. Returns worst baseline/dispatched pair + TLD.
    function _quantitative(beRef) {
        const aff = _affected(beRef);
        if (!aff || !aff.pages.length) return null;
        const n = aff.hit.node;
        const saved = { probability: n.probability, lambda: n.lambda, inputMode: n.inputMode, repairModel: n.repairModel, tau: n.tau, exposureMode: n.exposureMode, dormancyInterval: n.dormancyInterval, markovModelId: n.markovModelId };
        const tExp = (typeof ftaConfig === 'object' && ftaConfig && ftaConfig.exposureTime) || 1;
        let worst = null;
        try {
            aff.pages.forEach(({ page, severity }) => {
                if (!severity) return;
                const base = calcBottomUp(page.root, new Set());
                n.probability = 1; n.lambda = 0; n.inputMode = 'probability';
                delete n.repairModel; delete n.tau; delete n.exposureMode; delete n.dormancyInterval; delete n.markovModelId;
                const disp = calcBottomUp(page.root, new Set());
                Object.keys(saved).forEach(k => { if (saved[k] === undefined) delete n[k]; else n[k] = saved[k]; });
                calcBottomUp(page.root, new Set());   // restore computed state
                let target = null;
                try { const t = getSafetyTarget(severity); if (t && t.prob) target = -Math.expm1(-t.prob * tExp); } catch (_) {}
                const row = { page: page.name || page.id, severity, base, dispatched: disp, target,
                              ratio: base > 0 ? disp / base : null, withinTarget: target != null ? disp <= target : null };
                if (!worst || (row.dispatched || 0) > (worst.dispatched || 0)) worst = row;
            });
        } catch (e) {
            Object.keys(saved).forEach(k => { if (saved[k] === undefined) delete n[k]; else n[k] = saved[k]; });
            return { error: String(e && e.message || e) };
        }
        if (!worst) return null;
        // TLD: allowed extra probability = budgetShare × target; extra rate per FH
        // ≈ (P_disp − P_base)/tExp ⇒ max dispatch FH = share×target / rate. STATED
        // assumption; the authority agrees the share, not the tool.
        const share = _store().budgetShare;
        if (worst.target != null && worst.dispatched > worst.base) {
            const extraRate = (worst.dispatched - worst.base) / tExp;
            worst.tldMaxFH = extraRate > 0 ? (share * worst.target) / extraRate : null;
            worst.tldShare = share;
        }
        return worst;
    }

    function mmelAnalyze(id) {
        const it = _store().items.find(x => x.id === id); if (!it) return null;
        it.protection = _protection(it.beRef);
        it.quant = _quantitative(it.beRef);
        if (it.state === 'draft') it.state = 'analyzed';
        it.analyzedAt = new Date().toISOString();
        _save();
        return it;
    }

    // --------------------------------------------------------------- actions
    async function mmelAdd() {
        if (!_access()) { _toast('MMEL/TLD analysis requires a Pro+ subscription.', 'warning', 3500); return; }
        const title = await _ask('MMEL item — equipment name/function:'); if (!title || !title.trim()) return;
        const ata = (await _ask('ATA chapter (e.g. 32-40):', '')) || '';
        const items = (typeof itemsData !== 'undefined' ? itemsData : []) || [];
        const itemId = (await _ask('Linked LRU (optional):\n' + items.slice(0, 12).map(i => '  ' + i.itemId + ' — ' + i.name).join('\n'), '')) || '';
        const beRef = (await _ask('Linked basic event (displayId/logicalId) — enables the protection + quantitative checks:', '')) || '';
        const installed = parseInt(await _ask('Number installed:', '2')) || 1;
        const required = parseInt(await _ask('Number required for dispatch:', '1')) || 0;
        const cat = ((await _ask('Rectification category — A (as specified) / B (3 days) / C (10 days) / D (120 days):', 'C')) || 'C').trim().toUpperCase();
        _store().items.push({
            id: 'MMEL-' + String((projectConfig.mmelCounter = (projectConfig.mmelCounter || 0) + 1)).padStart(3, '0'),
            title: title.trim(), ata: ata.trim(), itemId: itemId.trim(), beRef: beRef.trim(),
            installed, required, category: CATEGORIES[cat] !== undefined ? cat : 'C',
            catDays: CATEGORIES[cat] !== undefined ? CATEGORIES[cat] : 10,
            mProc: '', oProc: '', state: 'draft', history: [],
            protection: null, quant: null,
        });
        _save();
        mmelAnalyze(_store().items[_store().items.length - 1].id);
        renderMmelPage();
    }
    async function mmelAdvance(id) {
        const it = _store().items.find(x => x.id === id); if (!it) return;
        const next = STATES[Math.min(STATES.indexOf(it.state) + 1, STATES.length - 1)];
        if (next === it.state) return;
        if (next === 'proposed' && it.protection && it.protection.ok === false) {
            _toast('The protection check REJECTS this item (' + it.protection.verdict + ') — it cannot be proposed. Fix the architecture or withdraw it.', 'error', 6000);
            return;
        }
        const by = (await _ask('Advance ' + it.id + ' → "' + next + '". Sign with your name:', '')) || '';
        if (!by.trim()) return;
        it.state = next;
        it.history.push({ state: next, by: by.trim(), at: new Date().toISOString() });
        _save(); renderMmelPage();
    }
    async function mmelProc(id, kind) {
        const it = _store().items.find(x => x.id === id); if (!it) return;
        const cur = kind === 'm' ? it.mProc : it.oProc;
        const v = (await _ask((kind === 'm' ? '(m) MAINTENANCE procedure required before dispatch:' : '(o) OPERATIONS procedure/limitation while dispatched:'), cur || '')) || '';
        if (kind === 'm') it.mProc = v.trim(); else it.oProc = v.trim();
        _save(); renderMmelPage();
    }
    function mmelDelete(id) {
        const s = _store();
        const i = s.items.findIndex(x => x.id === id);
        if (i >= 0 && confirm('Remove this MMEL item?')) { s.items.splice(i, 1); _save(); renderMmelPage(); }
    }
    // Deterministic derivation: candidates from LRUs with linked events, pre-run
    // through the protection check. Rejected items are still shown as candidates
    // WITH their rejection — knowing what may NOT be in the MEL is half the list.
    function mmelDerive(apply) {
        if (typeof window._ramStore !== 'function') return [];
        const have = new Set(_store().items.map(x => x.itemId).filter(Boolean));
        const byItem = new Map();
        window._ramStore().tasks.forEach(t => {
            if (t.itemId && t.beRef && !byItem.has(t.itemId)) byItem.set(t.itemId, t.beRef);
        });
        const proposals = [];
        byItem.forEach((beRef, itemId) => {
            if (have.has(itemId)) return;
            const item = ((typeof itemsData !== 'undefined' ? itemsData : []) || []).find(i => i.itemId === itemId);
            proposals.push({ itemId, beRef, title: item ? item.name : itemId });
        });
        if (apply && proposals.length) {
            proposals.forEach(pr => {
                _store().items.push({
                    id: 'MMEL-' + String((projectConfig.mmelCounter = (projectConfig.mmelCounter || 0) + 1)).padStart(3, '0'),
                    title: pr.title, ata: '', itemId: pr.itemId, beRef: pr.beRef,
                    installed: 1, required: 0, category: 'C', catDays: 10,
                    mProc: '', oProc: '', state: 'draft', history: [],
                    protection: null, quant: null, origin: 'derived: ledger LRU link',
                });
                mmelAnalyze(_store().items[_store().items.length - 1].id);
            });
            _save();
        }
        return proposals;
    }

    // --------------------------------------------------------------- render
    const _stamp = (txt, color) => '<span style="font-family:var(--font-mono); font-size:10.5px; font-weight:600; letter-spacing:0.05em; padding:3px 7px; color:' + color + '; background:' + color + '1A; box-shadow:inset 0 0 0 1.5px currentColor; white-space:nowrap;">' + _esc(txt) + '</span>';
    function renderMmelPage() {
        const host = document.getElementById('mmel-host');
        if (!host) return;
        if (!_access()) { host.innerHTML = '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-2); padding:26px 30px; max-width:640px;"><h3 style="margin:0 0 10px; border:none; padding:0;">MMEL / TLD analysis is a Pro+ capability</h3><p style="font-size:13px; color:var(--color-text-secondary);">Dispatch candidacy evaluated through the live fault trees: protection retained, quantitative margin, rectification intervals, time-limited dispatch.</p></div>'; return; }
        const S = _store();
        const rejected = S.items.filter(i => i.protection && i.protection.ok === false).length;
        const approved = S.items.filter(i => i.state === 'approved').length;
        const annualFH = _annualFH();
        const fhPerDay = annualFH / 365;
        const derivable = mmelDerive(false).length;

        let html = '<div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">' +
            ['Items <b style="margin-left:6px;">' + S.items.length + '</b>',
             'Approved <b style="margin-left:6px; color:#1D6E3E;">' + approved + '</b>',
             'No-dispatch (protection) <b style="margin-left:6px;' + (rejected ? ' color:#8E2A2A;' : '') + '">' + rejected + '</b>',
             'Utilization <b style="margin-left:6px;">' + annualFH + ' FH/yr (' + fhPerDay.toFixed(1) + ' FH/day)</b>',
             'TLD budget share <b style="margin-left:6px;">' + (S.budgetShare * 100).toFixed(0) + '%</b>']
            .map(c => '<div style="height:32px; display:inline-flex; align-items:center; padding:0 12px; border:1px solid var(--color-border-strong); font-family:var(--font-mono); font-size:12px;">' + c + '</div>').join('') + '</div>';

        html += '<div style="margin:0 0 12px;"><button class="btn-cyan" onclick="mmelAdd()">+ MMEL item</button> ' +
            '<button class="btn-cyan" onclick="const n = mmelDerive(true).length; showToast(n ? n + \' candidate(s) derived from ledger-linked LRUs, each pre-screened through the protection check.\' : \'No new derivable candidates.\', \'info\', 4500); renderMmelPage();">⚙ Derive candidates' + (derivable ? ' (' + derivable + ')' : '') + '</button> ' +
            '<button class="btn-cyan" onclick="(async () => { const v = parseFloat(await (typeof slPrompt === \'function\' ? slPrompt(\'TLD budget share — fraction of the FC probability budget the dispatched configuration may consume (agree with the authority):\', String(_mmelStore().budgetShare)) : Promise.resolve(prompt(\'share:\', \'0.1\')))); if (v > 0 && v < 1) { _mmelStore().budgetShare = v; if (typeof commitSaveChanges === \'function\') commitSaveChanges(); renderMmelPage(); } })()">Set TLD share</button> ' +
            '<span style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">protection check is exact (cut sets); quantitative check forces the event TRUE through the live engine; nothing here is prose</span></div>';

        html += '<div style="overflow-x:auto;"><table class="data-table" style="width:100%; font-size:12px;"><thead><tr>' +
            '<th style="width:76px">Item</th><th>Equipment</th><th style="width:60px">ATA</th><th style="width:70px">Inst/Req</th><th style="width:96px">Category</th>' +
            '<th>Protection check (exact)</th><th>Quantitative (dispatched)</th><th style="width:110px">TLD max</th><th style="width:120px">(m)/(o)</th><th style="width:100px">State</th><th style="width:110px"></th></tr></thead><tbody>';
        if (!S.items.length) html += '<tr><td colspan="11" style="color:var(--color-text-tertiary);">No MMEL items yet — add one or derive candidates from ledger-linked LRUs.</td></tr>';
        S.items.forEach(it => {
            const p = it.protection, q = it.quant;
            const catFh = it.catDays != null ? Math.round(it.catDays * fhPerDay) : null;
            const tld = q && q.tldMaxFH != null ? q.tldMaxFH : null;
            const tldDays = tld != null ? tld / fhPerDay : null;
            html += '<tr><td class="u-mono">' + _esc(it.id) + (it.origin ? ' <span style="font-size:9px; font-family:var(--font-mono); border:1px solid currentColor; padding:0 3px; color:var(--color-text-tertiary);">AUTO</span>' : '') + '</td>' +
                '<td><b>' + _esc(it.title) + '</b>' + (it.beRef ? '<br><span class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary);">' + _esc(it.beRef) + '</span>' : '') + '</td>' +
                '<td class="u-mono">' + _esc(it.ata || '—') + '</td>' +
                '<td class="u-mono">' + it.installed + '/' + it.required + '</td>' +
                '<td class="u-mono">' + _esc(it.category) + (it.catDays != null ? ' · ' + it.catDays + 'd ≈ ' + catFh + ' FH' : ' · as specified') + '</td>' +
                '<td style="font-size:11.5px;">' + (p
                    ? (p.ok === false ? _stamp('NO DISPATCH', '#8E2A2A') : p.caution ? _stamp('CAT A + LIMITS', '#9A6200') : _stamp('PROTECTED', '#1D6E3E')) + '<br><span style="color:var(--color-text-secondary);">' + _esc(p.verdict) + '</span>'
                    : '<a href="#" onclick="mmelAnalyze(\'' + it.id + '\'); renderMmelPage(); return false;">analyze…</a>') + '</td>' +
                '<td class="u-mono" style="font-size:11px;">' + (q && !q.error && q.base != null
                    ? 'base ' + q.base.toExponential(2) + '<br>disp ' + q.dispatched.toExponential(2) + (q.ratio ? ' (×' + (q.ratio >= 100 ? Math.round(q.ratio) : q.ratio.toFixed(1)) + ')' : '') +
                      (q.withinTarget != null ? '<br>' + (q.withinTarget ? '<span style="color:#1D6E3E;">≤ target ✓</span>' : '<span style="color:#8E2A2A;">exceeds target</span>') : '')
                    : (q && q.error ? _esc(q.error) : '—')) + '</td>' +
                '<td class="u-mono" style="font-size:11px;">' + (tld != null
                    ? Math.round(tld).toLocaleString() + ' FH<br>(≈' + Math.round(tldDays) + 'd @ ' + (S.budgetShare * 100).toFixed(0) + '%)' +
                      (it.catDays != null ? (tldDays >= it.catDays ? '<br><span style="color:#1D6E3E;">covers Cat ' + it.category + ' ✓</span>' : '<br><span style="color:#8E2A2A;">Cat ' + it.category + ' too long</span>') : '')
                    : '—') + '</td>' +
                '<td style="font-size:11px;"><a href="#" onclick="mmelProc(\'' + it.id + '\',\'m\'); return false;">(m)</a> ' + (it.mProc ? '✓' : '—') +
                ' · <a href="#" onclick="mmelProc(\'' + it.id + '\',\'o\'); return false;">(o)</a> ' + (it.oProc ? '✓' : '—') + '</td>' +
                '<td>' + _stamp(it.state.toUpperCase(), it.state === 'approved' ? '#1D6E3E' : it.state === 'draft' ? '#8A8B90' : '#3D5A80') + '</td>' +
                '<td><button class="ckpt-m-btn" style="font-size:10.5px; padding:1px 6px;" onclick="mmelAnalyze(\'' + it.id + '\'); renderMmelPage();" title="re-run the checks against the live model">↻</button> ' +
                (it.state !== 'approved' ? '<button class="ckpt-m-btn" style="font-size:10.5px; padding:1px 6px;" onclick="mmelAdvance(\'' + it.id + '\')">→</button> ' : '') +
                '<button class="node-delete-btn-inner" style="font-size:11px;" onclick="mmelDelete(\'' + it.id + '\')">✕</button></td></tr>';
        });
        html += '</tbody></table></div>' +
            '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">Categories: B = 3 · C = 10 · D = 120 consecutive calendar days; A as specified in remarks. ' +
            'The protection check cannot be argued with — an item in an order-1/2 cut set of a Catastrophic thread does not enter the MEL, however inconvenient. ' +
            'TLD suggestion assumes the dispatched configuration may consume the stated share of the probability budget — the AUTHORITY agrees the share, the tool only computes its consequence. Re-run ↻ after model changes; analyses do not silently go stale.</p>';
        host.innerHTML = html;
    }

    // ------------------------------------------------- navigation wrapper
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._mmelWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-mmel');
                if (v) v.style.display = (tabId === 'mmel') ? 'block' : 'none';
                const s = document.getElementById('snav-mmel');
                if (s) s.classList.toggle('snav-active', tabId === 'mmel');
                if (tabId === 'mmel') renderMmelPage();
            } catch (_) {}
            return r;
        };
        wrapped._mmelWrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------ exports
    window.renderMmelPage = renderMmelPage;
    window.mmelAdd = mmelAdd;
    window.mmelAdvance = mmelAdvance;
    window.mmelProc = mmelProc;
    window.mmelDelete = mmelDelete;
    window.mmelDerive = mmelDerive;
    window.mmelAnalyze = mmelAnalyze;
    window._mmelStore = _store;
    window._mmelProtection = _protection;
    window._mmelQuantitative = _quantitative;
})();
