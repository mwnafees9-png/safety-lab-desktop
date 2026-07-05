/* ============================================================================
 * config_management.js — ARP4754B §5.6 System Control Category (SC) configuration management.
 * ----------------------------------------------------------------------------
 * Self-contained module (loaded AFTER safety_lab.js). Pro+ gated. ADDITIVE: it does not modify the
 * deterministic engine. Reads existing globals (ftaPages, acFhaData, acFunctionsData, systemsData,
 * acReqData, projectConfig, scFromTableA1, getSafetyTarget, _savePdf) and persists under
 * projectConfig.configManagement (rides the project snapshot/autosave).
 *
 * The configuration index is a NESTED, COLLAPSIBLE bucket tree. Every item of every assessment is a
 * configuration item (leaf) carrying its own SC rating, version, and flags:
 *   Aircraft ▸ Functions ▸ <each function>
 *            ▸ AFHA ▸ <each failure condition>
 *            ▸ PASA ▸ Fault Trees ▸ <allocation FTAs>  /  Requirements ▸ <derived requirements>
 *            ▸ ASA  ▸ Fault Trees ▸ <verification FTAs> /  Requirements ▸ <requirement verification evidence>
 *   System: X ▸ Functions / SFHA / PSSA(Fault Trees, Requirements, FMEA) / SSA(Fault Trees, Requirements)
 *   Common-Cause Analyses ▸ CMA / ZSA / PRA / Markov
 *
 * Baselining is PER ITEM; SC1 items lock on baseline (change via PR → ECN). Re-baselining an item
 * obsoletes its connected downstream analyses. Compromise flags (independence/CMA-compromised gates,
 * compromised requirements — the Golden-Thread signals) are shown per item and rolled up to buckets.
 *
 * Exposes window.SafetyLabCM. Everything is guarded so a fault here never breaks the host app.
 * ========================================================================== */
