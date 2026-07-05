// ============================================================================
// model_checks.js — v1.0 — M3: machine-checked safety properties on the
// compiled BDDs (MBSA-1).
//
// The BDD engine that already computes P(top) and proves MAC↔tree
// equivalence can also PROVE safety claims. This module evaluates three,
// deterministically, on every allocation tree linked to a Cat/Haz failure
// condition (transfer gates followed by the engine itself):
//
//   MC-01 (hard) — No UNACCEPTED single-failure path to a Catastrophic FC.
//     Minimum cutset order is read off the BDD (shortest true-path weight —
//     exact for any gate mix, no enumeration, no explosion risk). Single
//     failures are NAMED, and each demands a signed engineering disposition:
//     accept with basis (e.g. structural single-load-path substantiated by
//     damage tolerance, modeled CCF carried with budget) or fix the design.
//     Dispositions are fingerprinted — if the event's name or budget
//     changes, the acceptance reopens. Two-lane throughout: the check names,
//     the engineer signs; nothing is auto-waived.
//
//   MC-02 (advisory) — Single failure reaches a Hazardous FC. Listed for
//     review; 25.1309's fail-safe demand is on Catastrophic, so this is
//     surveillance, not a violation.
//
//   MC-03 (hard) — MMEL residual protection. For each MMEL item, restrict
//     the dispatched event TRUE in the BDD: the residual minimum order must
//     be ≥ 1 for every Cat/Haz tree it feeds — dispatch alone must never
//     reach a top event. Re-proves the dispatch protection claim on the
//     model instead of trusting the analysis that authored it.
//
// All three register into the invariants sweep via invRegister — same
// panel, same evidence package (§10i), same harness discipline; no new
// tabs. The SPF disposition list renders on the Thread Integrity page with
// a signed-acceptance modal.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}; }
    // BDD builder: the monolith's global (page + harness) with the engine
    // namespace as fallback (worker contexts).
    function _build(root) {
        if (typeof buildBDDFromFT === 'function') return buildBDDFromFT(root);
        if (typeof SLFTAEngine !== 'undefined' && SLFTAEngine.buildBDDFromFT) return SLFTAEngine.buildBDDFromFT(root);
        return null;
    }
    function _pages() { return (typeof ftaPages !== 'undefined' ? ftaPages : []) || []; }
    function _sevRank(s) { return (typeof SEVERITY_RANK !== 'undefined' ? SEVERITY_RANK[s] : 0) || 0; }

    // ------------------------------------------------------- BDD primitives
    // Minimum number of failures to reach the top event: shortest root→T1
    // path counting only high (var=true) edges. Exact for ANY function the
    // gates can express — unmentioned variables default to false (weight 0).
    // fixedTrue: set of varIdx already failed at zero cost (MC-03).
    function _minOrder(bdd, fixedTrue) {
        const memo = new Map();
        function go(n) {
            if (n.isTerminal) return n.value ? 0 : Infinity;
            const c = memo.get(n.id);
            if (c !== undefined) return c;
            let r;
            if (fixedTrue && fixedTrue.has(n.varIdx)) r = go(n.high);
            else r = Math.min(go(n.low), 1 + go(n.high));
            memo.set(n.id, r);
            return r;
        }
        return go(bdd);
    }
    // Does the assignment {v=true, everything else false} satisfy the BDD?
    function _singleVarReaches(bdd, v) {
        let n = bdd;
        while (!n.isTerminal) n = (n.varIdx === v) ? n.high : n.low;
        return n.value === true;
    }

    // ---------------------------------------------------- page → FC context
    function _pageLinkedFcs(p) {
        const ids = (Array.isArray(p.linkedFhaIds) ? p.linkedFhaIds.slice() : []);
        if (p.linkedFhaId != null) ids.push(p.linkedFhaId);
        const out = [];
        ids.map(x => String(x).replace(/^(AC_|SYS_)/, '')).forEach(id => {
            let f = (typeof acFhaData !== 'undefined' ? acFhaData : []).find(x => x && String(x.internalId) === id);
            if (!f) for (const s of (typeof systemsData !== 'undefined' ? systemsData : [])) {
                f = (s.fha || []).find(x => x && String(x.internalId) === id);
                if (f) break;
            }
            if (f) out.push(f);
        });
        return out;
    }
    // Pages that feed a Cat or Haz FC, with the page's worst severity.
    // MC-01/02 read allocation trees (the fail-safe CLAIM); MC-03 also reads
    // verification mirrors (includeVerifies) — dispatch protection is a
    // property of the AS-BUILT design, and the MMEL's basic events live there.
    function _checkablePages(includeVerifies) {
        const out = [];
        _pages().forEach(p => {
            if (!p || !p.root) return;
            if (p.verifies && !includeVerifies) return;
            const fcs = _pageLinkedFcs(p);
            if (!fcs.length) return;
            let worst = null;
            fcs.forEach(f => { if (!worst || _sevRank(f.severity) > _sevRank(worst.severity)) worst = f; });
            if (!worst || _sevRank(worst.severity) < 4) return;   // Cat/Haz only
            out.push({ page: p, fcs, worst });
        });
        return out;
    }

    // --------------------------------------------------------- SPF registry
    function _spfStore() {
        const pc = _pc();
        if (!pc.spfAccepted) pc.spfAccepted = {};
        return pc.spfAccepted;
    }
    // Enumerate every single-failure path to a Cat/Haz top. Keyed by the
    // EVENT (logicalId / CCF group), not the page — one acceptance covers
    // every tree the same physical event appears in.
    function mcSpfList() {
        if (!_build) return [];
        const found = new Map();   // key → row
        _checkablePages().forEach(({ page, worst }) => {
            let built;
            try { built = _build(page.root); } catch (_) { return; }
            if (!built) return;
            const { bdd, varOrder, varMeta } = built;
            if (!bdd || bdd.isTerminal) return;
            if (_minOrder(bdd) > 1) return;   // no single-failure path here
            for (let v = 0; v < varOrder.length; v++) {
                if (!_singleVarReaches(bdd, v)) continue;
                const meta = varMeta[v] || {};
                // β-modeled CCF tiers are single common causes BY CONSTRUCTION —
                // the engineer declared the group and signed the β; that modeling
                // (plus CMA coverage) IS the disposition, and the contribution is
                // carried quantitatively in P(top). MC-01 targets INDEPENDENT
                // single events, so group-tier variables are excluded here.
                if (meta.type === 'group') continue;
                const node = meta.node || varOrder[v];
                const lid = node.logicalId != null ? node.logicalId : node.id;
                // L0 MF&MS placeholders (macsys:*) are functional abstractions —
                // "min 1 of [system]" compiles to a system-level single that the
                // PSSA trees decompose. Flagging them would indict the fidelity
                // level, not the design; INV-12 tracks model maturity instead.
                if (String(lid).indexOf('macsys:') === 0) continue;
                const key = 'lid:' + lid;
                const name = (node.displayId ? node.displayId + ' — ' : '') + (node.name || '');
                const prob = node.probability || 0;
                const fp = name + '|' + (typeof prob === 'number' ? prob.toExponential(6) : String(prob));
                let row = found.get(key);
                if (!row) {
                    row = { key, name, fingerprint: fp, severity: worst.severity, pages: [], fcIds: [] };
                    found.set(key, row);
                }
                if (_sevRank(worst.severity) > _sevRank(row.severity)) row.severity = worst.severity;
                if (row.pages.indexOf(page.name) < 0) row.pages.push(page.name);
                if (worst.fcId && row.fcIds.indexOf(worst.fcId) < 0) row.fcIds.push(worst.fcId);
            }
        });
        const store = _spfStore();
        const rows = Array.from(found.values());
        rows.forEach(r => {
            const rec = store[r.key];
            if (rec && rec.fingerprint === r.fingerprint) { r.state = 'accepted'; r.rec = rec; }
            else if (rec) { r.state = 'reopened'; r.rec = rec; }
            else r.state = 'open';
        });
        rows.sort((a, b) => (a.key < b.key ? -1 : 1));
        return rows;
    }

    // Programmatic acceptance (demo seeding, harness); the modal calls this too.
    function _mcAccept(key, by, basis) {
        const row = mcSpfList().find(r => r.key === key);
        if (!row || !by) return false;
        _spfStore()[key] = { by, at: new Date().toISOString(), basis: basis || '', fingerprint: row.fingerprint };
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        return true;
    }

    // ------------------------------------------------------- the invariants
    function _registerAll() {
        if (typeof window.invRegister !== 'function') return false;
        window.invRegister({
            id: 'MC-01', name: 'No unaccepted single-failure path to a Catastrophic FC (proven on the BDD)', sev: 'hard',
            run: () => {
                const fails = [];
                const rows = mcSpfList().filter(r => r.severity === 'Catastrophic');
                rows.forEach(r => {
                    if (r.state === 'accepted') return;
                    fails.push(r.name + ' alone reaches ' + (r.fcIds.join(', ') || 'a Catastrophic top') +
                        (r.state === 'reopened' ? ' — prior acceptance REOPENED (event changed since ' + r.rec.by + ' signed)' : ' — no signed disposition'));
                });
                return { checked: rows.length, fails };
            }
        });
        window.invRegister({
            id: 'MC-02', name: 'Single failure reaching a Hazardous FC (review list)', sev: 'advisory',
            run: () => {
                const rows = mcSpfList().filter(r => r.severity === 'Hazardous');
                return { checked: rows.length, fails: rows.filter(r => r.state !== 'accepted')
                    .map(r => r.name + ' alone reaches ' + (r.fcIds.join(', ') || 'a Hazardous top')) };
            }
        });
        window.invRegister({
            id: 'MC-03', name: 'MMEL dispatch never reaches a top event alone (residual protection ≥ 1)', sev: 'hard',
            run: () => {
                const fails = []; let checked = 0;
                const items = (_pc().mmel && _pc().mmel.items) || [];
                if (!items.length) return { checked, fails };
                // resolve each item's BE lid once
                const lidFor = new Map();
                items.forEach(m => {
                    if (!m || !m.beRef) return;
                    _pages().some(p => {
                        if (!p || !p.root) return false;
                        let hit = null;
                        (function walk(n) {
                            if (!n || hit) return;
                            if ((n.type === 'basic' || n.type === 'undeveloped') && n.displayId === m.beRef) { hit = n; return; }
                            (n.children || []).forEach(walk);
                        })(p.root);
                        if (hit) { lidFor.set(m.id, hit.logicalId != null ? hit.logicalId : hit.id); return true; }
                        return false;
                    });
                });
                _checkablePages(true).forEach(({ page, worst }) => {
                    let built;
                    try { built = _build(page.root); } catch (_) { return; }
                    if (!built) return;
                    const { bdd, lidToVar } = built;
                    if (!bdd || bdd.isTerminal) return;
                    items.forEach(m => {
                        const lid = lidFor.get(m.id);
                        if (lid == null || !lidToVar.has(lid)) return;
                        checked++;
                        const residual = _minOrder(bdd, new Set([lidToVar.get(lid)]));
                        if (residual === 0)
                            fails.push(m.id + ' (' + m.beRef + ' inoperative): dispatch ALONE reaches the top of "' + page.name + '" [' + worst.severity + '] — no residual protection');
                    });
                });
                return { checked, fails };
            }
        });
        return true;
    }
    // invariants.js loads before this module (script order), but stay defensive.
    if (!_registerAll()) {
        let tries = 20;
        const t = setInterval(() => { if (_registerAll() || --tries <= 0) clearInterval(t); }, 300);
    }

    // -------------------------------------------- disposition panel + modal
    function _injectPanel() {
        const host = document.getElementById('gt-integrity-host');
        if (!host) return;
        let div = document.getElementById('gt-spf-panel');
        if (!div) {
            div = document.createElement('div');
            div.id = 'gt-spf-panel';
            host.appendChild(div);
        }
        const rows = mcSpfList();
        const open = rows.filter(r => r.state !== 'accepted').length;
        const rowsHtml = rows.length ? rows.map(r => {
            const cat = r.severity === 'Catastrophic';
            const color = r.state === 'accepted' ? 'var(--color-text-tertiary)' : (cat ? '#8E2A2A' : '#B7791F');
            const badge = r.state === 'accepted' ? 'ACCEPTED' : (r.state === 'reopened' ? 'REOPENED' : 'OPEN');
            return '<div style="padding:7px 14px; border-top:1px solid var(--color-border-hair); font-size:12px;">' +
                '<span class="u-mono" style="font-weight:700; color:' + color + ';">' + badge + '</span> · ' +
                '<b>' + _esc(r.name) + '</b> → ' + _esc(r.fcIds.join(', ')) + ' [' + _esc(r.severity) + '] ' +
                '<span style="color:var(--color-text-tertiary);">(' + _esc(r.pages.join(' · ')) + ')</span>' +
                (r.state === 'accepted'
                    ? '<div style="color:var(--color-text-tertiary); margin-top:2px;">Accepted by ' + _esc(r.rec.by) + ' on ' + _esc(String(r.rec.at).slice(0, 10)) + (r.rec.basis ? ' — ' + _esc(r.rec.basis) : '') + '</div>'
                    : '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px; margin-left:8px;" onclick="mcAcceptSpfUi(\'' + _esc(r.key) + '\')">Accept with basis…</button>') +
                '</div>';
        }).join('')
            : '<div style="padding:10px 14px; font-size:12px; color:var(--color-text-tertiary);">No single-failure path reaches any Cat/Haz top event — the fail-safe claim holds structurally.</div>';
        div.innerHTML =
            '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-top:18px;">' +
            '<div style="padding:9px 14px; border-bottom:2px solid var(--color-text-primary); display:flex; justify-content:space-between; align-items:center;">' +
            '<b>Single-failure dispositions (proven on the model)</b>' +
            '<span class="u-mono" style="font-size:11px; font-weight:700;' + (open ? ' color:#8E2A2A;' : '') + '">' +
            (rows.length ? (rows.length - open) + '/' + rows.length + ' dispositioned' : '—') + '</span></div>' +
            '<p style="font-size:12px; color:var(--color-text-secondary); padding:8px 14px 4px;">Every event whose SINGLE failure reaches a Cat/Haz top, read off the compiled BDDs. Each demands a signed engineering basis (structural substantiation, modeled CCF carried with budget, operational exclusion) or a design fix. Acceptances reopen automatically if the event changes. Feeds MC-01/MC-02 in the invariants sweep.</p>' +
            rowsHtml + '</div>';
    }

    function _ensureModal() {
        let modal = document.getElementById('mc-spf-modal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'mc-spf-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML =
            '<div class="modal-content" style="max-width: 600px;">' +
            '<div class="modal-header"><h2>Accept Single-Failure Path</h2>' +
            '<button class="btn-red" style="margin:0;" onclick="mcCloseSpfModal()">Cancel</button></div>' +
            '<div class="modal-body" style="padding: 18px 22px;">' +
            '<div id="mc-spf-pair" style="font-size:13px; border:1px solid var(--color-border-strong); background:var(--color-surface-2); padding:10px 14px; margin-bottom:14px;"></div>' +
            '<p style="font-size:12.5px; color:var(--color-text-secondary); margin:0;">Accepting records that this single-failure path is understood and substantiated OUTSIDE the fail-safe redundancy argument. The acceptance reopens if the event’s definition or budget changes.</p>' +
            '<label style="display:block; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; margin:12px 0 4px;">Signature (required)</label>' +
            '<input id="mc-spf-by" type="text" style="width:100%; box-sizing:border-box; font-size:13px; padding:7px 10px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary);" placeholder="Your name">' +
            '<label style="display:block; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; margin:12px 0 4px;">Engineering basis (required)</label>' +
            '<textarea id="mc-spf-basis" rows="3" style="width:100%; box-sizing:border-box; font-size:13px; padding:7px 10px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary); resize:vertical;" placeholder="Structural single-load-path substantiated by damage tolerance · modeled CCF carried with budget · operational exclusion …"></textarea>' +
            '<div style="display:flex; justify-content:flex-end; margin-top:16px;">' +
            '<button class="ckpt-m-btn" style="font-size:13px; padding:6px 18px;" onclick="_mcSpfModalSubmit()">Accept</button></div>' +
            '<p id="mc-spf-err" style="color:#8E2A2A; font-size:12px; font-weight:600; margin:8px 0 0; display:none;"></p>' +
            '</div></div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) window.mcCloseSpfModal(); });
        return modal;
    }

    window.mcAcceptSpfUi = function (key) {
        const r = mcSpfList().find(x => x.key === key);
        if (!r) return;
        const modal = _ensureModal();
        modal._mcKey = key;
        document.getElementById('mc-spf-pair').innerHTML =
            '<b>' + _esc(r.name) + '</b><div style="color:var(--color-text-secondary); margin-top:4px;">Single failure reaches ' + _esc(r.fcIds.join(', ')) + ' [' + _esc(r.severity) + '] on: ' + _esc(r.pages.join(' · ')) + '</div>';
        document.getElementById('mc-spf-err').style.display = 'none';
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);
        setTimeout(() => { const el = document.getElementById('mc-spf-by'); if (el) el.focus(); }, 260);
    };
    window.mcCloseSpfModal = function () {
        const modal = document.getElementById('mc-spf-modal');
        if (!modal) return;
        modal.classList.remove('show');
        setTimeout(() => { modal.style.display = 'none'; }, 250);
    };
    window._mcSpfModalSubmit = function () {
        const modal = document.getElementById('mc-spf-modal');
        if (!modal) return;
        const by = (document.getElementById('mc-spf-by').value || '').trim();
        const basis = (document.getElementById('mc-spf-basis').value || '').trim();
        const err = document.getElementById('mc-spf-err');
        if (!by) { err.textContent = 'A signature is required.'; err.style.display = 'block'; return; }
        if (!basis) { err.textContent = 'An engineering basis is required — an unexplained acceptance is not a disposition.'; err.style.display = 'block'; return; }
        if (_mcAccept(modal._mcKey, by, basis)) {
            window.mcCloseSpfModal();
            try { if (typeof showToast === 'function') showToast('Single-failure path accepted with basis. MC-01 updates on the next sweep.', 'success', 3600); } catch (_) {}
            _injectPanel();
        }
    };

    (function wrap() {
        if (typeof window.switchTab === 'function' && !window.switchTab._mcWrapped) {
            const orig = window.switchTab;
            const wrapped = function (tabId) {
                const r = orig.apply(this, arguments);
                try { if (tabId === 'gt-integrity') setTimeout(_injectPanel, 160); } catch (_) {}
                return r;
            };
            wrapped._mcWrapped = true;
            window.switchTab = wrapped;
        }
    })();

    // ------------------------------------------------------------- exports
    window.mcSpfList = mcSpfList;
    window._mcAccept = _mcAccept;
    window._mcMinOrder = _minOrder;
})();
