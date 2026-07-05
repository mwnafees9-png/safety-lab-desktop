/*!
 * Safety Lab Aero — OOS Independence module
 * EASA AI Concept Paper Proposed Issue 03 (June 2026) — Operational Oversight System (OOS).
 *
 * OPT-IN / FLAG-GATED. NET-NEW: this file ADDS capability without modifying the
 * deterministic engine or any existing analysis. Nothing here authors a number,
 * probability, severity, or DAL. The independence VERDICT is pure boolean logic over
 * (a) the independence matrix, (b) the interface model, and (c) shared-resource / CMA
 * couplings — NEVER an AI judgement. A later phase (OOS-6) may let the assurance agent
 * DRAFT analysis prose, gated and advisory only; it can never assert independence as fact.
 *
 * This module mirrors the OOS principle it serves: the verdict that bounds the AI is
 * itself produced by deterministic logic that is independent of any AI.
 *
 * Phase OOS-1 (#88): data model (system.role tag, oosClaims CRUD, lazy migration guards)
 *                    + the deterministic independence verdict engine (pure functions).
 *
 * Copyright © 2026. All rights reserved. Patent pending.
 */
(function () {
    'use strict';

    // ------------------------------------------------------------------
    // Catalog — technological common-mode factors.
    // Each maps to a CMA common-mode category; demonstrating independence means
    // showing the OOS shares NONE of these with the primary AI.
    // ------------------------------------------------------------------
    var TECH_FACTORS = [
        { key: 'model_weights',    label: 'Shared model / weights' },
        { key: 'training_data',    label: 'Shared training data' },
        { key: 'software_stack',   label: 'Shared software stack / libraries' },
        { key: 'hardware_compute', label: 'Shared hardware / compute' },
        { key: 'sensors_inputs',   label: 'Shared sensors / inputs' },
        { key: 'power',            label: 'Shared power' },
        { key: 'comms_bus',        label: 'Shared comms / data bus' },
        { key: 'dev_process',      label: 'Shared dev team / process' },
        { key: 'environment',      label: 'Shared environment / installation' },
        { key: 'maintenance',      label: 'Shared maintenance' }
    ];

    var ROLES = { PRIMARY: 'primary-ai', OOS: 'oos' };
    var FACTOR_STATUS = { INDEPENDENT: 'independent', COUPLED: 'coupled', TBD: 'tbd' };
    var VERDICT = { DEMONSTRATED: 'demonstrated', NOT: 'not-demonstrated' };

    // ------------------------------------------------------------------
    // Guarded global accessors — never throw, work in-browser or in node (for tests).
    // These ARE the migration guards: oosClaims is lazily created, and a missing
    // system.role is tolerated as null. No edit to the host file is required.
    // ------------------------------------------------------------------
    function _systems() {
        try {
            if (typeof systemsData !== 'undefined' && Array.isArray(systemsData)) return systemsData;
            if (typeof window !== 'undefined' && Array.isArray(window.systemsData)) return window.systemsData;
        } catch (_) {}
        return [];
    }
    function _cfg() {
        try {
            if (typeof projectConfig !== 'undefined' && projectConfig) return projectConfig;
            if (typeof window !== 'undefined' && window.projectConfig) return window.projectConfig;
        } catch (_) {}
        return null;
    }
    function _interfaces() { var c = _cfg(); return (c && Array.isArray(c.interfaces)) ? c.interfaces : []; }
    function _resources() { try { if (typeof resourcesData !== 'undefined' && Array.isArray(resourcesData)) return resourcesData; if (typeof window !== 'undefined' && Array.isArray(window.resourcesData)) return window.resourcesData; } catch (_) {} return []; }
    function _cmaData() { try { if (typeof cmaData !== 'undefined' && Array.isArray(cmaData)) return cmaData; if (typeof window !== 'undefined' && Array.isArray(window.cmaData)) return window.cmaData; } catch (_) {} return []; }
    function _claims() { var c = _cfg(); if (!c) return []; if (!Array.isArray(c.oosClaims)) c.oosClaims = []; return c.oosClaims; }  // lazy migration guard
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }
    function _sysById(id) { var s = _systems(); for (var i = 0; i < s.length; i++) { if (s[i] && s[i].id === id) return s[i]; } return null; }
    function _sysName(id) { var s = _sysById(id); return s ? (s.name || id) : (id || '—'); }
    function _uid(p) { return (p || 'oos') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }

    // ------------------------------------------------------------------
    // Roles — system.role tag on existing systemsData objects. Additive optional
    // field; readers tolerate undefined (treated as null). Only the two known roles
    // (or null to clear) are accepted; anything else is rejected.
    // ------------------------------------------------------------------
    function getRole(systemId) { var s = _sysById(systemId); return (s && s.role) ? s.role : null; }
    function setRole(systemId, role) {
        var s = _sysById(systemId); if (!s) return null;
        if (role !== ROLES.PRIMARY && role !== ROLES.OOS && role !== null) return null;
        s.role = role; _save(); return s.role;
    }
    function clearRole(systemId) { return setRole(systemId, null); }
    function listByRole(role) { return _systems().filter(function (s) { return s && s.role === role; }); }

    // ------------------------------------------------------------------
    // Independence claims — one per primary-AI ↔ OOS pair.
    // Shape:
    //   { id, primarySystemId, oosSystemId, safetyFunction,
    //     functional: { relianceEdges:[], status },      // status is operator-set context; the
    //                                                     // verdict derives reliance from the interface model
    //     technological: { factors:[{factor,status,justification,evidenceRef}] },
    //     residualCouplings: [{ id, ref, justification, accepted:bool }],
    //     acceptance: null | { by, ts, note },
    //     createdTs }
    // ------------------------------------------------------------------
    function _newFactors() {
        return TECH_FACTORS.map(function (f) {
            return { factor: f.key, status: FACTOR_STATUS.TBD, justification: '', evidenceRef: '' };
        });
    }
    function addClaim(opts) {
        opts = opts || {};
        if (!opts.primarySystemId || !opts.oosSystemId) return null;
        if (opts.primarySystemId === opts.oosSystemId) return null;   // a system cannot be its own OOS
        var c = _cfg(); if (!c) return null;
        // one claim per ordered pair
        var existing = _claims().filter(function (x) { return x && x.primarySystemId === opts.primarySystemId && x.oosSystemId === opts.oosSystemId; })[0];
        if (existing) return existing;
        var claim = {
            id: _uid('oosc'),
            primarySystemId: opts.primarySystemId,
            oosSystemId: opts.oosSystemId,
            safetyFunction: opts.safetyFunction || '',
            functional: { relianceEdges: [], status: FACTOR_STATUS.TBD },
            technological: { factors: _newFactors() },
            residualCouplings: [],
            acceptance: null,
            createdTs: Date.now()
        };
        _claims().push(claim); _save(); return claim;
    }
    function getClaim(id) { var a = _claims(); for (var i = 0; i < a.length; i++) { if (a[i] && a[i].id === id) return a[i]; } return null; }
    function listClaims() { return _claims().slice(); }
    function removeClaim(id) {
        var c = _cfg(); if (!c || !Array.isArray(c.oosClaims)) return false;
        var n = c.oosClaims.length;
        c.oosClaims = c.oosClaims.filter(function (x) { return x && x.id !== id; });
        if (c.oosClaims.length !== n) { _save(); return true; }
        return false;
    }
    function setFactor(claimId, factorKey, status, justification, evidenceRef) {
        var cl = getClaim(claimId); if (!cl) return null;
        if ([FACTOR_STATUS.INDEPENDENT, FACTOR_STATUS.COUPLED, FACTOR_STATUS.TBD].indexOf(status) < 0) return null;
        if (!cl.technological || !Array.isArray(cl.technological.factors)) return null;
        var f = cl.technological.factors.filter(function (x) { return x.factor === factorKey; })[0];
        if (!f) return null;
        f.status = status;
        if (justification != null) f.justification = String(justification);
        if (evidenceRef != null) f.evidenceRef = String(evidenceRef);
        _save(); return f;
    }
    // Record/clear formal acceptance of a residual coupling (so a known, justified
    // coupling can be excluded from the open-common-mode test). Acceptance is an
    // operator decision captured as evidence — not an AI action.
    function acceptResidual(claimId, ref, justification, by) {
        var cl = getClaim(claimId); if (!cl || !ref) return null;
        if (!Array.isArray(cl.residualCouplings)) cl.residualCouplings = [];
        var rc = cl.residualCouplings.filter(function (x) { return x && x.ref === ref; })[0];
        if (!rc) { rc = { id: _uid('rc'), ref: ref, justification: '', accepted: false }; cl.residualCouplings.push(rc); }
        rc.accepted = true;
        if (justification != null) rc.justification = String(justification);
        rc.by = by || null; rc.ts = Date.now();
        _save(); return rc;
    }

    // ------------------------------------------------------------------
    // OOS-3 (#90) — pair-scoped CMA. Deterministic enumeration of shared-resource
    // common-cause candidates coupling the primary↔OOS pair, drawn from three
    // EXISTING stores (no new analysis is invented):
    //   • interface model — edges of kind 'resource' between the two systems
    //   • resource model  — resources both systems are wired to (providedBy)
    //   • CMA store        — CMA entries owning BOTH systems (open ones only)
    // Accepted residuals and Mitigated/Closed CMA entries are excluded. Authors no
    // number or severity — it only classifies couplings.
    // Pure: pass opts.interfaces / opts.resources / opts.cma to run without globals.
    // ------------------------------------------------------------------
    function _pairCmaScan(claim, opts) {
        opts = opts || {};
        var interfaces = Array.isArray(opts.interfaces) ? opts.interfaces : _interfaces();
        var resources  = Array.isArray(opts.resources)  ? opts.resources  : _resources();
        var cma        = Array.isArray(opts.cma)         ? opts.cma         : _cmaData();
        if (!claim) return { candidates: [], open: [], accepted: [] };
        var primary = claim.primarySystemId, oos = claim.oosSystemId;
        var pair = {}; pair[primary] = 1; pair[oos] = 1;
        var accepted = {};
        (claim.residualCouplings || []).forEach(function (rc) { if (rc && rc.accepted && rc.ref) accepted[rc.ref] = true; });
        var cands = [];
        // A) interface resource edges coupling the pair
        interfaces.forEach(function (e) {
            if (e && e.kind === 'resource' && pair[e.fromSystemId] && pair[e.toSystemId] && e.fromSystemId !== e.toSystemId) {
                cands.push({ id: e.id, source: 'interface', ref: e.resourceId || e.id, label: 'Interface resource edge' + (e.resourceId ? ' (' + e.resourceId + ')' : ' ' + e.id) });
            }
        });
        // B) resources both systems are wired to (providedBy)
        resources.forEach(function (r) {
            if (!r) return;
            var prov = Array.isArray(r.providedBy) ? r.providedBy : [];
            if (prov.indexOf(primary) >= 0 && prov.indexOf(oos) >= 0) {
                var ref = r.resId || r.internalId;
                cands.push({ id: 'res:' + ref, source: 'resource', ref: ref, label: (r.name || ref) + (r.type ? ' (' + r.type + ')' : '') });
            }
        });
        // C) existing CMA entries owning BOTH systems (open only)
        cma.forEach(function (c) {
            if (!c) return;
            var owners = Array.isArray(c.owningSystemIds) ? c.owningSystemIds : (c.owningSystemId ? [c.owningSystemId] : []);
            if (owners.indexOf(primary) >= 0 && owners.indexOf(oos) >= 0) {
                var st = c.status || 'Open';
                var mitigated = (st === 'Mitigated' || st === 'Closed — Accepted');
                cands.push({ id: 'cma:' + (c.cmaId || c.internalId), source: 'cma', ref: (c.cmaId || c.internalId), label: (c.cmaId || ('CMA#' + c.internalId)) + ' — ' + (c.subject || c.sharedResource || 'common mode'), mitigated: mitigated });
            }
        });
        var seen = {}, uniq = [];
        cands.forEach(function (c) { if (!seen[c.id]) { seen[c.id] = 1; uniq.push(c); } });
        var open = uniq.filter(function (c) { return !accepted[c.id] && !accepted[c.ref] && !c.mitigated; });
        var acc  = uniq.filter(function (c) { return accepted[c.id] || accepted[c.ref] || c.mitigated; });
        return { candidates: uniq, open: open, accepted: acc };
    }

    // ==================================================================
    // DETERMINISTIC VERDICT ENGINE — the boundary.
    //
    // independence = DEMONSTRATED  iff
    //     (1) every technological factor === 'independent'                  (no coupled, no tbd)
    //   AND (2) no functional-reliance edge OOS → primary-AI exists         (OOS must not depend on the AI)
    //   AND (3) no OPEN shared-resource common-mode couples the pair        (open = not formally accepted)
    //
    // Any coupled/tbd factor, any reliance edge, or any open shared-resource common-mode
    // ⇒ NOT-DEMONSTRATED. This is logic over the matrix + interface model — never an AI
    // judgement, and it authors no numeric/severity/DAL value.
    //
    // Pure: pass opts.interfaces to evaluate without globals (used by unit tests).
    // ==================================================================
    function computeVerdict(claim, opts) {
        opts = opts || {};
        var interfaces = Array.isArray(opts.interfaces) ? opts.interfaces : _interfaces();
        var reasons = [];
        if (!claim) {
            return { verdict: VERDICT.NOT, reasons: [{ type: 'claim', problem: 'no claim' }],
                     technological: { independent: false }, functional: { independent: false }, cma: { independent: false } };
        }
        var primary = claim.primarySystemId, oos = claim.oosSystemId;

        // (1) Technological factors
        var factors = (claim.technological && claim.technological.factors) || [];
        var coupled = factors.filter(function (f) { return f.status === FACTOR_STATUS.COUPLED; });
        var tbd = factors.filter(function (f) { return f.status === FACTOR_STATUS.TBD; });
        var techOk = factors.length > 0 && coupled.length === 0 && tbd.length === 0;
        coupled.forEach(function (f) { reasons.push({ type: 'technological', factor: f.factor, problem: 'coupled' }); });
        tbd.forEach(function (f) { reasons.push({ type: 'technological', factor: f.factor, problem: 'not yet assessed (tbd)' }); });

        // (2) Functional reliance: OOS depends on primary  → kind 'functional', from = oos, to = primary
        var relEdges = interfaces.filter(function (e) {
            return e && e.kind === 'functional' && e.fromSystemId === oos && e.toSystemId === primary;
        });
        var funcOk = relEdges.length === 0;
        relEdges.forEach(function (e) { reasons.push({ type: 'functional', edgeId: e.id, problem: 'OOS relies on primary-AI' }); });

        // (3) Shared-resource common-modes coupling the pair — pair-scoped CMA (#90)
        //     over the interface model + resource model + existing CMA entries.
        var scan = _pairCmaScan(claim, { interfaces: interfaces, resources: opts.resources, cma: opts.cma });
        var cmaOk = scan.open.length === 0;
        scan.open.forEach(function (c) { reasons.push({ type: 'cma', candidateId: c.id, source: c.source, problem: 'open shared-resource common-mode — ' + c.label }); });

        var demonstrated = techOk && funcOk && cmaOk;
        return {
            verdict: demonstrated ? VERDICT.DEMONSTRATED : VERDICT.NOT,
            reasons: reasons,
            technological: { independent: techOk, coupled: coupled.length, tbd: tbd.length, total: factors.length },
            functional: { independent: funcOk, relianceEdges: relEdges.map(function (e) { return e.id; }) },
            cma: { independent: cmaOk, openCommonModes: scan.open.map(function (c) { return c.id; }), accepted: scan.accepted.map(function (c) { return c.id; }), candidates: scan.candidates.length }
        };
    }
    function verdictFor(claimId, opts) { return computeVerdict(getClaim(claimId), opts); }

    // OOS-3 — persist the deterministic verdict onto the claim as a 'compromised'
    // flag + reasons, mirroring the existing requirement-compromise pattern, so the
    // state can be surfaced elsewhere (badge, safety case). Computes, then writes.
    function evaluateClaim(claimId, opts) {
        var cl = getClaim(claimId); if (!cl) return null;
        var v = computeVerdict(cl, opts);
        cl.compromised = (v.verdict !== VERDICT.DEMONSTRATED);
        cl.compromiseReasons = (v.reasons || []).map(function (r) {
            var detail = r.problem || '';
            if (r.factor) detail = _factorLabel(r.factor) + ' — ' + detail;
            return { kind: r.type, detail: detail };
        });
        cl.lastVerdict = v.verdict; cl.lastEvaluated = Date.now();
        _save();
        return v;
    }

    // ------------------------------------------------------------------
    // OOS-4 (#91) — deterministic independence-requirement generation.
    // Pure templates filled from the claim; STATUS is derived from the matrix,
    // interface model and CMA — never authored. No AI. Generated on demand so it
    // always reflects current state. Pass opts to run without globals (tests).
    // ------------------------------------------------------------------
    function generateRequirements(claim, opts) {
        if (!claim) return [];
        var v = computeVerdict(claim, opts);
        var scan = _pairCmaScan(claim, opts);
        var sid = String(claim.id || 'claim').replace(/[^a-z0-9]/gi, '').slice(-6) || 'claim';
        var sf = claim.safetyFunction ? (' for “' + claim.safetyFunction + '”') : '';
        var reqs = [];
        function add(o) { reqs.push(o); }
        // 1) overarching independence claim
        add({ id: 'OOSR-' + sid + '-claim', kind: 'general', text: 'The Operational Oversight System (OOS) shall be independent — functionally and technologically — from the primary AI' + sf + '.', rationale: 'EASA AI Concept Paper Issue 03 — the system bounding the primary AI must be additional and independent.', status: v.verdict === VERDICT.DEMONSTRATED ? 'satisfied' : 'open' });
        // 2) technological — "no shared X", one per factor
        (claim.technological && claim.technological.factors || []).forEach(function (f) {
            var thing = _factorLabel(f.factor).replace(/^Shared\s+/i, '');
            add({ id: 'OOSR-' + sid + '-tech-' + f.factor, kind: 'technological', factor: f.factor,
                text: 'The OOS shall not share ' + thing.toLowerCase() + ' with the primary AI.',
                rationale: 'Technological independence — a shared ' + thing.toLowerCase() + ' is a common-cause path.',
                status: f.status === FACTOR_STATUS.INDEPENDENT ? 'satisfied' : (f.status === FACTOR_STATUS.COUPLED ? 'violated' : 'unverified'),
                evidenceRef: f.evidenceRef || '' });
        });
        // 3) dissimilar implementation (manual verification)
        add({ id: 'OOSR-' + sid + '-gen-dissimilar', kind: 'general', text: 'The OOS shall use a dissimilar implementation from the primary AI (different algorithm/model, toolchain, and development team).', rationale: 'Dissimilarity reduces systematic common-cause between the two systems.', status: 'manual' });
        // 4) functional — no reliance on primary
        var relEdges = (v.functional && v.functional.relianceEdges) || [];
        add({ id: 'OOSR-' + sid + '-func', kind: 'functional', text: 'The OOS shall not depend on the primary AI’s output or state to perform its oversight function' + sf + '.', rationale: 'Functional independence — the OOS must reach its verdict without trusting the system it oversees.', status: relEdges.length ? 'violated' : 'satisfied' });
        relEdges.forEach(function (eid) { add({ id: 'OOSR-' + sid + '-func-edge-' + String(eid).replace(/[^a-z0-9]/gi, ''), kind: 'functional', text: 'Remove the functional-reliance dependency (interface edge ' + eid + ') in which the OOS relies on the primary AI.', rationale: 'This reliance edge defeats functional independence.', status: 'violated' }); });
        // 5) monitored separation (manual verification)
        add({ id: 'OOSR-' + sid + '-gen-separation', kind: 'general', text: 'The OOS shall observe the primary AI across a separation boundary that the primary AI cannot influence or disable.', rationale: 'Monitored separation — the oversight path must not be corruptible by the monitored system.', status: 'manual' });
        // 6) shared-resource segregation — one per pair-scoped CMA candidate
        scan.candidates.forEach(function (c) {
            var isOpen = scan.open.indexOf(c) >= 0;
            add({ id: 'OOSR-' + sid + '-cma-' + String(c.id).replace(/[^a-z0-9]/gi, ''), kind: 'cma', source: c.source,
                text: 'Provide segregation or independent redundancy for ' + c.label + ' so its loss is not a common-cause failure across the OOS and the primary AI.',
                rationale: 'Shared-resource common-cause (' + _srcLabel(c.source) + ') coupling the pair.',
                status: isOpen ? 'open' : 'satisfied', ref: c.ref });
        });
        return reqs;
    }
    function requirementsMarkdown(claim) {
        var reqs = generateRequirements(claim);
        var pName = _sysName(claim && claim.primarySystemId), oName = _sysName(claim && claim.oosSystemId);
        var lines = ['# OOS Independence Requirements', '', '**Primary AI:** ' + pName + '  ', '**OOS:** ' + oName + (claim && claim.safetyFunction ? ('  \n**Safety function:** ' + claim.safetyFunction) : ''), ''];
        var groups = { general: 'General', technological: 'Technological independence', functional: 'Functional independence', cma: 'Shared-resource (CMA)' };
        Object.keys(groups).forEach(function (k) {
            var gr = reqs.filter(function (r) { return r.kind === k; });
            if (!gr.length) return;
            lines.push('## ' + groups[k], '');
            gr.forEach(function (r) { lines.push('- **' + r.id + '** [' + r.status.toUpperCase() + '] ' + r.text); });
            lines.push('');
        });
        return lines.join('\n');
    }

    // ==================================================================
    // OOS-2 (#89) — Independence matrix UI. Opt-in / flag-gated, default-OFF.
    // Self-contained: builds its own overlay + styles and reads the deterministic
    // engine above. The UI NEVER computes or authors a verdict — it only renders
    // computeVerdict()'s output and writes operator inputs through the CRUD.
    // ==================================================================
    var _LS = 'sl.oosEnabled';
    var _activeClaimId = null;

    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
    function isEnabled() { try { return localStorage.getItem(_LS) === '1'; } catch (_) { return false; } }
    function enableUI(on) {
        try { if (on) localStorage.setItem(_LS, '1'); else localStorage.removeItem(_LS); } catch (_) {}
        if (!on) closePanel();
        _renderLabs();
        try { if (typeof showToast === 'function') showToast(on ? 'OOS Independence (Beta) enabled' : 'OOS Independence turned off', 'info', 2200); } catch (_) {}
        return isEnabled();
    }
    function _factorLabel(key) { var f = TECH_FACTORS.filter(function (x) { return x.key === key; })[0]; return f ? f.label : key; }
    function _systemsForSelect() { return _systems().map(function (s) { return { id: s.id, name: s.name || s.id }; }); }
    function _factorStatus(claim, key) { var f = (claim.technological.factors || []).filter(function (x) { return x.factor === key; })[0]; return f ? f.status : FACTOR_STATUS.TBD; }

    // ---- opt-in Labs sidebar entry (renders into static #asb-labs-children) ----
    function _renderLabs() {
        var host = document.getElementById('asb-labs-children');
        if (!host) return;
        if (!isEnabled()) {
            host.innerHTML =
                '<div class="oos-labnote">Experimental — separate from your certification workflow.</div>' +
                '<a class="asb-item sub oos-enable" role="button" tabindex="0"><span class="asb-lbl">▸ Enable OOS Independence</span></a>' +
                '<div class="oos-labnote dim">EASA AI Concept Paper Issue 03</div>';
            var en = host.querySelector('.oos-enable'); if (en) en.addEventListener('click', function () { enableUI(true); });
        } else {
            host.innerHTML =
                '<a class="asb-item sub" id="snav-oos" role="button" tabindex="0"><span class="asb-lbl">OOS Independence</span><span class="oos-beta">Beta</span></a>' +
                '<a class="asb-item sub oos-disable" role="button" tabindex="0"><span class="asb-lbl">· turn off</span></a>';
            var op = host.querySelector('#snav-oos'); if (op) op.addEventListener('click', function () { openPanel(); });
            var di = host.querySelector('.oos-disable'); if (di) di.addEventListener('click', function () { enableUI(false); });
        }
    }

    // ---- panel ----
    function closePanel() { var o = document.getElementById('oos-overlay'); if (o && o.parentNode) o.parentNode.removeChild(o); }
    function openPanel() {
        if (!isEnabled()) return;
        _injectStyle();
        closePanel();
        var ov = document.createElement('div'); ov.id = 'oos-overlay';
        ov.addEventListener('click', function (e) { if (e.target === ov) closePanel(); });
        ov.innerHTML =
            '<div class="oos-modal" role="dialog" aria-label="OOS Independence">' +
              '<div class="oos-head">' +
                '<div class="oos-title">OOS Independence <span class="oos-beta">Beta</span></div>' +
                '<button class="oos-x" aria-label="Close">✕</button>' +
              '</div>' +
              '<div class="oos-subnote">Experimental &mdash; EASA AI Concept Paper Issue 03 (Operational Oversight System). This view is separate from your certification artifacts and changes no DAL, probability, or severity. The verdict is <b>deterministic</b> &mdash; logic over the matrix, the interface model, and shared-resource (CMA) couplings; no AI is involved.</div>' +
              '<div class="oos-body" id="oos-body"></div>' +
            '</div>';
        document.body.appendChild(ov);
        ov.querySelector('.oos-x').addEventListener('click', closePanel);
        var claims = listClaims();
        _activeClaimId = claims.length ? claims[0].id : null;
        _renderBody();
    }

    function _onPair(primaryId, oosId) {
        if (!primaryId || !oosId || primaryId === oosId) return;
        var cl = addClaim({ primarySystemId: primaryId, oosSystemId: oosId });
        if (cl) { _activeClaimId = cl.id; setRole(primaryId, ROLES.PRIMARY); setRole(oosId, ROLES.OOS); }
        _renderBody();
    }

    function _verdictHtml(v) {
        var ok = v.verdict === VERDICT.DEMONSTRATED;
        var s = '<div class="oos-verdict ' + (ok ? 'ok' : 'no') + '">' +
            '<div class="oos-vtitle">' + (ok ? '✓ Independence DEMONSTRATED' : '✕ Independence NOT demonstrated') + (ok ? '' : ' <span class="oos-compromised">compromised</span>') + '</div>' +
            '<div class="oos-vsub">' + (ok
                ? 'Every technological factor is independent, the OOS does not rely on the primary AI, and no open shared-resource common-mode couples the pair.'
                : 'Independence holds only when all three conditions below are met.') + '</div>';
        if (!ok && v.reasons && v.reasons.length) {
            s += '<ul class="oos-reasons">';
            v.reasons.forEach(function (r) {
                var label = r.type === 'technological' ? ('Technological — ' + _factorLabel(r.factor) + ' — ' + r.problem)
                    : r.type === 'functional' ? ('Functional reliance — ' + r.problem)
                    : r.type === 'cma' ? ('Shared resource — ' + r.problem)
                    : (r.problem || 'issue');
                s += '<li>' + _esc(label) + '</li>';
            });
            s += '</ul>';
        }
        return s + '</div>';
    }
    function _functionalHtml(v) {
        var edges = (v.functional && v.functional.relianceEdges) || [];
        var s = '<div class="oos-sect"><div class="oos-sect-h">Functional independence</div>';
        if (!edges.length) s += '<div class="oos-good">No functional reliance of the OOS on the primary AI was found in the interface model. ✓</div>';
        else s += '<div class="oos-bad">' + edges.length + ' functional-reliance edge(s) where the OOS depends on the primary AI — each defeats independence until re-architected: <b>' + _esc(edges.join(', ')) + '</b></div>';
        s += '<div class="oos-hint">Derived from the system interface model (functional edges OOS → primary AI). Edit interfaces in the interface model, not here.</div></div>';
        return s;
    }
    function _matrixHtml(claim) {
        var aiReady = _aiReady();
        var rows = (claim.technological.factors || []).map(function (f) {
            function optS(val, lbl) { return '<option value="' + val + '"' + (f.status === val ? ' selected' : '') + '>' + lbl + '</option>'; }
            var sel = '<select data-factor="' + _esc(f.factor) + '" data-kind="status" class="oos-fstatus st-' + _esc(f.status) + '">' +
                optS('tbd', 'TBD') + optS('independent', 'Independent') + optS('coupled', 'Coupled') + '</select>';
            var draftBtn = aiReady ? '<button class="oos-draftbtn" data-draft="' + _esc(f.factor) + '" title="Draft justification with AI — suggestion only">✨</button>' : '';
            return '<tr><td class="oos-flabel">' + _esc(_factorLabel(f.factor)) + '</td><td>' + sel + '</td>' +
                '<td class="oos-justcell"><input data-factor="' + _esc(f.factor) + '" data-kind="just" type="text" value="' + _esc(f.justification || '') + '" placeholder="justification">' + draftBtn + '</td>' +
                '<td><input data-factor="' + _esc(f.factor) + '" data-kind="ev" type="text" value="' + _esc(f.evidenceRef || '') + '" placeholder="evidence ref"></td></tr>';
        }).join('');
        return '<div class="oos-sect"><div class="oos-sect-h">Technological independence — common-mode factors</div>' +
            '<table class="oos-matrix"><thead><tr><th>Factor</th><th>Status</th><th>Justification</th><th>Evidence</th></tr></thead><tbody>' + rows + '</tbody></table>' +
            '<div class="oos-hint">Independence requires <b>every</b> factor to be <b>Independent</b>. Any <b>Coupled</b> or unassessed <b>TBD</b> factor defeats the claim.' + (aiReady ? ' <b>✨</b> drafts a justification as a <b>suggestion</b> — you Accept it; the AI never sets the status or the verdict.' : '') + '</div></div>';
    }
    function _srcLabel(src) { return src === 'interface' ? 'Interface' : src === 'resource' ? 'Resource' : src === 'cma' ? 'CMA' : src; }
    function _residualHtml(claim) {
        var scan = _pairCmaScan(claim);
        var s = '<div class="oos-sect"><div class="oos-sect-h">Shared-resource common-modes (CMA) — scoped to this pair</div>';
        if (!scan.candidates.length) {
            s += '<div class="oos-good">No shared-resource common-mode couples the pair in the interface model, resource model, or CMA. ✓</div>';
        } else {
            if (scan.open.length) {
                s += '<div class="oos-bad">Open common-cause coupling(s) defeating independence:</div><ul class="oos-reslist">';
                scan.open.forEach(function (c) {
                    s += '<li><span><span class="oos-src oos-src-' + _esc(c.source) + '">' + _srcLabel(c.source) + '</span> ' + _esc(c.label) + '</span>' +
                        '<button data-accept="' + _esc(c.id) + '" class="oos-accept">Accept…</button></li>';
                });
                s += '</ul>';
            }
            if (scan.accepted.length) {
                s += '<div class="oos-good">Accepted / mitigated coupling(s):</div><ul class="oos-reslist accepted">';
                scan.accepted.forEach(function (c) { s += '<li><span><span class="oos-src oos-src-' + _esc(c.source) + '">' + _srcLabel(c.source) + '</span> ' + _esc(c.label) + '</span><span class="oos-okmark">✓</span></li>'; });
                s += '</ul>';
            }
        }
        s += '<div class="oos-hint">Scoped CMA draws on the interface model (resource edges), the resource model (resources both systems are wired to via providedBy), and existing CMA entries owning both systems. Mitigated/Closed CMA entries and accepted residuals are excluded.</div></div>';
        return s;
    }
    function _reqStatusMeta(s) {
        return s === 'satisfied' ? { l: 'satisfied', c: '#1d9e75' }
            : s === 'violated' ? { l: 'violated', c: '#d4453a' }
            : s === 'open' ? { l: 'open', c: '#b06f00' }
            : s === 'unverified' ? { l: 'unverified', c: '#b06f00' }
            : { l: 'manual', c: '#667085' };
    }
    function _requirementsHtml(claim) {
        var reqs = generateRequirements(claim);
        var openish = reqs.filter(function (r) { return r.status === 'open' || r.status === 'violated' || r.status === 'unverified'; }).length;
        var groups = { general: 'General', technological: 'Technological independence', functional: 'Functional independence', cma: 'Shared-resource (CMA)' };
        var s = '<div class="oos-sect"><div class="oos-sect-h">Independence requirements <span class="oos-reqcount">' + reqs.length + ' generated · ' + openish + ' open</span><button class="oos-copyreq">Copy as Markdown</button></div>';
        s += '<div class="oos-hint">Generated deterministically from the matrix, interface model and CMA — no AI. Status is derived, not authored.</div>';
        Object.keys(groups).forEach(function (k) {
            var gr = reqs.filter(function (r) { return r.kind === k; });
            if (!gr.length) return;
            s += '<div class="oos-reqgrp"><div class="oos-reqgrp-h">' + groups[k] + '</div>';
            gr.forEach(function (r) {
                var m = _reqStatusMeta(r.status);
                s += '<div class="oos-req"><span class="oos-reqstatus" style="background:' + m.c + '">' + m.l + '</span><span class="oos-reqid">' + _esc(r.id) + '</span><span class="oos-reqtext">' + _esc(r.text) + '</span></div>';
            });
            s += '</div>';
        });
        return s + '</div>';
    }
    function _renderBody() {
        var host = document.getElementById('oos-body'); if (!host) return;
        var sys = _systemsForSelect();
        if (sys.length < 2) {
            host.innerHTML = '<div class="oos-empty">Add at least two systems to your project — one acting as the <b>primary AI</b> and one as the <b>Operational Oversight System</b> — then return here to assess their independence.</div>';
            return;
        }
        var claim = _activeClaimId ? getClaim(_activeClaimId) : null;
        var pSel = claim ? claim.primarySystemId : '', oSel = claim ? claim.oosSystemId : '';
        function opts(selId) { return sys.map(function (s) { return '<option value="' + _esc(s.id) + '"' + (s.id === selId ? ' selected' : '') + '>' + _esc(s.name) + '</option>'; }).join(''); }
        var html = '<div class="oos-pair">' +
            '<label>Primary AI system<select id="oos-sel-primary"><option value="">— select —</option>' + opts(pSel) + '</select></label>' +
            '<label>Oversight system (OOS)<select id="oos-sel-oos"><option value="">— select —</option>' + opts(oSel) + '</select></label></div>';
        if (claim) {
            html += '<label class="oos-sf">Safety function under oversight (optional)<input id="oos-sf" type="text" value="' + _esc(claim.safetyFunction || '') + '" placeholder="e.g. detect-and-avoid envelope protection"></label>';
            var v = evaluateClaim(claim.id) || computeVerdict(claim);
            html += _verdictHtml(v) + _functionalHtml(v) + _matrixHtml(claim) + _residualHtml(claim) + _requirementsHtml(claim) + _safetyCaseSectionHtml(claim);
        } else {
            html += '<div class="oos-empty">Select a primary AI system and its oversight system to begin.</div>';
        }
        host.innerHTML = html;
        var sp = host.querySelector('#oos-sel-primary'), so = host.querySelector('#oos-sel-oos');
        if (sp) sp.addEventListener('change', function () { _onPair(sp.value, so ? so.value : ''); });
        if (so) so.addEventListener('change', function () { _onPair(sp ? sp.value : '', so.value); });
        var sf = host.querySelector('#oos-sf');
        if (sf) sf.addEventListener('change', function () { var c = getClaim(_activeClaimId); if (c) { c.safetyFunction = sf.value; _save(); } });
        host.querySelectorAll('[data-factor]').forEach(function (el) {
            var key = el.getAttribute('data-factor'), kind = el.getAttribute('data-kind');
            el.addEventListener('change', function () {
                var c = getClaim(_activeClaimId); if (!c) return;
                if (kind === 'status') setFactor(c.id, key, el.value);
                else if (kind === 'just') setFactor(c.id, key, _factorStatus(c, key), el.value, null);
                else if (kind === 'ev') setFactor(c.id, key, _factorStatus(c, key), null, el.value);
                _renderBody();
            });
        });
        host.querySelectorAll('[data-accept]').forEach(function (el) {
            el.addEventListener('click', function () {
                var ref = el.getAttribute('data-accept');
                var j = (typeof prompt === 'function') ? prompt('Justification for accepting this shared-resource coupling as not defeating independence:') : '';
                if (j == null) return;
                acceptResidual(_activeClaimId, ref, j, 'Waqas Nafees');
                _renderBody();
            });
        });
        var cp = host.querySelector('.oos-copyreq');
        if (cp) cp.addEventListener('click', function () {
            var md = requirementsMarkdown(getClaim(_activeClaimId));
            try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(md); } catch (_) {}
            try { if (typeof showToast === 'function') showToast('Independence requirements copied as Markdown', 'info', 2000); } catch (_) {}
        });
        var sc = host.querySelector('.oos-opensc');
        if (sc) sc.addEventListener('click', function () { openSafetyCase(_activeClaimId); });
        host.querySelectorAll('[data-draft]').forEach(function (btn) { btn.addEventListener('click', function () { _onDraft(host, btn); }); });
    }

    // ------------------------------------------------------------------
    // OOS-5 (#92) — assemble the OOS Independence Safety Case (nested deliverable)
    // + export (Markdown + printable HTML). Deterministic: every section is built
    // from the claim, the verdict, the scoped CMA and the generated requirements.
    // No AI authoring.
    // ------------------------------------------------------------------
    function buildSafetyCase(claim, opts) {
        if (!claim) return null;
        var v = computeVerdict(claim, opts);
        var scan = _pairCmaScan(claim, opts);
        var reqs = generateRequirements(claim, opts);
        var factors = (claim.technological && claim.technological.factors) || [];
        return {
            meta: { primary: _sysName(claim.primarySystemId), primaryId: claim.primarySystemId, oos: _sysName(claim.oosSystemId), oosId: claim.oosSystemId, safetyFunction: claim.safetyFunction || '', generated: new Date().toISOString().slice(0, 10), verdict: v.verdict },
            verdict: v,
            technological: factors.map(function (f) { return { factor: f.factor, label: _factorLabel(f.factor), status: f.status, justification: f.justification || '', evidenceRef: f.evidenceRef || '' }; }),
            functional: { independent: v.functional.independent, relianceEdges: v.functional.relianceEdges || [] },
            cma: scan,
            residuals: (claim.residualCouplings || []).filter(function (rc) { return rc && rc.accepted; }),
            requirements: reqs
        };
    }
    function safetyCaseMarkdown(claim) {
        var sc = buildSafetyCase(claim); if (!sc) return '';
        var m = sc.meta, ok = m.verdict === VERDICT.DEMONSTRATED, L = [];
        L.push('# OOS Independence Safety Case', '');
        L.push('*EASA AI Concept Paper Proposed Issue 03 — Operational Oversight System independence. Experimental, non-certification deliverable. The verdict is deterministic; no AI authored it.*', '');
        L.push('| | |', '|---|---|');
        L.push('| Primary AI system | ' + m.primary + ' |');
        L.push('| Oversight system (OOS) | ' + m.oos + ' |');
        if (m.safetyFunction) L.push('| Safety function | ' + m.safetyFunction + ' |');
        L.push('| Generated | ' + m.generated + ' |');
        L.push('| **Independence verdict** | **' + (ok ? 'DEMONSTRATED' : 'NOT DEMONSTRATED') + '** |', '');
        L.push('## 1. Independence claim', '');
        L.push('The Operational Oversight System (' + m.oos + ') is claimed to be independent — functionally and technologically — from the primary AI (' + m.primary + ')' + (m.safetyFunction ? (' for the safety function "' + m.safetyFunction + '"') : '') + ', such that it can bound the primary AI without sharing its failure modes.', '');
        L.push('## 2. Verdict', '');
        L.push('Independence is **' + (ok ? 'DEMONSTRATED' : 'NOT demonstrated') + '**. It holds iff every technological factor is independent, the OOS does not functionally rely on the primary AI, and no open shared-resource common-mode couples the pair.');
        if (sc.verdict.reasons && sc.verdict.reasons.length) { L.push('', 'Outstanding items:'); sc.verdict.reasons.forEach(function (r) { L.push('- ' + (r.problem || '')); }); }
        L.push('', '## 3. Functional independence', '');
        L.push(sc.functional.independent ? 'No functional-reliance edge from the OOS to the primary AI exists in the interface model.' : ('The OOS relies on the primary AI via interface edge(s): ' + sc.functional.relianceEdges.join(', ') + '. This defeats functional independence.'));
        L.push('', '## 4. Technological independence', '', '| Common-mode factor | Status | Justification | Evidence |', '|---|---|---|---|');
        sc.technological.forEach(function (t) { L.push('| ' + t.label + ' | ' + t.status.toUpperCase() + ' | ' + (t.justification || '—') + ' | ' + (t.evidenceRef || '—') + ' |'); });
        L.push('', '## 5. Common-mode analysis (scoped to the pair)', '');
        if (!sc.cma.candidates.length) L.push('No shared-resource common-mode couples the pair.');
        else { if (sc.cma.open.length) { L.push('**Open couplings (defeat independence):**'); sc.cma.open.forEach(function (c) { L.push('- [' + _srcLabel(c.source) + '] ' + c.label); }); L.push(''); } if (sc.cma.accepted.length) { L.push('**Accepted / mitigated couplings:**'); sc.cma.accepted.forEach(function (c) { L.push('- [' + _srcLabel(c.source) + '] ' + c.label); }); } }
        L.push('', '## 6. Residual couplings & acceptance', '');
        if (!sc.residuals.length) L.push('No residual couplings have been formally accepted.');
        else sc.residuals.forEach(function (rc) { L.push('- **' + rc.ref + '** — accepted' + (rc.by ? (' by ' + rc.by) : '') + (rc.ts ? (' on ' + new Date(rc.ts).toISOString().slice(0, 10)) : '') + '. Justification: ' + (rc.justification || '—')); });
        L.push('', '## 7. Independence requirements', '');
        var grp = { general: 'General', technological: 'Technological', functional: 'Functional', cma: 'Shared-resource' };
        Object.keys(grp).forEach(function (k) { var gr = sc.requirements.filter(function (r) { return r.kind === k; }); if (!gr.length) return; L.push('### ' + grp[k]); gr.forEach(function (r) { L.push('- **' + r.id + '** [' + r.status.toUpperCase() + '] ' + r.text); }); L.push(''); });
        L.push('## 8. Conclusion', '');
        L.push(ok ? 'On the basis of the analysis above, the OOS is shown to be independent of the primary AI across all functional and technological dimensions assessed, with no open common-mode couplings. The independence claim is **demonstrated**.' : 'The independence claim is **not yet demonstrated**. The outstanding items in §2 and the open requirements in §7 must be resolved before independence can be claimed.');
        L.push('', '---', '*Generated by Safety Lab Aero — OOS Independence (Beta). Deterministic analysis; no AI authored this verdict.*');
        return L.join('\n');
    }
    function safetyCaseHtml(claim) {
        var sc = buildSafetyCase(claim); if (!sc) return '<!doctype html><title>—</title>';
        var m = sc.meta, ok = m.verdict === VERDICT.DEMONSTRATED, e = _esc;
        var rowsTech = sc.technological.map(function (t) { return '<tr><td>' + e(t.label) + '</td><td><span class="st ' + e(t.status) + '">' + e(t.status.toUpperCase()) + '</span></td><td>' + e(t.justification || '—') + '</td><td>' + e(t.evidenceRef || '—') + '</td></tr>'; }).join('');
        var cmaHtml;
        if (!sc.cma.candidates.length) cmaHtml = '<p class="ok">No shared-resource common-mode couples the pair.</p>';
        else { cmaHtml = ''; if (sc.cma.open.length) cmaHtml += '<p class="bad">Open couplings (defeat independence):</p><ul>' + sc.cma.open.map(function (c) { return '<li>[' + e(_srcLabel(c.source)) + '] ' + e(c.label) + '</li>'; }).join('') + '</ul>'; if (sc.cma.accepted.length) cmaHtml += '<p class="ok">Accepted / mitigated couplings:</p><ul>' + sc.cma.accepted.map(function (c) { return '<li>[' + e(_srcLabel(c.source)) + '] ' + e(c.label) + '</li>'; }).join('') + '</ul>'; }
        var resHtml = !sc.residuals.length ? '<p>No residual couplings have been formally accepted.</p>' : '<ul>' + sc.residuals.map(function (rc) { return '<li><b>' + e(rc.ref) + '</b> — accepted' + (rc.by ? (' by ' + e(rc.by)) : '') + (rc.ts ? (' on ' + e(new Date(rc.ts).toISOString().slice(0, 10))) : '') + '. ' + e(rc.justification || '') + '</li>'; }).join('') + '</ul>';
        var grp = { general: 'General', technological: 'Technological', functional: 'Functional', cma: 'Shared-resource' };
        var reqHtml = Object.keys(grp).map(function (k) { var gr = sc.requirements.filter(function (r) { return r.kind === k; }); if (!gr.length) return ''; return '<h4>' + grp[k] + '</h4><ul>' + gr.map(function (r) { return '<li><code>' + e(r.id) + '</code> <span class="st ' + e(r.status) + '">' + e(r.status.toUpperCase()) + '</span> ' + e(r.text) + '</li>'; }).join('') + '</ul>'; }).join('');
        var reasons = (sc.verdict.reasons && sc.verdict.reasons.length) ? '<p>Outstanding items:</p><ul>' + sc.verdict.reasons.map(function (r) { return '<li>' + e(r.problem || '') + '</li>'; }).join('') + '</ul>' : '';
        return '<!doctype html><html><head><meta charset="utf-8"><title>OOS Independence Safety Case</title><style>'
            + 'body{font:13px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;color:#15181d;max-width:760px;margin:30px auto;padding:0 24px;}'
            + 'h1{font-size:22px;margin:0 0 4px;}h2{font-size:16px;margin:22px 0 8px;border-bottom:1px solid #e5e7eb;padding-bottom:4px;}h4{font-size:13px;margin:12px 0 4px;}'
            + '.sub{color:#667085;font-size:11.5px;margin-bottom:14px;}'
            + 'table{border-collapse:collapse;width:100%;font-size:12px;margin:8px 0;}th,td{border:1px solid #e5e7eb;padding:5px 8px;text-align:left;vertical-align:top;}th{background:#f7f8fa;font-size:10.5px;text-transform:uppercase;letter-spacing:.03em;}'
            + '.meta{border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;margin:10px 0;font-size:12.5px;}.meta div{padding:2px 0;}'
            + '.verdict{font-weight:800;font-size:15px;padding:10px 14px;border-radius:8px;margin:12px 0;}'
            + '.verdict.ok{background:#e7f6f0;color:#138a63;border:1px solid #1d9e75;}.verdict.no{background:#fdeee0;color:#b06f00;border:1px solid #d98c00;}'
            + '.st{font-size:9.5px;font-weight:700;padding:1px 5px;border-radius:4px;color:#fff;}.st.independent,.st.satisfied{background:#1d9e75;}.st.coupled,.st.violated{background:#d4453a;}.st.tbd,.st.open,.st.unverified{background:#b06f00;}.st.manual{background:#667085;}'
            + '.ok{color:#138a63;}.bad{color:#b06f00;}code{font-size:11px;background:#f1f3f5;padding:1px 4px;border-radius:3px;}'
            + '@media print{body{margin:0;}}'
            + '</style></head><body>'
            + '<h1>OOS Independence Safety Case</h1>'
            + '<div class="sub">EASA AI Concept Paper Proposed Issue 03 — Operational Oversight System independence. Experimental, non-certification deliverable. Verdict is deterministic; no AI authored it.</div>'
            + '<div class="meta"><div><b>Primary AI system:</b> ' + e(m.primary) + '</div><div><b>Oversight system (OOS):</b> ' + e(m.oos) + '</div>' + (m.safetyFunction ? ('<div><b>Safety function:</b> ' + e(m.safetyFunction) + '</div>') : '') + '<div><b>Generated:</b> ' + e(m.generated) + '</div></div>'
            + '<div class="verdict ' + (ok ? 'ok' : 'no') + '">Independence ' + (ok ? 'DEMONSTRATED' : 'NOT demonstrated') + '</div>'
            + '<h2>1. Independence claim</h2><p>The Operational Oversight System (' + e(m.oos) + ') is claimed to be independent — functionally and technologically — from the primary AI (' + e(m.primary) + ')' + (m.safetyFunction ? (' for the safety function &ldquo;' + e(m.safetyFunction) + '&rdquo;') : '') + ', such that it can bound the primary AI without sharing its failure modes.</p>'
            + '<h2>2. Verdict</h2><p>Independence is <b>' + (ok ? 'DEMONSTRATED' : 'NOT demonstrated') + '</b>. It holds iff every technological factor is independent, the OOS does not functionally rely on the primary AI, and no open shared-resource common-mode couples the pair.</p>' + reasons
            + '<h2>3. Functional independence</h2>' + (sc.functional.independent ? '<p class="ok">No functional-reliance edge from the OOS to the primary AI exists in the interface model.</p>' : '<p class="bad">The OOS relies on the primary AI via interface edge(s): ' + e(sc.functional.relianceEdges.join(', ')) + '. This defeats functional independence.</p>')
            + '<h2>4. Technological independence</h2><table><thead><tr><th>Common-mode factor</th><th>Status</th><th>Justification</th><th>Evidence</th></tr></thead><tbody>' + rowsTech + '</tbody></table>'
            + '<h2>5. Common-mode analysis (scoped to the pair)</h2>' + cmaHtml
            + '<h2>6. Residual couplings &amp; acceptance</h2>' + resHtml
            + '<h2>7. Independence requirements</h2>' + reqHtml
            + '<h2>8. Conclusion</h2><p>' + (ok ? 'On the basis of the analysis above, the OOS is shown to be independent of the primary AI across all functional and technological dimensions assessed, with no open common-mode couplings. The independence claim is <b>demonstrated</b>.' : 'The independence claim is <b>not yet demonstrated</b>. The outstanding items in §2 and the open requirements in §7 must be resolved before independence can be claimed.') + '</p>'
            + '</body></html>';
    }
    function _downloadText(name, text, mime) {
        try { var blob = new Blob([text], { type: mime || 'text/plain' }); var url = URL.createObjectURL(blob); var aEl = document.createElement('a'); aEl.href = url; aEl.download = name; document.body.appendChild(aEl); aEl.click(); setTimeout(function () { document.body.removeChild(aEl); URL.revokeObjectURL(url); }, 120); } catch (_) {}
    }
    function _safetyCaseSectionHtml(claim) {
        var sc = buildSafetyCase(claim); var ok = sc && sc.meta.verdict === VERDICT.DEMONSTRATED;
        return '<div class="oos-sect"><div class="oos-sect-h">OOS Independence Safety Case</div>' +
            '<div class="oos-hint">Assembles the claim, verdict, matrix, scoped CMA, residual acceptance and requirements into the nested deliverable. ' + (ok ? 'Independence is currently demonstrated.' : 'Independence is not yet demonstrated — the case lists the open items.') + '</div>' +
            '<button class="oos-opensc">Open safety case →</button></div>';
    }
    function openSafetyCase(claimId) {
        var claim = getClaim(claimId) || (_activeClaimId ? getClaim(_activeClaimId) : null); if (!claim) return;
        _injectStyle();
        var ov = document.createElement('div'); ov.id = 'oos-sc-overlay';
        ov.addEventListener('click', function (ev) { if (ev.target === ov) ov.remove(); });
        ov.innerHTML = '<div class="oos-sc-modal">' +
            '<div class="oos-sc-bar"><b>OOS Independence Safety Case</b><span class="oos-sc-actions">' +
            '<button class="oos-sc-md">Download .md</button><button class="oos-sc-print">Print / PDF</button><button class="oos-sc-x">Close</button></span></div>' +
            '<iframe class="oos-sc-frame" title="Safety case preview"></iframe></div>';
        document.body.appendChild(ov);
        var frame = ov.querySelector('.oos-sc-frame');
        frame.srcdoc = safetyCaseHtml(claim);
        ov.querySelector('.oos-sc-x').addEventListener('click', function () { ov.remove(); });
        ov.querySelector('.oos-sc-md').addEventListener('click', function () { _downloadText('OOS_Independence_Safety_Case.md', safetyCaseMarkdown(claim), 'text/markdown'); });
        ov.querySelector('.oos-sc-print').addEventListener('click', function () { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (_) {} });
    }

    // ------------------------------------------------------------------
    // OOS-6 (#93) — assurance-agent ADVISORY drafting. The AI drafts justification
    // PROSE only, as a suggestion the engineer must Accept; it is given only metadata
    // (system names, the factor, the safety function) and writes only the justification
    // field. It NEVER sets a status, a number, or the verdict — those stay deterministic.
    // Reuses the already-built AIGateway (#79) and its controlled-data routing.
    // ------------------------------------------------------------------
    function _gateway() { try { return window.AIGateway || (window.SafetyLabAssurance && window.SafetyLabAssurance.gateway) || null; } catch (_) { return null; } }
    function _aiReady() { try { var g = _gateway(); if (g && g.describe) { var d = g.describe(); return !!(d && d.ready); } } catch (_) {} return false; }
    async function draftJustification(claim, factorKey) {
        var g = _gateway();
        if (!g || typeof g.generate !== 'function') throw new Error('AI gateway unavailable');
        if (g.describe) { var d = g.describe(); if (d && !d.ready) throw new Error('AI backend not ready'); }
        var label = _factorLabel(factorKey);
        var pName = _sysName(claim.primarySystemId), oName = _sysName(claim.oosSystemId);
        var sf = claim.safetyFunction ? (' for the safety function "' + claim.safetyFunction + '"') : '';
        var sys = 'You are assisting an aerospace safety engineer documenting Operational Oversight System (OOS) independence per the EASA AI Concept Paper Issue 03. '
            + 'Draft a concise 1–2 sentence technical JUSTIFICATION for one cell of the independence matrix. '
            + 'STRICT RULES: prose only; do NOT state a verdict or say whether independence "is" or "is not" demonstrated; do NOT invent evidence/document numbers, part numbers, probabilities, DALs, or any figure; do NOT claim any test or analysis was performed. '
            + 'This is a DRAFT the engineer will review and edit. Describe, in design terms, how the OOS can be kept independent from the primary AI for this specific factor.';
        var user = 'Primary AI system: ' + pName + '\nOversight system (OOS): ' + oName + sf + '\nIndependence factor: ' + label + '\n\nDraft the justification:';
        var out = await g.generate({ task_type: 'oos-independence-justification', system_instruction: sys, user_prompt: user, max_output_tokens: 200, temperature: 0.3 });
        var text = String((out && out.text) || '').trim();
        if (!text) throw new Error('empty draft');
        return { text: text, model: out.model, mode: out.mode };
    }
    function _showSuggestion(cell, input, key, prev) {
        var ex = cell.querySelector('.oos-sugc'); if (ex) ex.remove();
        var wrap = document.createElement('span'); wrap.className = 'oos-sugc';
        var ok = document.createElement('button'); ok.className = 'oos-sok'; ok.textContent = '✓ accept'; ok.title = 'Accept the AI draft into the justification';
        var no = document.createElement('button'); no.className = 'oos-sno'; no.textContent = '✗'; no.title = 'Dismiss the draft';
        wrap.appendChild(ok); wrap.appendChild(no); cell.appendChild(wrap);
        ok.addEventListener('click', function () {
            var c = getClaim(_activeClaimId); if (c) setFactor(c.id, key, _factorStatus(c, key), input.value, null);  // writes justification ONLY
            input.classList.remove('oos-suggested'); wrap.remove();
            try { if (typeof showToast === 'function') showToast('Draft accepted into the justification', 'info', 1600); } catch (_) {}
        });
        no.addEventListener('click', function () { input.value = prev; input.classList.remove('oos-suggested'); wrap.remove(); });
    }
    async function _onDraft(host, btn) {
        var key = btn.getAttribute('data-draft');
        var c = getClaim(_activeClaimId); if (!c) return;
        var cell = btn.parentElement, input = cell.querySelector('input[data-kind="just"]');
        if (!input) return;
        var prev = input.value, lbl = btn.textContent;
        btn.disabled = true; btn.textContent = '…';
        try {
            var draft = await draftJustification(c, key);
            input.value = draft.text; input.classList.add('oos-suggested');
            _showSuggestion(cell, input, key, prev);
        } catch (e) {
            try { if (typeof showToast === 'function') showToast('AI draft unavailable — ' + ((e && e.message) || 'backend not ready'), 'warning', 2800); } catch (_) {}
        } finally { btn.disabled = false; btn.textContent = lbl; }
    }

    function _injectStyle() {
        if (document.getElementById('oos-style')) return;
        var st = document.createElement('style'); st.id = 'oos-style';
        st.textContent = [
            '#oos-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:flex;align-items:flex-start;justify-content:center;padding:34px 16px;overflow:auto;}',
            '.oos-modal{background:var(--color-surface,#fff);color:var(--color-text,#15181d);width:100%;max-width:940px;border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.4);overflow:hidden;}',
            '.oos-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--color-border,rgba(0,0,0,.12));}',
            '.oos-title{font-size:18px;font-weight:800;}',
            '.oos-beta{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;background:#6d5cff;color:#fff;padding:2px 7px;border-radius:999px;margin-left:8px;vertical-align:middle;}',
            '.oos-x{background:none;border:none;font-size:18px;cursor:pointer;color:var(--color-text,#333);opacity:.6;}.oos-x:hover{opacity:1;}',
            '.oos-subnote{padding:11px 20px;font-size:11.5px;line-height:1.5;color:var(--color-text-secondary,#667085);background:var(--color-surface-2,rgba(0,0,0,.03));border-bottom:1px solid var(--color-border,rgba(0,0,0,.08));}',
            '.oos-body{padding:18px 20px;max-height:64vh;overflow:auto;}',
            '.oos-empty{padding:30px 8px;text-align:center;color:var(--color-text-secondary,#667085);font-size:13px;line-height:1.6;}',
            '.oos-pair{display:flex;gap:14px;margin-bottom:14px;}.oos-pair label{flex:1;display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:600;color:var(--color-text-secondary,#667085);}',
            '.oos-pair select,.oos-sf input,.oos-matrix input{width:100%;padding:7px 9px;border:1px solid var(--color-border,rgba(0,0,0,.18));border-radius:8px;background:var(--color-surface,#fff);color:var(--color-text,#15181d);font-size:13px;box-sizing:border-box;}',
            '.oos-sf{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:600;color:var(--color-text-secondary,#667085);margin-bottom:14px;}',
            '.oos-verdict{border-radius:11px;padding:13px 15px;margin-bottom:15px;border:1.5px solid;}',
            '.oos-verdict.ok{border-color:#1d9e75;background:rgba(29,158,117,.10);}',
            '.oos-verdict.no{border-color:#d98c00;background:rgba(217,140,0,.10);}',
            '.oos-vtitle{font-weight:800;font-size:15px;}.oos-verdict.ok .oos-vtitle{color:#1d9e75;}.oos-verdict.no .oos-vtitle{color:#b06f00;}',
            '.oos-vsub{font-size:12px;margin-top:3px;color:var(--color-text-secondary,#667085);}',
            '.oos-reasons{margin:9px 0 0;padding-left:18px;font-size:12px;}.oos-reasons li{padding:1px 0;color:#b06f00;}',
            '.oos-sect{margin:16px 0;}.oos-sect-h{font-size:13px;font-weight:800;margin-bottom:7px;}',
            '.oos-good{font-size:12.5px;color:#1d9e75;}.oos-bad{font-size:12.5px;color:#b06f00;margin-bottom:6px;}',
            '.oos-hint{font-size:11px;color:var(--color-text-secondary,#8a93a3);margin-top:6px;line-height:1.5;}',
            '.oos-matrix{width:100%;border-collapse:collapse;font-size:12px;}',
            '.oos-matrix th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.03em;color:var(--color-text-secondary,#8a93a3);padding:5px 7px;border-bottom:1px solid var(--color-border,rgba(0,0,0,.12));}',
            '.oos-matrix td{padding:5px 7px;border-bottom:1px solid var(--color-border,rgba(0,0,0,.06));vertical-align:middle;}',
            '.oos-flabel{font-weight:600;white-space:nowrap;}',
            '.oos-fstatus{padding:5px 7px;border-radius:7px;border:1px solid var(--color-border,rgba(0,0,0,.18));background:var(--color-surface,#fff);color:var(--color-text,#15181d);font-size:12px;font-weight:600;}',
            '.oos-fstatus.st-independent{color:#1d9e75;border-color:#1d9e75;}.oos-fstatus.st-coupled{color:#d4453a;border-color:#d4453a;}.oos-fstatus.st-tbd{color:#b06f00;}',
            '.oos-reslist{list-style:none;margin:6px 0 0;padding:0;font-size:12px;}.oos-reslist li{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid var(--color-border,rgba(0,0,0,.06));}',
            '.oos-accept{font-size:11px;padding:4px 9px;border:1px solid var(--color-border,rgba(0,0,0,.2));border-radius:7px;background:var(--color-surface,#fff);color:var(--color-text,#333);cursor:pointer;}',
            '.oos-src{display:inline-block;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding:1px 5px;border-radius:4px;margin-right:5px;vertical-align:middle;color:#fff;}',
            '.oos-src-interface{background:#007aff;}.oos-src-resource{background:#d97706;}.oos-src-cma{background:#7c3aed;}',
            '.oos-okmark{color:#1d9e75;font-weight:800;}.oos-reslist.accepted li{opacity:.85;}',
            '.oos-compromised{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;background:#d4453a;color:#fff;padding:2px 7px;border-radius:999px;margin-left:8px;vertical-align:middle;}',
            '.oos-reqcount{font-size:10.5px;font-weight:600;color:var(--color-text-secondary,#8a93a3);margin-left:6px;}',
            '.oos-copyreq{float:right;font-size:11px;padding:3px 9px;border:1px solid var(--color-border,rgba(0,0,0,.2));border-radius:7px;background:var(--color-surface,#fff);color:var(--color-text,#333);cursor:pointer;}',
            '.oos-reqgrp{margin:9px 0;}.oos-reqgrp-h{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--color-text-secondary,#8a93a3);margin:8px 0 4px;}',
            '.oos-req{display:flex;align-items:flex-start;gap:8px;padding:4px 0;font-size:12px;border-bottom:1px solid var(--color-border,rgba(0,0,0,.05));}',
            '.oos-reqstatus{flex:none;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.02em;color:#fff;padding:2px 6px;border-radius:4px;min-width:58px;text-align:center;}',
            '.oos-reqid{flex:none;font-family:ui-monospace,Menlo,monospace;font-size:10.5px;color:var(--color-text-secondary,#8a93a3);min-width:108px;}',
            '.oos-reqtext{flex:1;}',
            '.oos-opensc{font-size:12px;padding:7px 13px;border:1px solid #6d5cff;border-radius:8px;background:#6d5cff;color:#fff;cursor:pointer;font-weight:600;}',
            '#oos-sc-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:100000;display:flex;align-items:center;justify-content:center;padding:24px;}',
            '.oos-sc-modal{background:var(--color-surface,#fff);width:100%;max-width:900px;height:88vh;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 18px 60px rgba(0,0,0,.45);}',
            '.oos-sc-bar{display:flex;align-items:center;justify-content:space-between;padding:11px 16px;border-bottom:1px solid var(--color-border,rgba(0,0,0,.12));font-size:14px;color:var(--color-text,#15181d);}',
            '.oos-sc-actions button{font-size:12px;margin-left:8px;padding:5px 11px;border:1px solid var(--color-border,rgba(0,0,0,.2));border-radius:7px;background:var(--color-surface,#fff);color:var(--color-text,#333);cursor:pointer;}',
            '.oos-sc-frame{border:none;width:100%;flex:1;background:#fff;}',
            '.oos-justcell{white-space:nowrap;}.oos-justcell input{width:calc(100% - 24px);}',
            '.oos-draftbtn{border:none;background:none;cursor:pointer;font-size:13px;padding:0 2px;opacity:.7;}.oos-draftbtn:hover{opacity:1;}.oos-draftbtn:disabled{opacity:.4;cursor:default;}',
            'input.oos-suggested{outline:2px solid #6d5cff;background:rgba(109,92,255,.06);}',
            '.oos-sugc{display:inline-flex;gap:3px;margin-left:4px;}',
            '.oos-sok{font-size:10px;padding:2px 6px;border:1px solid #1d9e75;color:#fff;background:#1d9e75;border-radius:5px;cursor:pointer;}',
            '.oos-sno{font-size:10px;padding:2px 6px;border:1px solid var(--color-border,rgba(0,0,0,.2));background:var(--color-surface,#fff);color:var(--color-text,#333);border-radius:5px;cursor:pointer;}',
            '.oos-labnote{font-size:10.5px;color:var(--color-text-secondary,#8a93a3);padding:3px 12px;line-height:1.4;}.oos-labnote.dim{opacity:.7;}',
            '.oos-enable .asb-lbl{color:#6d5cff;}.oos-disable{opacity:.55;}.oos-disable .asb-lbl{font-size:11px;}',
            '#snav-oos .oos-beta{margin-left:6px;transform:scale(.82);}'
        ].join('');
        document.head.appendChild(st);
    }

    function _init() { try { _injectStyle(); _renderLabs(); } catch (_) {} }

    // ------------------------------------------------------------------
    // Public surface
    // ------------------------------------------------------------------
    var api = {
        ROLES: ROLES, FACTOR_STATUS: FACTOR_STATUS, VERDICT: VERDICT,
        techFactors: function () { return TECH_FACTORS.slice(); },
        // roles
        getRole: getRole, setRole: setRole, clearRole: clearRole, listByRole: listByRole,
        // claims
        addClaim: addClaim, getClaim: getClaim, listClaims: listClaims, removeClaim: removeClaim,
        setFactor: setFactor, acceptResidual: acceptResidual,
        // deterministic verdict + pair-scoped CMA (OOS-3)
        computeVerdict: computeVerdict, verdictFor: verdictFor, pairCmaScan: _pairCmaScan, evaluateClaim: evaluateClaim,
        // deterministic requirement generation (OOS-4)
        generateRequirements: generateRequirements, requirementsMarkdown: requirementsMarkdown,
        // safety-case assembly + export (OOS-5)
        buildSafetyCase: buildSafetyCase, safetyCaseMarkdown: safetyCaseMarkdown, safetyCaseHtml: safetyCaseHtml, openSafetyCase: openSafetyCase,
        // advisory AI drafting (OOS-6) — gated, suggestion-only, never authors the verdict
        aiReady: _aiReady, draftJustification: draftJustification,
        // UI (OOS-2) — opt-in, default-off
        isEnabled: isEnabled, enableUI: enableUI, openPanel: openPanel, closePanel: closePanel, renderLabs: _renderLabs,
        _version: 'oos.6.0'
    };

    try { if (typeof window !== 'undefined') window.SafetyLabOOS = api; } catch (_) {}
    try { if (typeof module !== 'undefined' && module.exports) module.exports = api; } catch (_) {}   // node unit tests

    // Init the opt-in Labs entry once the DOM is ready (browser only).
    try {
        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
            else _init();
        }
    } catch (_) {}
})();