(function () {
'use strict';

// ── guarded accessors ───────────────────────────────────────────────────────
function _cfg() { try { return (typeof projectConfig !== 'undefined' && projectConfig) ? projectConfig : (window.projectConfig || null); } catch (_) { return null; } }
function _cm() {
    const c = _cfg(); if (!c) return null;
    if (!c.configManagement) c.configManagement = {};
    const m = c.configManagement;
    m.scMapOverrides = m.scMapOverrides || {};
    m.ciOverrides    = m.ciOverrides || {};
    m.ciBaselines    = m.ciBaselines || {};
    m.problemReports = m.problemReports || [];
    m.changeNotices  = m.changeNotices || [];
    m.auditLocation  = m.auditLocation || 'local';
    return m;
}
function _pages()   { try { return (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) ? ftaPages : []; } catch (_) { return []; } }
function _acFha()   { try { return (typeof acFhaData !== 'undefined' && Array.isArray(acFhaData)) ? acFhaData : []; } catch (_) { return []; } }
function _systems() { try { return (typeof systemsData !== 'undefined' && Array.isArray(systemsData)) ? systemsData : []; } catch (_) { return []; } }
function _acReq()   { try { return (typeof acReqData !== 'undefined' && Array.isArray(acReqData)) ? acReqData : []; } catch (_) { return []; } }
function _acFunctions() { try { return (typeof acFunctionsData !== 'undefined' && Array.isArray(acFunctionsData)) ? acFunctionsData : []; } catch (_) { return []; } }
function _save()    { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }
function _toast(m, t, d) { try { if (typeof showToast === 'function') showToast(m, t || 'info', d || 2600); } catch (_) {} }
function _esc(s)    { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function _now()     { return new Date().toISOString(); }
function _actor()   { try { if (typeof Review !== 'undefined' && Review.getReviewerName) return Review.getReviewerName() || 'analyst'; } catch (_) {} return 'analyst'; }
function _uid(p)    { return (p || 'cm') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }
function _proPlus() { try { return (typeof canUseConfigBaselining === 'function') ? canUseConfigBaselining() : (typeof isProPlusLicensed === 'function' ? isProPlusLicensed() : true); } catch (_) { return true; } }
const SEP = '/';

// ── severity → FDAL helpers ─────────────────────────────────────────────────
const _SEV_RANK = { 'Catastrophic': 5, 'Hazardous': 4, 'Major': 3, 'Minor': 2, 'Negligible': 1 };
function _dalForSeverity(sev) { try { if (typeof getSafetyTarget === 'function' && sev) { const t = getSafetyTarget(sev); return (t && t.dal) || 'A'; } } catch (_) {} return 'A'; }
function _maxSeverity(list) { let best = null, bestR = 0; (list || []).forEach(f => { const r = _SEV_RANK[f && f.severity] || 0; if (r > bestR) { bestR = r; best = f.severity; } }); return best; }
function _projectMaxDal() { const all = _acFha().concat(..._systems().map(s => s.fha || [])); const sev = _maxSeverity(all); return sev ? _dalForSeverity(sev) : 'A'; }
function _sysMaxDal(sys) { const sev = _maxSeverity((sys && sys.fha) || []); return sev ? _dalForSeverity(sev) : 'A'; }
function _pageFdal(page) {
    try {
        const ids = page.linkedFhaIds || (page.linkedFhaId ? [page.linkedFhaId] : []); const id = ids[0];
        if (id != null) { const all = _acFha().concat(..._systems().map(s => s.fha || [])); const fha = all.find(f => String(f.internalId) === String(id)); if (fha && fha.severity) return _dalForSeverity(fha.severity); }
        if (page.root && page.root.allocatedDAL) return page.root.allocatedDAL;
    } catch (_) {}
    return _projectMaxDal();
}
function _fhaTracesSub(h, subId) { return !!h && (String(h.subId) === String(subId) || (Array.isArray(h.subIds) && h.subIds.map(String).indexOf(String(subId)) >= 0)); }
function _fdalForAcFunction(subId) { const fhas = _acFha().filter(h => _fhaTracesSub(h, subId)); const sev = _maxSeverity(fhas); return sev ? _dalForSeverity(sev) : _projectMaxDal(); }
function _pageLinksAnyFha(pageId, fhaIds) { const p = _pages().find(x => x.id === pageId); if (!p) return false; const ids = (p.linkedFhaIds || (p.linkedFhaId ? [p.linkedFhaId] : [])).map(String); return ids.some(i => fhaIds.indexOf(i) >= 0); }
function _reqName(r) { const t = (r && r.text) ? String(r.text).replace(/\s+/g, ' ').trim() : ''; return t ? t.slice(0, 78) : ('Requirement ' + (r && r.internalId)); }
function _findReq(ref) {
    if (ref.kind === 'acreq' || ref.kind === 'acreqv') return _acReq().find(r => String(r.internalId) === String(ref.id));
    const parts = String(ref.id).split('::'); const s = _systems().find(x => String(x.id) === parts[0]);
    return s && (s.req || []).find(r => String(r.internalId) === parts[1]);
}
function _reqTraces(ci, subId) { const r = _findReq(ci.ref); if (!r) return false; if (String(r.traceId) === String(subId)) return true; return Array.isArray(r.traceIds) && r.traceIds.map(String).indexOf(String(subId)) >= 0; }

// ── SC derivation (scType overrides ciType for items whose SC differs, e.g. verification evidence) ──
function deriveSC(ci) {
    const m = _cm();
    if (m && ci && m.ciOverrides[ci.ciId]) return m.ciOverrides[ci.ciId];
    const t = (ci && ci.scType) || (ci && ci.ciType);
    if (m && ci && m.scMapOverrides[t]) return m.scMapOverrides[t];
    try { if (typeof scFromTableA1 === 'function') return scFromTableA1(t, ci.fdal); } catch (_) {}
    return 'SC1';
}

// Read the compromise flags the Golden Thread surfaces and attribute them to the owning item.
function _ciCompromised(ci) {
    try {
        if (ci.ciType === 'fta') {
            const p = _pages().find(x => x.id === ci.ref.id); if (!p || !p.root) return false;
            let hit = false;
            (function walk(n) { if (!n || hit) return; if (n._probCompromised || n._dalCompromised || n._cmaCompromised) { hit = true; return; } const k = n.children || n._children; if (k) k.forEach(walk); })(p.root);
            return hit;
        }
        if (ci.ciType === 'requirements' || ci.ciType === 'req_verif') { const r = _findReq(ci.ref); return !!(r && r.compromised); }
    } catch (_) {}
    return false;
}

// ── configuration-item taxonomy: leaf items, each tagged with a bucket PATH ──
function _ci(ciType, kind, id, name, fdal, path, scType) {
    return { ciId: kind + ':' + String(id), ciType, ref: { kind, id: String(id) }, name: String(name || ''), fdal: fdal || 'A', path: path || [], scType: scType || null };
}
function _fcName(fc) { return (fc.fcId || ('FC-' + fc.internalId)) + (fc.fcDesc ? ' — ' + String(fc.fcDesc).slice(0, 60) : ''); }
function enumerateCIs() {
    const out = [];
    const push = (ci, group) => { ci.group = group; out.push(ci); return ci; };
    try {
        // bucket FTA pages by scope + allocation/verification
        const acAlloc = [], acVerif = [], sysAlloc = {}, sysVerif = {};
        _pages().forEach(p => {
            if (!p || !p.root) return;
            const isSys = p.treeLevel === 'system' && p.systemId && _systems().some(s => String(s.id) === String(p.systemId));
            if (isSys) { const b = p.verifies ? (sysVerif[p.systemId] = sysVerif[p.systemId] || []) : (sysAlloc[p.systemId] = sysAlloc[p.systemId] || []); b.push(p); }
            else (p.verifies ? acVerif : acAlloc).push(p);
        });
        // ── AIRCRAFT ──
        const AC = 'Aircraft'; const acDal = _projectMaxDal();
        const acFns = []; _acFunctions().forEach(f => { if (f && f.subId && !acFns.some(x => x.subId === f.subId)) acFns.push({ subId: f.subId, name: f.subName || f.subId }); });
        acFns.forEach(f => push(_ci('functions', 'acfunc', f.subId, f.subId + (f.name && f.name !== f.subId ? ' — ' + f.name : ''), _fdalForAcFunction(f.subId), [AC, 'Aircraft Functions']), 'ac'));
        _acFha().forEach(fc => push(_ci('afha', 'afha', fc.internalId, _fcName(fc), _dalForSeverity(fc.severity), [AC, 'AFHA']), 'ac'));
        acAlloc.forEach(p => push(_ci('fta', 'fta', p.id, 'FTA — ' + (p.name || p.id), _pageFdal(p), [AC, 'PASA', 'Fault Trees']), 'ac'));
        _acReq().forEach(r => push(_ci('requirements', 'acreq', r.internalId, _reqName(r), _fdalForAcFunction(r.traceId) || acDal, [AC, 'PASA', 'Requirements']), 'ac'));
        acVerif.forEach(p => push(_ci('fta', 'fta', p.id, 'V&V FTA — ' + (p.name || p.id), _pageFdal(p), [AC, 'ASA', 'Fault Trees']), 'ac'));
        _acReq().forEach(r => push(_ci('req_verif', 'acreqv', r.internalId, 'Verification — ' + _reqName(r), _fdalForAcFunction(r.traceId) || acDal, [AC, 'ASA', 'Requirements'], 'verification_results'), 'ac'));
        // ── SYSTEMS ──
        _systems().forEach(s => {
            const dal = _sysMaxDal(s); const SS = 'System: ' + (s.name || s.id); const g = 'sys:' + s.id;
            (s.functions || []).forEach((f, i) => { const key = (f && (f.funcId || f.subId)) || ('fn' + i); const nm = (f && (f.funcName || f.funcId || f.subId)) || ('Function ' + (i + 1)); push(_ci('functions', 'sysfunc', s.id + '::' + key, nm, dal, [SS, 'System Functions']), g); });
            (s.fha || []).forEach(fc => push(_ci('sfha', 'sfha', s.id + '::' + fc.internalId, _fcName(fc), _dalForSeverity(fc.severity), [SS, 'SFHA']), g));
            (sysAlloc[s.id] || []).forEach(p => push(_ci('fta', 'fta', p.id, 'FTA — ' + (p.name || p.id), _pageFdal(p), [SS, 'PSSA', 'Fault Trees']), g));
            (s.req || []).forEach(r => push(_ci('requirements', 'sysreq', s.id + '::' + r.internalId, _reqName(r), dal, [SS, 'PSSA', 'Requirements']), g));
            if ((s.fmea || []).length) push(_ci('fmea', 'fmea', s.id, 'FMEA — ' + (s.name || s.id), dal, [SS, 'PSSA', 'FMEA']), g);
            (sysVerif[s.id] || []).forEach(p => push(_ci('fta', 'fta', p.id, 'V&V FTA — ' + (p.name || p.id), _pageFdal(p), [SS, 'SSA', 'Fault Trees']), g));
            (s.req || []).forEach(r => push(_ci('req_verif', 'sysreqv', s.id + '::' + r.internalId, 'Verification — ' + _reqName(r), dal, [SS, 'SSA', 'Requirements'], 'verification_results'), g));
        });
        // ── COMMON-CAUSE ANALYSES (own bucket) ──
        const CCA = 'Common-Cause Analyses'; const proj = _projectMaxDal();
        if (typeof cmaData !== 'undefined' && (cmaData || []).length) push(_ci('cma', 'cma', 'PROJ', 'Common Mode Analysis (CMA)', proj, [CCA, 'CMA']), 'cca');
        if (typeof zsaData !== 'undefined' && (zsaData || []).length) push(_ci('zsa', 'zsa', 'PROJ', 'Zonal Safety Analysis (ZSA)', proj, [CCA, 'ZSA']), 'cca');
        if (typeof praData !== 'undefined' && (praData || []).length) push(_ci('pra', 'pra', 'PROJ', 'Particular Risk Analysis (PRA)', proj, [CCA, 'PRA']), 'cca');
        if (_cfg() && Array.isArray(_cfg().markovModels) && _cfg().markovModels.length) push(_ci('markov', 'markov', 'PROJ', 'Markov Models', proj, [CCA, 'Markov']), 'cca');
    } catch (_) {}
    out.forEach(ci => { ci.sc = deriveSC(ci); ci.compromised = _ciCompromised(ci); });
    return out;
}

// ── hashing ─────────────────────────────────────────────────────────────────
function _cyrb(str) { let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0, ch; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16); }
function _ciContentHash(ci) {
    try {
        let payload = ci.ciType + '|' + ci.ref.kind + '|' + ci.ref.id;
        if (ci.ciType === 'fta') { const p = _pages().find(x => x.id === ci.ref.id); payload += '|' + JSON.stringify(p && p.root); }
        else if (ci.ciType === 'afha') { const fc = _acFha().find(f => String(f.internalId) === String(ci.ref.id)); payload += '|' + JSON.stringify(fc); }
        else if (ci.ciType === 'sfha') { const parts = String(ci.ref.id).split('::'); const s = _systems().find(x => String(x.id) === parts[0]); payload += '|' + JSON.stringify(s && (s.fha || []).find(f => String(f.internalId) === parts[1])); }
        else if (ci.ciType === 'functions') { if (ci.ref.kind === 'acfunc') payload += '|' + JSON.stringify(_acFunctions().filter(f => String(f.subId) === String(ci.ref.id))); else { const sid = String(ci.ref.id).split('::')[0]; payload += '|' + JSON.stringify(((_systems().find(s => String(s.id) === sid) || {}).functions) || []); } }
        else if (ci.ciType === 'requirements') { payload += '|' + JSON.stringify(_findReq(ci.ref)); }
        else if (ci.ciType === 'req_verif') { const r = _findReq(ci.ref); payload += '|' + JSON.stringify(r && { m: r.verifMethod, s: r.verifStatus, e: r.verifEvidence }); }
        else if (ci.ciType === 'fmea') { const s = _systems().find(x => String(x.id) === String(ci.ref.id)); payload += '|' + JSON.stringify(s && s.fmea); }
        else payload += '|' + ci.name;
        return _cyrb(payload);
    } catch (_) { return _cyrb(ci.ciId + ci.name); }
}

// ── per-item baseline establishment + change-impact obsolescence ─────────────
function _bumpMinor(v) { const p = String(v || '1.0').split('.'); return (+p[0] || 1) + '.' + ((+p[1] || 0) + 1); }
function _ciState(ciId) { const m = _cm(); return (m && m.ciBaselines[ciId]) || null; }
// flow rank (lower = upstream): functions → FHA → FTA/FMEA/CCA → requirements → verification
const _FLOW_RANK = { functions:1, afha:2, sfha:2, fta:4, fmea:4, cma:4, zsa:4, pra:4, markov:4, requirements:5, req_verif:7 };
function _rank(t) { return _FLOW_RANK[t] || 9; }
function _systemConnectedToAircraft(sysId) { const s = _systems().find(x => String(x.id) === String(sysId)); if (!s) return false; return (s.functions || []).some(f => f && Array.isArray(f.traceIds) && f.traceIds.length > 0); }
function _obsoleteConnected(x, cis) {
    const m = _cm(); if (!m) return;
    cis = cis || enumerateCIs();
    const cur = m.ciBaselines[x.ciId]; const xv = cur ? cur.version : '';
    const mark = y => { const st = m.ciBaselines[y.ciId]; if (st) { st.obsolete = true; st.obsoleteReason = 'Upstream "' + x.name + '" re-baselined to v' + xv; } };

    // aircraft function → only the failure conditions / FTAs / requirements connected to THAT function (+ connected systems)
    if (x.ciType === 'functions' && x.ref.kind === 'acfunc') {
        const subId = x.ref.id; const fhaIds = _acFha().filter(h => _fhaTracesSub(h, subId)).map(h => String(h.internalId));
        cis.forEach(y => {
            if (y.group !== 'ac') return;
            if (y.ciType === 'afha' && fhaIds.indexOf(String(y.ref.id)) >= 0) mark(y);
            else if (y.ciType === 'fta' && _pageLinksAnyFha(y.ref.id, fhaIds)) mark(y);
            else if ((y.ciType === 'requirements' || y.ciType === 'req_verif') && _reqTraces(y, subId)) mark(y);
        });
        _systems().forEach(s => { const connected = (s.functions || []).some(f => Array.isArray(f.traceIds) && f.traceIds.map(String).indexOf(String(subId)) >= 0); if (connected) cis.forEach(y => { if (y.group === 'sys:' + s.id) mark(y); }); });
        return;
    }
    if (x.ciType === 'functions' && x.ref.kind === 'sysfunc') { cis.forEach(y => { if (y.group === x.group && _rank(y.ciType) > 1) mark(y); }); return; }

    // failure condition → FTAs built on it + requirements tracing its function(s), within scope
    if (x.ciType === 'afha' || x.ciType === 'sfha') {
        const fcId = x.ciType === 'afha' ? x.ref.id : String(x.ref.id).split('::')[1];
        let fc = null;
        if (x.ciType === 'afha') fc = _acFha().find(f => String(f.internalId) === String(fcId));
        else { const s = _systems().find(z => 'sys:' + z.id === x.group); fc = s && (s.fha || []).find(f => String(f.internalId) === String(fcId)); }
        const subs = fc ? [].concat(fc.subId ? [fc.subId] : [], Array.isArray(fc.subIds) ? fc.subIds : []) : [];
        cis.forEach(y => {
            if (y.group !== x.group) return;
            if (y.ciType === 'fta' && _pageLinksAnyFha(y.ref.id, [String(fcId)])) mark(y);
            else if ((y.ciType === 'requirements' || y.ciType === 'req_verif') && subs.some(sb => _reqTraces(y, sb))) mark(y);
        });
        return;
    }

    // other items: same-scope downstream by rank + cross-scope connectivity
    const xr = _rank(x.ciType);
    cis.forEach(y => {
        if (y.ciId === x.ciId) return;
        let conn = false;
        if (y.group === x.group && _rank(y.ciType) > xr) conn = true;
        else if (x.group === 'ac' && String(y.group).indexOf('sys:') === 0 && _systemConnectedToAircraft(y.group.slice(4))) conn = true;
        else if (String(x.group).indexOf('sys:') === 0 && y.group === 'ac' && y.ciType === 'req_verif') conn = true;
        else if (x.ciType === 'fta' && y.group === 'cca') conn = true;
        if (conn) mark(y);
    });
}
function establishCIBaseline(ciId, opts) {
    opts = opts || {}; const m = _cm(); if (!m) return null;
    const list = opts.cis || enumerateCIs();
    const ci = list.find(c => c.ciId === ciId); if (!ci) return null;
    const sha = _ciContentHash(ci);
    const prev = m.ciBaselines[ciId];
    if (prev && prev.sha === sha && !opts.force) return prev;
    const version = prev ? _bumpMinor(prev.version) : '1.0';
    const rec = { ciId, version, sha, sc: ci.sc, fdal: ci.fdal, locked: ci.sc === 'SC1', obsolete: false,
        establishedAt: _now(), establishedBy: _actor(),
        history: ((prev && prev.history) || []).concat([{ version, sha, at: _now(), by: _actor(), note: opts.note || '' }]) };
    m.ciBaselines[ciId] = rec;
    if (prev || opts.force) _obsoleteConnected(ci, list);
    _save(); return rec;
}
function establishAll(opts) { const cis = enumerateCIs(); return cis.map(ci => establishCIBaseline(ci.ciId, Object.assign({ cis }, opts || {}))); }
function isLocked(ciId) { const s = _ciState(ciId); return !!(s && s.locked); }
function isObsolete(ciId) { const s = _ciState(ciId); return !!(s && s.obsolete); }

// ── Problem Reports + Engineering Change Notices ────────────────────────────
function raisePR(o) {
    o = o || {}; const m = _cm(); if (!m) return null;
    const pr = { prId: _uid('pr'), againstCiId: o.againstCiId || '', title: o.title || '', description: o.description || '',
        safetyImpact: !!o.safetyImpact, status: 'open', raisedBy: _actor(), raisedAt: _now(), resolution: '', ecnId: null };
    m.problemReports.push(pr); _save(); return pr;
}
function raiseECN(o) {
    o = o || {}; const m = _cm(); if (!m) return null;
    const pr = m.problemReports.find(p => p.prId === o.prId) || null;
    const ecn = { ecnId: _uid('ecn'), prRef: o.prId || null, ciId: o.ciId || (pr && pr.againstCiId) || '',
        fromVersion: o.fromVersion || '', toVersion: o.toVersion || '', changeClass: o.changeClass || 'II',
        description: o.description || '', reason: o.reason || '', substantiation: o.substantiation || (pr ? ('PR ' + pr.prId) : ''),
        approvedBy: o.approvedBy || _actor(), date: _now() };
    m.changeNotices.push(ecn);
    if (pr) { pr.ecnId = ecn.ecnId; pr.status = 'closed'; pr.resolution = 'Resolved via ECN ' + ecn.ecnId; }
    if (ecn.ciId) { try { establishCIBaseline(ecn.ciId, { force: true, note: 'ECN ' + ecn.ecnId }); } catch (_) {} }
    _save(); return ecn;
}

// ── nested collapsible bucket render ─────────────────────────────────────────
function _buildTree(cis) {
    const root = { name: '__root', children: new Map(), leaves: [] };
    cis.forEach(ci => { let n = root; (ci.path || []).forEach(seg => { if (!n.children.has(seg)) n.children.set(seg, { name: seg, children: new Map(), leaves: [] }); n = n.children.get(seg); }); n.leaves.push(ci); });
    return root;
}
function _descLeaves(node) { let out = node.leaves.slice(); node.children.forEach(c => { out = out.concat(_descLeaves(c)); }); return out; }
function _bucketStats(leaves, m) { let comp = 0, obs = 0, base = 0, locked = 0; leaves.forEach(ci => { if (ci.compromised) comp++; const st = m && m.ciBaselines[ci.ciId]; if (st) { base++; if (st.obsolete) obs++; if (st.locked) locked++; } }); return { n: leaves.length, comp, obs, base, locked }; }
function _leafHtml(ci, m) {
    const st = m && m.ciBaselines[ci.ciId];
    const ver = st ? st.version : '—'; const locked = !!(st && st.locked), obs = !!(st && st.obsolete), comp = !!ci.compromised;
    const scCls = ci.sc === 'SC1' ? 'background:#0a84ff;color:#fff' : (ci.sc === 'SC2' ? 'background:var(--color-surface-2,#e5e7eb);color:#374151' : 'background:transparent;color:#9ca3af');
    const openPRs = (m ? m.problemReports : []).filter(pr => pr.againstCiId === ci.ciId && pr.status !== 'closed').length;
    let flags = '';
    if (comp) flags += ' <span class="cm-badge comp" title="Compromised — Golden-Thread finding">⚠</span>';
    if (obs) flags += ' <span class="cm-badge obs" title="' + _esc((st && st.obsoleteReason) || 'obsolete') + '">⟳</span>';
    if (openPRs) flags += ' <span class="cm-badge pr">PR' + openPRs + '</span>';
    const action = (locked && !obs)
        ? '<span title="SC1 baselined — change via PR → ECN" style="font-size:11px;color:var(--color-text-tertiary,#888)">🔒 locked</span>'
        : '<button class="cm-btn ' + (obs ? '' : 'sec') + '" data-establish="' + _esc(ci.ciId) + '" style="padding:2px 8px;font-size:11px;">' + (st ? 'Re-baseline' : 'Establish') + '</button>';
    return '<div class="cm-leaf"><div class="nm">' + _esc(ci.name) + (locked ? ' 🔒' : '') + flags + '<span class="id">' + _esc(ci.ciId) + '</span></div>' +
        '<div class="cm-col">' + _esc(ci.fdal || '—') + '</div>' +
        '<div class="cm-col">' + ((ci.sc === 'SC1' || ci.sc === 'SC2')
            ? '<span class="cm-sc" data-sc="' + ci.sc + '" data-ci="' + _esc(ci.ciId) + '" title="What ' + ci.sc + ' requires for compliance — click" style="' + scCls + ';padding:1px 7px;border-radius:9px;font-weight:600;font-size:11px;cursor:pointer;">' + ci.sc + '</span>'
            : '<span style="color:#9ca3af;font-size:11px;">—</span>') + '</div>' +
        '<div class="cm-col">' + _esc(ver) + '</div>' +
        '<div class="cm-col" style="text-align:right;">' + action + '</div></div>';
}
function _treeHtml(node, depth, m, parentPath) {
    let html = '';
    node.children.forEach(child => {
        const cp = parentPath.concat([child.name]); const leaves = _descLeaves(child); const st = _bucketStats(leaves, m);
        let badges = '<span class="cm-bk-count">' + st.n + ' item' + (st.n !== 1 ? 's' : '') + (st.base ? ' · ' + st.base + ' baselined' : '') + '</span>';
        if (st.comp) badges += '<span class="cm-badge comp">⚠ ' + st.comp + '</span>';
        if (st.obs) badges += '<span class="cm-badge obs">⟳ ' + st.obs + '</span>';
        html += '<details class="cm-bucket"' + (depth === 0 ? ' open' : '') + '>' +
            '<summary><span class="cm-bk-name">' + _esc(child.name) + '</span>' + badges +
            '<button class="cm-btn sec cm-bucket-base" data-bucket="' + _esc(cp.join(SEP)) + '" title="Establish/re-baseline every item in this bucket">Baseline all</button></summary>' +
            '<div class="cm-inner">' + _treeHtml(child, depth + 1, m, cp) + '</div></details>';
    });
    if (node.leaves.length) html += '<div class="cm-leaves">' + node.leaves.map(ci => _leafHtml(ci, m)).join('') + '</div>';
    return html;
}
function _treeRootHtml() { const m = _cm(); return '<div class="cm-tree">' + _treeHtml(_buildTree(enumerateCIs()), 0, m, []) + '</div>'; }

function exportIndexPDF() {
    try {
        const rows = enumerateCIs().slice().sort((a, b) => (a.path.join('/') + a.name).localeCompare(b.path.join('/') + b.name));
        if (typeof _loadJsPDF === 'function') {
            _loadJsPDF().then(() => {
                const jsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF; const doc = new jsPDF({ unit: 'pt', format: 'letter' });
                doc.setFontSize(14); doc.text('Configuration Index', 40, 40); doc.setFontSize(8); let y = 62; let lastBucket = '';
                rows.forEach(r => {
                    if (y > 750) { doc.addPage(); y = 40; }
                    const bk = r.path.join(' › ');
                    if (bk !== lastBucket) { lastBucket = bk; doc.setFont(undefined, 'bold'); doc.text(bk.slice(0, 90), 40, y); doc.setFont(undefined, 'normal'); y += 12; }
                    const st = _ciState(r.ciId); const flags = (r.compromised ? 'COMPROMISED ' : '') + (st && st.obsolete ? 'OBSOLETE' : '');
                    doc.text(String(r.name).slice(0, 60), 54, y); doc.text(String(r.fdal || '—'), 380, y); doc.text(String(r.sc || '—'), 410, y);
                    doc.text(String((st && st.version) || '—'), 450, y); doc.text(flags, 490, y); y += 11;
                });
                if (typeof _savePdf === 'function') _savePdf(doc, 'Configuration_Index.pdf'); else doc.save('Configuration_Index.pdf');
            });
        } else { _toast('PDF export unavailable.', 'warning'); }
    } catch (e) { _toast('Export failed: ' + e, 'warning'); }
}

// ── SC compliance modal (what an SC1/SC2 item needs, with this item's live status) ──
function _scModal(sc, ciId) {
    _style();
    const m = _cm(); const ci = enumerateCIs().find(c => c.ciId === ciId) || { ciId, name: ciId, fdal: '—' };
    const st = _ciState(ciId); const baselined = !!st, locked = !!(st && st.locked), obs = !!(st && st.obsolete);
    const openPRs = (m ? m.problemReports : []).filter(p => p.againstCiId === ciId && p.status !== 'closed').length;
    const audit = !!(m && m.auditLocation === 'cloud');
    const DONE = '<span style="color:#1a9d4b;font-weight:700;">✓</span>', TODO = '<span style="color:#9aa0a6;font-weight:700;">○</span>', WARN = '<span style="color:#b45309;font-weight:700;">⚠</span>';
    let rows, intro;
    if (sc === 'SC1') {
        intro = "SC1 applies the full configuration-management set: identification, baselining, problem reporting, change control, change review, status accounting, and protected archival.";
        rows = [
            [DONE, "Configuration identification", "Unique identifier and revision — assigned automatically. This item is " + _esc(ciId) + "."],
            [baselined ? DONE : TODO, "Baseline establishment", baselined ? ("Baselined at v" + st.version + " with a content hash.") : "Not yet baselined — use Establish on the row to capture v1.0 and a content hash."],
            [DONE, "Problem reporting", openPRs ? (openPRs + " open problem report" + (openPRs > 1 ? "s" : "") + " against this item.") : "Record issues as Problem Reports rather than editing a baselined item directly."],
            [(baselined && locked) ? DONE : TODO, "Change control", baselined ? (locked ? "Locked — change only via Problem Report → Engineering Change Notice, which rolls a new minor version." : "Baselined; locks as an SC1 item.") : "Establish the baseline to bring the item under change control."],
            [obs ? WARN : DONE, "Change review & impact", obs ? "An upstream input changed — this item is OBSOLETE and must be reviewed and re-baselined." : "Re-baselining flags every connected downstream analysis, so no stale work is missed."],
            [baselined ? DONE : TODO, "Status accounting & traceability", baselined ? ("Version history retained (" + ((st.history || []).length) + " entr" + (((st.history || []).length) === 1 ? "y" : "ies") + "); golden-thread links tracked.") : "Begins once a baseline exists."],
            [audit ? DONE : TODO, "Protection, archive & release", audit ? "Tamper-evident, hash-chained audit store is enabled." : "Held with the project. Enable the tamper-evident audit store for full SC1 protection."],
        ];
    } else if (sc === 'SC2') {
        intro = "SC2 applies a reduced set: identification, protection, and archival. Baselining and formal change control are not required at SC2 (but remain available).";
        rows = [
            [DONE, "Configuration identification", "Unique identifier and revision — assigned automatically. This item is " + _esc(ciId) + "."],
            [DONE, "Protection / data integrity", "Guarded against unauthorized or unintended change and kept retrievable."],
            [baselined ? DONE : TODO, "Archive & retrieval", baselined ? ("Snapshot retained at v" + st.version + ".") : "Retained with the project; baselining is optional at SC2."],
        ];
    } else {
        intro = "No development-assurance configuration-management obligation applies at this assurance level.";
        rows = [[DONE, "No control obligation", "Nothing further is required."]];
    }
    const bg = document.createElement('div'); bg.className = 'cm-modal-bg';
    bg.innerHTML = '<div class="cm-modal"><button class="close" type="button">Close ✕</button>' +
        '<h3>' + _esc(sc) + ' — configuration-management compliance</h3>' +
        '<p class="sub">' + _esc(ci.name || ciId) + '</p>' +
        '<p style="font-size:13px;margin:0 0 6px;">' + intro + '</p>' +
        rows.map(r => '<div class="chk"><div class="mk">' + r[0] + '</div><div class="t"><b>' + _esc(r[1]) + '</b>' + _esc(r[2]) + '</div></div>').join('') +
        '<p class="sub" style="margin-top:14px;">System Control Category per ARP 4754B §5.6 — derived from the item’s FDAL (' + _esc(ci.fdal || '—') + ').</p>' +
        '</div>';
    const close = () => { try { document.body.removeChild(bg); } catch (_) {} document.removeEventListener('keydown', esc); };
    const esc = e => { if (e.key === 'Escape') close(); };
    bg.addEventListener('click', e => { if (e.target === bg) close(); });
    const cb = bg.querySelector('.close'); if (cb) cb.addEventListener('click', close);
    document.addEventListener('keydown', esc);
    document.body.appendChild(bg);
}

// ── UI ───────────────────────────────────────────────────────────────────────
function _style() {
    if (document.getElementById('cm-style')) return;
    const s = document.createElement('style'); s.id = 'cm-style';
    s.textContent =
        '.cm-view{max-width:none;width:100%}' +
        '.cm-btn{background:#0a84ff;color:#fff;border:none;border-radius:7px;padding:7px 13px;font-size:13px;cursor:pointer}' +
        '.cm-btn.sec{background:var(--color-surface-2,#eef);color:var(--color-text,#111)}' +
        '.cm-bl{padding:6px 10px;border:1px solid var(--border-primary,#e5e7eb);border-radius:7px;margin-bottom:6px;font-size:13px}' +
        '.cm-tree{font-size:13px}' +
        '.cm-bucket{border:1px solid var(--border-primary,#e5e7eb);border-radius:6px;margin:0 0 4px}' +
        '.cm-bucket>summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--color-surface-2,#f3f4f6);font-weight:600}' +
        '.cm-bucket>summary::-webkit-details-marker{display:none}' +
        '.cm-bucket>summary:before{content:"\\25B8";color:#999;transition:transform .15s}' +
        '.cm-bucket[open]>summary:before{transform:rotate(90deg)}' +
        '.cm-bk-name{font-size:13px}.cm-bk-count{font-weight:400;color:var(--color-text-tertiary,#888);font-size:12px}' +
        '.cm-badge{font-size:11px;font-weight:700;padding:0 6px;border-radius:9px}' +
        '.cm-badge.comp{color:#d4453a}.cm-badge.obs{color:#b45309}.cm-badge.pr{color:#b45309}' +
        '.cm-bucket-base{margin-left:auto;padding:2px 9px!important;font-size:11px!important}' +
        '.cm-inner{padding:4px 6px 6px 16px}' +
        '.cm-leaf{display:grid;grid-template-columns:1fr 48px 64px 70px 104px;align-items:center;gap:8px;padding:4px 6px;border-bottom:1px solid var(--border-primary,#f0f0f0)}' +
        '.cm-leaf:last-child{border-bottom:none}.cm-leaf .nm{font-size:12px;line-height:1.3}' +
        '.cm-leaf .id{font-family:var(--font-mono,monospace);font-size:10px;color:#9aa0a6;display:block}' +
        '.cm-col{text-align:center;font-size:11px;color:var(--color-text-secondary,#555)}' +
        '.cm-legend{display:grid;grid-template-columns:1fr 48px 64px 70px 104px;gap:8px;padding:2px 6px;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#9aa0a6}' +
        '.cm-sc:hover{outline:2px solid rgba(10,132,255,.4);outline-offset:1px}' +
        '.cm-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:99999}' +
        '.cm-modal{background:var(--color-surface,#fff);color:var(--color-text,#111);max-width:660px;width:92%;max-height:85vh;overflow:auto;border-radius:12px;padding:22px 24px;box-shadow:0 20px 60px rgba(0,0,0,.35)}' +
        '.cm-modal h3{margin:0 0 2px;font-size:18px}.cm-modal .sub{color:var(--color-text-secondary,#666);font-size:12px;margin:0 0 12px}' +
        '.cm-modal .chk{display:flex;gap:10px;padding:9px 0;border-top:1px solid var(--border-primary,#eee);font-size:13px;align-items:flex-start}' +
        '.cm-modal .chk .mk{flex:0 0 auto;width:16px;text-align:center}.cm-modal .chk .t b{display:block;margin-bottom:1px}' +
        '.cm-modal .close{float:right;cursor:pointer;border:none;background:var(--color-surface-2,#eef);color:var(--color-text,#111);border-radius:7px;padding:5px 10px;font-size:13px}';
    document.head.appendChild(s);
}
function render(host) {
    host = host || document.getElementById('view-cm'); if (!host) return;
    _style();
    if (!_proPlus()) { host.innerHTML = '<div class="cm-view"><h2>Configuration Management</h2><p style="color:var(--color-text-secondary,#666);">Configuration baselining (SC1/SC2) is a Pro+ feature.</p></div>'; return; }
    const m = _cm();
    const openPRs = (m && m.problemReports.filter(p => p.status !== 'closed')) || [];
    host.innerHTML =
        '<div class="cm-view">' +
        '<h2 style="margin:0 0 4px;">Configuration Management <span style="font-size:12px;font-weight:500;color:var(--color-text-tertiary,#888);">SC1/SC2 · ARP4754B §5.6</span></h2>' +
        '<p style="margin:0 0 14px;color:var(--color-text-secondary,#666);font-size:13px;">Every item of every assessment is captured as a configuration item with its own SC rating, in collapsible buckets. Each item baselines on its own row (SC1 locks on baseline); re-baselining obsoletes connected downstream analyses.</p>' +
        '<div style="margin-bottom:8px;display:flex;gap:8px;"><button class="cm-btn sec" id="cm-export">Export index (PDF)</button><button class="cm-btn sec" id="cm-base-all">Baseline everything</button></div>' +
        '<div class="cm-legend"><span>Configuration item</span><span class="cm-col">FDAL</span><span class="cm-col">SC</span><span class="cm-col">Ver</span><span class="cm-col" style="text-align:right;">Baseline</span></div>' +
        _treeRootHtml() +
        '<div class="cm-sect" style="margin-top:18px;"><h4 style="margin:0 0 8px;font-size:15px;">Problem reports / ECNs <span style="font-weight:400;color:var(--color-text-tertiary,#888);font-size:12px;">— SC1 items are hard-locked; change via PR → ECN</span></h4>' +
            '<div style="margin-bottom:6px;"><button class="cm-btn sec" id="cm-raise-pr">Raise problem report</button></div>' +
            (openPRs.length ? openPRs.map(p => '<div class="cm-bl">' + _esc(p.prId) + ' · ' + _esc(p.title || '(no title)') + ' · against ' + _esc(p.againstCiId) + ' · <em>' + _esc(p.status) + '</em> <button class="cm-btn sec" data-ecn="' + _esc(p.prId) + '" style="float:right;padding:2px 8px;">Raise ECN</button></div>').join('') : '<div style="color:var(--color-text-tertiary,#888);font-size:13px;">No open problem reports.</div>') +
        '</div></div>';
    const $ = sel => host.querySelector(sel);
    const exp = $('#cm-export'); if (exp) exp.addEventListener('click', exportIndexPDF);
    const ba = $('#cm-base-all'); if (ba) ba.addEventListener('click', () => { const r = establishAll(); const n = r.filter(Boolean).length; _toast('Baselined ' + n + ' items.', 'success'); render(host); });
    host.querySelectorAll('[data-establish]').forEach(btn => btn.addEventListener('click', () => {
        const rec = establishCIBaseline(btn.getAttribute('data-establish')); _toast(rec ? ('Baselined → v' + rec.version) : 'No change.', 'success'); render(host);
    }));
    host.querySelectorAll('.cm-sc').forEach(el => el.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation(); _scModal(el.getAttribute('data-sc'), el.getAttribute('data-ci'));
    }));
    host.querySelectorAll('.cm-bucket-base').forEach(btn => btn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        const key = btn.getAttribute('data-bucket'); const cis = enumerateCIs();
        const sel = cis.filter(ci => { const pj = (ci.path || []).join(SEP); return pj === key || pj.indexOf(key + SEP) === 0; });
        let n = 0; sel.forEach(ci => { if (establishCIBaseline(ci.ciId, { cis })) n++; });
        _toast('Baselined ' + n + ' item' + (n !== 1 ? 's' : '') + ' in ' + key.split(SEP).pop(), 'success'); render(host);
    }));
    const rp = $('#cm-raise-pr'); if (rp) rp.addEventListener('click', () => {
        const cis = enumerateCIs(); const ciId = (typeof prompt === 'function') ? prompt('Configuration item ID to raise a PR against (e.g. ' + (cis[0] ? cis[0].ciId : 'fta:...') + '):', cis[0] ? cis[0].ciId : '') : '';
        if (!ciId) return; const title = (typeof prompt === 'function') ? prompt('Problem report title:') : 'issue'; if (title == null) return;
        raisePR({ againstCiId: ciId, title: title }); _toast('Problem report raised.', 'success'); render(host);
    });
    host.querySelectorAll('[data-ecn]').forEach(btn => btn.addEventListener('click', () => {
        const prId = btn.getAttribute('data-ecn'); const reason = (typeof prompt === 'function') ? prompt('ECN reason / change description:') : ''; if (reason == null) return;
        raiseECN({ prId: prId, reason: reason, description: reason }); _toast('ECN raised; CI baseline rolled, downstream obsoleted.', 'success'); render(host);
    }));
}
function open() { try { if (typeof switchTab === 'function') { switchTab('cm'); return; } } catch (_) {} render(); }

// ── expose ──────────────────────────────────────────────────────────────────
window.SafetyLabCM = {
    open: open, render: render,
    enumerateCIs: enumerateCIs, deriveSC: deriveSC,
    establishCIBaseline: establishCIBaseline, establishAll: establishAll,
    isLocked: isLocked, isObsolete: isObsolete,
    raisePR: raisePR, raiseECN: raiseECN,
    exportIndexPDF: exportIndexPDF, _cm: _cm
};

})();
